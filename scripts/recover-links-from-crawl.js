#!/usr/bin/env node
/**
 * Crawl-assisted link recovery
 *
 * Loads normalized crawl result files and ranks likely replacement URLs for a
 * broken catalog service. The module is designed for catalog-agent.js but also
 * exposes a small CLI for debugging candidate scoring.
 */

const fs = require('fs');
const path = require('path');

const AUTO_APPLY_THRESHOLD = 0.85;
const SUGGESTION_THRESHOLD = 0.6;
const MAX_SUGGESTIONS = 3;

const STOPWORDS = new Set([
  'and',
  'apply',
  'colorado',
  'for',
  'from',
  'get',
  'guide',
  'how',
  'information',
  'learn',
  'more',
  'online',
  'page',
  'program',
  'service',
  'services',
  'state',
  'the',
  'this',
  'with',
  'your',
]);

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return String(url || '').toLowerCase().replace(/\/$/, '');
  }
}

function getBaseDomain(hostname) {
  const parts = String(hostname || '').split('.');
  if (parts.length >= 3) {
    const lastThree = parts.slice(-3).join('.');
    if (lastThree.match(/\.(state\.co\.us|co\.us)$/)) {
      return parts.slice(-4).join('.');
    }
  }
  return parts.slice(-2).join('.');
}

function pathSegments(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean);
  } catch {
    return String(url || '').split('/').filter(Boolean);
  }
}

function similarityScore(urlA, urlB) {
  const a = pathSegments(urlA);
  const b = pathSegments(urlB);
  if (a.length === 0 || b.length === 0) return 0;

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size || 1;

  const prefixScore = prefix / Math.max(a.length, b.length);
  const jaccard = intersection / union;
  return (0.6 * prefixScore) + (0.4 * jaccard);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token));
}

function tokenOverlapScore(leftText, rightText) {
  const left = new Set(tokenize(leftText));
  const right = new Set(tokenize(rightText));
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection++;
  }

  const coverage = intersection / left.size;
  const jaccard = intersection / new Set([...left, ...right]).size;
  return (0.7 * coverage) + (0.3 * jaccard);
}

function findFilesRecursive(rootDir, predicate) {
  const matches = [];

  function visit(currentPath) {
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        visit(path.join(currentPath, entry));
      }
      return;
    }

    if (predicate(currentPath)) {
      matches.push(currentPath);
    }
  }

  visit(rootDir);
  return matches.sort();
}

function isNormalizedCrawlFile(filePath) {
  const base = path.basename(filePath);
  return base.startsWith('crawl-normalized-')
    && base.endsWith('.json')
    && !base.endsWith('-summary.json');
}

function isWithinLookback(crawledAt, lookbackDays) {
  if (!lookbackDays || lookbackDays <= 0) return true;
  const date = new Date(crawledAt);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
  return date.getTime() >= cutoff;
}

function loadNormalizedCrawlResults(resultsDir, options = {}) {
  const lookbackDays = options.lookbackDays || 7;
  if (!resultsDir || !fs.existsSync(resultsDir)) {
    return [];
  }

  const files = findFilesRecursive(resultsDir, isNormalizedCrawlFile);
  const deduped = new Map();

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      continue;
    }

    if (!Array.isArray(parsed)) {
      continue;
    }

    for (const record of parsed) {
      if (!record || typeof record !== 'object' || !record.url) continue;
      if (!isWithinLookback(record.crawledAt, lookbackDays)) continue;

      const key = normalizeUrl(record.url);
      const existing = deduped.get(key);
      const recordTime = new Date(record.crawledAt).getTime() || 0;
      const existingTime = existing ? (new Date(existing.crawledAt).getTime() || 0) : -1;

      if (!existing || recordTime >= existingTime) {
        deduped.set(key, record);
      }
    }
  }

  return [...deduped.values()];
}

function buildRecoveryIndex(records) {
  const byHost = new Map();
  const byBaseDomain = new Map();

  for (const record of records) {
    if (!record.host) continue;

    if (!byHost.has(record.host)) byHost.set(record.host, []);
    byHost.get(record.host).push(record);

    const baseDomain = getBaseDomain(record.host);
    if (baseDomain) {
      if (!byBaseDomain.has(baseDomain)) byBaseDomain.set(baseDomain, []);
      byBaseDomain.get(baseDomain).push(record);
    }
  }

  return {
    records,
    byHost,
    byBaseDomain,
  };
}

function describeHostRelationship(originalHost, candidateHost) {
  if (!candidateHost) return 0;
  if (originalHost === candidateHost) return 1;
  if (getBaseDomain(originalHost) === getBaseDomain(candidateHost)) return 0.75;
  return 0;
}

function computeSignalScore(record) {
  const signals = record.signals || {};
  let score = 0;
  if (signals.servicePatternMatch) score += 0.25;
  if (signals.hasTitle) score += 0.2;
  if (signals.hasMarkdown) score += 0.2;
  if ((signals.contentLength || 0) >= 400) score += 0.2;
  if (signals.isColoradoGov) score += 0.15;
  return Math.min(1, score);
}

function isCandidateViable(record) {
  if (!record || !record.url || !record.host) return false;
  if (record.status !== 'completed') return false;
  if (record.httpStatus && record.httpStatus >= 400) return false;

  const signals = record.signals || {};
  if (!signals.hasTitle && !signals.hasMarkdown) return false;
  return true;
}

function scoreRecoveryCandidate(service, record) {
  const sourceName = service.name?.en || service.name || '';
  const sourceDescription = service.description?.en || service.description || '';
  const sourceText = `${sourceName}\n${sourceDescription}`.trim();
  const hostScore = describeHostRelationship(new URL(service.url).hostname, record.host);
  const pathScore = similarityScore(service.url, record.url);
  const titleScore = tokenOverlapScore(sourceName, record.title || '');
  const contentScore = tokenOverlapScore(sourceText, record.markdown || '');
  const signalScore = computeSignalScore(record);

  if (hostScore === 0 && pathScore < 0.55 && titleScore < 0.45) {
    return null;
  }

  let score = 0;
  score += pathScore * 0.45;
  score += titleScore * 0.25;
  score += contentScore * 0.12;
  score += hostScore * 0.12;
  score += signalScore * 0.06;

  if (record.signals?.hasTitle && titleScore >= 0.55) {
    score += 0.04;
  }

  if (!record.signals?.servicePatternMatch && pathScore < 0.45 && titleScore < 0.45) {
    score -= 0.08;
  }

  score = Math.max(0, Math.min(0.99, score));

  return {
    url: record.url,
    title: record.title || null,
    score,
    confidence: score,
    status: record.status,
    crawledAt: record.crawledAt,
    seedId: record.seedId || null,
    profile: record.profile || null,
    host: record.host,
    pathScore,
    titleScore,
    contentScore,
    hostScore,
    signalScore,
    contentLength: record.signals?.contentLength || 0,
    servicePatternMatch: !!record.signals?.servicePatternMatch,
  };
}

function recoverServiceFromCrawl(service, crawlIndex, options = {}) {
  if (!service || !service.url || !crawlIndex) {
    return { suggestions: [], bestCandidate: null, autoApply: false };
  }

  let originalHost;
  try {
    originalHost = new URL(service.url).hostname;
  } catch {
    return { suggestions: [], bestCandidate: null, autoApply: false };
  }

  const baseDomain = getBaseDomain(originalHost);
  const candidates = [];
  const seen = new Set();
  const existingUrls = options.existingUrls || new Set();

  const pools = [
    ...(crawlIndex.byHost.get(originalHost) || []),
    ...(crawlIndex.byBaseDomain.get(baseDomain) || []),
  ];

  for (const record of pools) {
    if (!isCandidateViable(record)) continue;

    const normalized = normalizeUrl(record.url);
    if (normalized === normalizeUrl(service.url)) continue;
    if (seen.has(normalized)) continue;
    if (existingUrls.has(normalized)) continue;
    seen.add(normalized);

    const scored = scoreRecoveryCandidate(service, record);
    if (scored) {
      candidates.push(scored);
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.pathScore - a.pathScore || b.titleScore - a.titleScore);
  const suggestions = candidates.slice(0, options.maxSuggestions || MAX_SUGGESTIONS);
  const bestCandidate = suggestions[0] || null;

  return {
    suggestions,
    bestCandidate,
    autoApply: !!bestCandidate && bestCandidate.score >= AUTO_APPLY_THRESHOLD,
    suggestOnly: !!bestCandidate && bestCandidate.score >= SUGGESTION_THRESHOLD,
  };
}

function parseArgs(argv) {
  const args = {
    crawlResultsDir: null,
    url: null,
    name: null,
    description: null,
    lookbackDays: 7,
    limit: MAX_SUGGESTIONS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--crawl-results-dir') {
      args.crawlResultsDir = argv[++i];
    } else if (arg === '--url') {
      args.url = argv[++i];
    } else if (arg === '--name') {
      args.name = argv[++i];
    } else if (arg === '--description') {
      args.description = argv[++i];
    } else if (arg === '--lookback-days') {
      args.lookbackDays = parseInt(argv[++i], 10) || args.lookbackDays;
    } else if (arg === '--limit') {
      args.limit = parseInt(argv[++i], 10) || args.limit;
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.crawlResultsDir || !args.url) {
    console.error('Usage: node scripts/recover-links-from-crawl.js --crawl-results-dir ./crawl-data --url https://example.gov/path [--name "Service name"] [--description "Service description"]');
    process.exit(1);
  }

  const records = loadNormalizedCrawlResults(args.crawlResultsDir, { lookbackDays: args.lookbackDays });
  const crawlIndex = buildRecoveryIndex(records);
  const result = recoverServiceFromCrawl({
    url: args.url,
    name: { en: args.name || '' },
    description: { en: args.description || '' },
  }, crawlIndex, { maxSuggestions: args.limit });

  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  AUTO_APPLY_THRESHOLD,
  SUGGESTION_THRESHOLD,
  buildRecoveryIndex,
  getBaseDomain,
  loadNormalizedCrawlResults,
  normalizeUrl,
  recoverServiceFromCrawl,
  similarityScore,
};

if (require.main === module) {
  main();
}
