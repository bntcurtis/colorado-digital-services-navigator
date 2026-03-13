#!/usr/bin/env node
/**
 * Aggregate normalized crawl results into monthly discovery candidates.
 *
 * This is intentionally conservative: it only surfaces crawl pages that look
 * service-like and have enough title/content quality to be worth sending to the
 * metadata worker.
 */

const {
  loadNormalizedCrawlResults,
  normalizeUrl,
} = require('./recover-links-from-crawl');

const ACTION_PATTERN = /\b(apply|renew|replace|register|report|request|file|find|check|verify|pay|access|manage|schedule|submit|claim|benefits?|assistance|license|permit|portal)\b/i;
const EXCLUDE_TEXT_PATTERN = /\b(news|press release|contact us|privacy|terms|accessibility|home|homepage|sitemap|about us|careers?)\b/i;

function firstParagraph(markdown) {
  if (!markdown) return null;

  const blocks = String(markdown)
    .split(/\n\s*\n/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (block.startsWith('#')) continue;
    if (block.startsWith('*')) continue;
    if (block.length >= 80) {
      return block.slice(0, 280);
    }
  }

  return null;
}

function computeDiscoveryScore(record) {
  const signals = record.signals || {};
  const title = record.title || '';
  const markdown = record.markdown || '';
  const actionText = `${title}\n${markdown.slice(0, 800)}`;

  let score = 0;
  if (signals.servicePatternMatch) score += 0.28;
  if (signals.hasTitle) score += 0.16;
  if (signals.hasMarkdown) score += 0.14;
  if ((signals.contentLength || 0) >= 600) score += 0.16;
  else if ((signals.contentLength || 0) >= 300) score += 0.1;
  if (signals.isColoradoGov) score += 0.12;
  if (ACTION_PATTERN.test(actionText)) score += 0.16;
  if ((record.pathSegments || []).length >= 2) score += 0.06;

  if (EXCLUDE_TEXT_PATTERN.test(title) && !signals.servicePatternMatch) {
    score -= 0.25;
  }

  return Math.max(0, Math.min(0.99, score));
}

function isCandidateEligible(record, score) {
  if (!record || !record.url || !record.host) return false;
  if (record.status !== 'completed') return false;
  if (record.httpStatus && record.httpStatus >= 400) return false;

  const signals = record.signals || {};
  if (!signals.isColoradoGov) return false;
  if (!signals.hasTitle && !signals.hasMarkdown) return false;
  if ((signals.contentLength || 0) < 160) return false;
  if (score < 0.58) return false;

  return true;
}

function buildCrawlDiscoveryCandidates(resultsDir, options = {}) {
  const lookbackDays = options.lookbackDays || 30;
  const limit = options.limit || 30;
  const existingUrls = options.existingUrls || new Set();
  const records = loadNormalizedCrawlResults(resultsDir, { lookbackDays });
  const candidates = [];
  const seen = new Set();

  for (const record of records) {
    const normalized = normalizeUrl(record.url);
    if (seen.has(normalized)) continue;
    if (existingUrls.has(normalized)) continue;

    const discoveryScore = computeDiscoveryScore(record);
    if (!isCandidateEligible(record, discoveryScore)) continue;
    seen.add(normalized);

    candidates.push({
      url: record.url,
      title: record.title || null,
      description: firstParagraph(record.markdown),
      content: (record.markdown || '').slice(0, 1200),
      source: 'crawl',
      discoveryScore,
      crawledAt: record.crawledAt,
      signals: record.signals || {},
    });
  }

  candidates.sort((a, b) => b.discoveryScore - a.discoveryScore);
  return candidates.slice(0, limit);
}

function parseArgs(argv) {
  const args = {
    crawlResultsDir: null,
    lookbackDays: 30,
    limit: 30,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--crawl-results-dir') {
      args.crawlResultsDir = argv[++i];
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
  if (!args.crawlResultsDir) {
    console.error('Usage: node scripts/aggregate-crawl-results.js --crawl-results-dir ./crawl-data [--lookback-days 30] [--limit 30]');
    process.exit(1);
  }

  const candidates = buildCrawlDiscoveryCandidates(args.crawlResultsDir, {
    lookbackDays: args.lookbackDays,
    limit: args.limit,
  });

  console.log(JSON.stringify(candidates, null, 2));
}

module.exports = {
  buildCrawlDiscoveryCandidates,
  computeDiscoveryScore,
};

if (require.main === module) {
  main();
}
