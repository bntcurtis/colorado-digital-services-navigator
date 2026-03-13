#!/usr/bin/env node
/**
 * Catalog Agent
 *
 * - Checks links in the current catalog and repairs safe redirects
 * - Optionally discovers new services via recent crawl artifacts and sitemaps
 * - Generates bilingual metadata via a separate Gemini worker
 * - Writes a review report for human approval
 */

const fs = require('fs');
const path = require('path');
const { buildCrawlDiscoveryCandidates } = require('./aggregate-crawl-results');
const {
  buildRecoveryIndex,
  loadNormalizedCrawlResults,
  recoverServiceFromCrawl,
} = require('./recover-links-from-crawl');

const CONFIG = {
  catalogPath: path.join(__dirname, '..', 'service-catalog-v8.json'),
  schemaPath: path.join(__dirname, '..', 'service-schema-v3.json'),
  reportDir: path.join(__dirname, '..', 'reports'),
  timeout: 15000,
  linkConcurrency: 5,
  discoveryConcurrency: 3,
  llmConcurrency: 2,
  userAgent: 'Colorado-Service-Navigator-CatalogAgent/1.0 (https://github.com/bntcurtis)',
  maxSitemapUrls: 8000,
  sitemapRoots: [
    'https://www.colorado.gov/sitemap.xml',
    'https://cdhs.colorado.gov/sitemap.xml',
    'https://cdphe.colorado.gov/sitemap.xml',
    'https://cdle.colorado.gov/sitemap.xml',
    'https://dmv.colorado.gov/sitemap.xml',
    'https://tax.colorado.gov/sitemap.xml',
    'https://ag.colorado.gov/sitemap.xml',
    'https://dora.colorado.gov/sitemap.xml',
    'https://oit.colorado.gov/sitemap.xml',
    'https://hcpf.colorado.gov/sitemap.xml',
  ],
  servicePatterns: [
    /\/apply/i,
    /\/register/i,
    /\/renew/i,
    /\/file-/i,
    /\/request/i,
    /\/search/i,
    /\/find-/i,
    /\/lookup/i,
    /\/check-/i,
    /\/verify/i,
    /\/license/i,
    /\/permit/i,
    /\/benefits/i,
    /\/assistance/i,
    /\/services?\//i,
    /\/programs?\//i,
    /\/forms?\//i,
    /\/online-/i,
    /\/my-/i,
  ],
  excludePatterns: [
    /\/news/i,
    /\/press/i,
    /\/blog/i,
    /\/article/i,
    /\/about-us/i,
    /\/contact-us/i,
    /\/careers/i,
    /\/jobs/i,
    /\/staff/i,
    /\/team/i,
    /\/history/i,
    /\/privacy/i,
    /\/terms/i,
    /\/accessibility/i,
    /\/sitemap/i,
    /\.pdf$/i,
    /\.doc/i,
    /\.xls/i,
    /\.(jpg|png|gif|svg)$/i,
    /\/tag\//i,
    /\/category\//i,
    /\/author\//i,
    /\/page\/\d+/i,
    /\/\d{4}\/\d{2}\//i,
  ],
  soft404Patterns: [
    /page\s+(not\s+found|doesn't\s+exist|does\s+not\s+exist|has\s+been\s+removed)/i,
    /404\s*(error|page)?/i,
    /content\s+(not\s+found|unavailable|has\s+moved)/i,
    /this\s+page\s+(no\s+longer|is\s+no\s+longer|cannot\s+be\s+found)/i,
    /we\s+(couldn't|could\s+not|can't)\s+find/i,
    /the\s+requested\s+(page|resource|url)\s+(was\s+not|could\s+not|cannot)/i,
    /sorry.*?(not\s+found|doesn't\s+exist|no\s+longer\s+available)/i,
    /has\s+been\s+(moved|deleted|removed|archived)/i,
    /looking\s+for\s+something\?/i,
    /oops|uh\s*oh/i,
  ],
  soft404TitlePatterns: [
    /404/i,
    /not\s+found/i,
    /page\s+missing/i,
    /error/i,
  ],
};

function parseArgs(argv) {
  const args = {
    mode: 'weekly',
    limit: 30,
    crawlDiscovery: false,
    crawlDiscoveryLookbackDays: 30,
    crawlRecovery: false,
    crawlResultsDir: null,
    crawlLookbackDays: 7,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      args.mode = argv[i + 1] || args.mode;
      i++;
    } else if (arg.startsWith('--mode=')) {
      args.mode = arg.split('=')[1];
    } else if (arg === '--limit') {
      args.limit = parseInt(argv[i + 1], 10) || args.limit;
      i++;
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseInt(arg.split('=')[1], 10) || args.limit;
    } else if (arg === '--crawl-discovery') {
      args.crawlDiscovery = true;
    } else if (arg === '--crawl-discovery-lookback-days') {
      args.crawlDiscoveryLookbackDays = parseInt(argv[i + 1], 10) || args.crawlDiscoveryLookbackDays;
      i++;
    } else if (arg.startsWith('--crawl-discovery-lookback-days=')) {
      args.crawlDiscoveryLookbackDays = parseInt(arg.split('=')[1], 10) || args.crawlDiscoveryLookbackDays;
    } else if (arg === '--crawl-recovery') {
      args.crawlRecovery = true;
    } else if (arg === '--crawl-results-dir') {
      args.crawlResultsDir = argv[i + 1] || args.crawlResultsDir;
      i++;
    } else if (arg.startsWith('--crawl-results-dir=')) {
      args.crawlResultsDir = arg.split('=')[1];
    } else if (arg === '--crawl-lookback-days') {
      args.crawlLookbackDays = parseInt(argv[i + 1], 10) || args.crawlLookbackDays;
      i++;
    } else if (arg.startsWith('--crawl-lookback-days=')) {
      args.crawlLookbackDays = parseInt(arg.split('=')[1], 10) || args.crawlLookbackDays;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    }
  }

  if (!['weekly', 'monthly'].includes(args.mode)) {
    args.mode = 'weekly';
  }

  return args;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function getBaseDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const lastThree = parts.slice(-3).join('.');
    if (lastThree.match(/\.(state\.co\.us|co\.us)$/)) {
      return parts.slice(-4).join('.');
    }
  }
  return parts.slice(-2).join('.');
}

function isSuspiciousRedirect(originalUrl, finalUrl) {
  try {
    const originalHost = new URL(originalUrl).hostname;
    const finalHost = new URL(finalUrl).hostname;

    if (originalHost === finalHost) return false;

    const originalBase = getBaseDomain(originalHost);
    const finalBase = getBaseDomain(finalHost);
    if (originalBase === finalBase) return false;

    return true;
  } catch {
    return true;
  }
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function detectSoft404(html, title) {
  if (title) {
    for (const pattern of CONFIG.soft404TitlePatterns) {
      if (pattern.test(title)) {
        return { detected: true, reason: `Title contains 404 indicator: "${title}"` };
      }
    }
  }

  const contentSample = html.slice(0, 10000);
  for (const pattern of CONFIG.soft404Patterns) {
    const match = contentSample.match(pattern);
    if (match) {
      return { detected: true, reason: `Content contains: "${match[0]}"` };
    }
  }

  return { detected: false };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function checkUrl(url) {
  const startTime = Date.now();
  try {
    let usedGet = false;
    let response = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': CONFIG.userAgent },
    }, CONFIG.timeout);

    if (response.status === 405 || response.status === 403) {
      response = await fetchWithTimeout(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': CONFIG.userAgent },
      }, CONFIG.timeout);
      usedGet = true;
    }

    const elapsed = Date.now() - startTime;
    const finalUrl = response.url || url;

    if (!response.ok) {
      return {
        status: 'broken',
        httpStatus: response.status,
        reason: `HTTP ${response.status}`,
        finalUrl,
        elapsed,
      };
    }

    if (isSuspiciousRedirect(url, finalUrl)) {
      return {
        status: 'redirect_suspicious',
        httpStatus: response.status,
        reason: 'Redirected to different domain',
        finalUrl,
        elapsed,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      let html = '';
      if (usedGet) {
        html = await response.text();
      } else {
        const getResponse = await fetchWithTimeout(finalUrl, {
          method: 'GET',
          headers: { 'User-Agent': CONFIG.userAgent },
        }, CONFIG.timeout);
        html = await getResponse.text();
      }
      const title = extractTitle(html);
      const soft404 = detectSoft404(html, title);
      if (soft404.detected) {
        return {
          status: 'soft_404',
          httpStatus: response.status,
          reason: soft404.reason,
          finalUrl,
          elapsed,
        };
      }
    }

    return {
      status: 'ok',
      httpStatus: response.status,
      finalUrl: finalUrl !== url ? finalUrl : null,
      elapsed,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (error.name === 'AbortError') {
      return {
        status: 'timeout',
        reason: `Request timed out after ${CONFIG.timeout}ms`,
        elapsed,
      };
    }
    return {
      status: 'error',
      reason: error.message,
      elapsed,
    };
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    const normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}`;
    return normalized;
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

function pathSegments(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean);
  } catch {
    return url.split('/').filter(Boolean);
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

function looksLikeService(url) {
  const matchesService = CONFIG.servicePatterns.some(pattern => pattern.test(url));
  if (!matchesService) return false;
  const isExcluded = CONFIG.excludePatterns.some(pattern => pattern.test(url));
  if (isExcluded) return false;
  return true;
}

async function fetchSitemap(url, depth = 0) {
  if (depth > 2) return [];
  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': CONFIG.userAgent },
    }, CONFIG.timeout);

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const urls = [];

    const sitemapMatches = xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
    const childSitemaps = [...sitemapMatches].map(m => m[1].trim());

    if (childSitemaps.length > 0) {
      for (const childUrl of childSitemaps.slice(0, 10)) {
        const childUrls = await fetchSitemap(childUrl, depth + 1);
        urls.push(...childUrls);
      }
    } else {
      const urlMatches = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi);
      for (const match of urlMatches) {
        urls.push(match[1].trim());
        if (urls.length >= CONFIG.maxSitemapUrls) break;
      }
    }

    return urls;
  } catch {
    return [];
  }
}

function uniqueBy(array, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

async function fetchPageInfo(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': CONFIG.userAgent },
    }, CONFIG.timeout);

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();
    const title = extractTitle(html);

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : null;

    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim() : null;

    const paragraphs = [];
    const paragraphMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const match of paragraphMatches) {
      const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 40) {
        paragraphs.push(text);
      }
      if (paragraphs.length >= 3) break;
    }

    const contentParts = [];
    if (h1) contentParts.push(h1);
    contentParts.push(...paragraphs);

    const content = contentParts.join('\n').slice(0, 1200);

    return { url, title, description, content };
  } catch {
    return null;
  }
}

function parseSchemaEnums(schema) {
  const serviceDef = schema?.definitions?.Service?.properties || {};
  const lifeEvent = (serviceDef.lifeEvent?.enum || []).filter(v => v !== null);
  const taskType = (serviceDef.taskType?.enum || []).filter(v => v !== null);
  const audience = (serviceDef.audience?.enum || []).filter(v => v !== null);

  return { lifeEvent, taskType, audience };
}

function getKnownCategories(services) {
  const map = new Map();
  for (const service of services) {
    if (service.category?.en && service.category?.es) {
      map.set(service.category.en, service.category);
    }
  }
  return [...map.values()];
}

function getKnownDepartments(services) {
  const map = new Map();
  for (const service of services) {
    if (service.department?.en && service.department?.es) {
      const entry = {
        en: service.department.en,
        es: service.department.es,
        url: service.departmentUrl || null,
      };
      map.set(service.department.en, entry);
    }
  }
  return [...map.values()];
}

function sanitizeService(service, enums, known) {
  if (!service || typeof service !== 'object') return null;

  const cleaned = { ...service };

  function ensureLocalized(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.en !== 'string' || typeof obj.es !== 'string') return null;
    return { en: obj.en.trim(), es: obj.es.trim() };
  }

  cleaned.name = ensureLocalized(cleaned.name);
  cleaned.description = ensureLocalized(cleaned.description);
  cleaned.department = ensureLocalized(cleaned.department);
  cleaned.category = ensureLocalized(cleaned.category);

  if (!cleaned.name || !cleaned.description || !cleaned.department || !cleaned.category) {
    return null;
  }

  if (typeof cleaned.url !== 'string') {
    return null;
  }

  cleaned.departmentUrl = typeof cleaned.departmentUrl === 'string' ? cleaned.departmentUrl : null;
  cleaned.subcategory = typeof cleaned.subcategory === 'string' ? cleaned.subcategory : null;
  cleaned.lifeEvent = enums.lifeEvent.includes(cleaned.lifeEvent) ? cleaned.lifeEvent : null;
  cleaned.taskType = enums.taskType.includes(cleaned.taskType) ? cleaned.taskType : null;
  cleaned.audience = enums.audience.includes(cleaned.audience) ? cleaned.audience : null;
  cleaned.lifeEventDetail = typeof cleaned.lifeEventDetail === 'string' ? cleaned.lifeEventDetail : null;
  cleaned.taskDetail = typeof cleaned.taskDetail === 'string' ? cleaned.taskDetail : null;
  cleaned.audienceDetail = typeof cleaned.audienceDetail === 'string' ? cleaned.audienceDetail : null;

  if (!Array.isArray(cleaned.tags)) {
    cleaned.tags = [];
  } else {
    cleaned.tags = cleaned.tags.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean);
  }

  if (!cleaned.tags.length) {
    const tokens = cleaned.name.en.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
    cleaned.tags = [...new Set(tokens)].slice(0, 8);
  }

  cleaned.icon = typeof cleaned.icon === 'string' ? cleaned.icon : null;
  cleaned.featured = typeof cleaned.featured === 'boolean' ? cleaned.featured : false;

  if (!cleaned.departmentUrl) {
    const knownDept = known.departmentsByName.get(cleaned.department.en);
    if (knownDept && knownDept.url) {
      cleaned.departmentUrl = knownDept.url;
    }
  }

  return cleaned;
}

function computeServiceConfidence(service, signals) {
  let score = 0.35;
  if (signals.hasKnownDepartment) score += 0.15;
  if (signals.hasKnownCategory) score += 0.15;
  if (service.lifeEvent) score += 0.1;
  if (service.taskType) score += 0.1;
  if (service.audience) score += 0.05;
  if (service.tags && service.tags.length >= 3) score += 0.05;
  if (signals.hasDescription) score += 0.1;
  return Math.min(0.95, Math.max(0.1, score));
}

function confidenceLabel(score) {
  if (score >= 0.75) return 'High';
  if (score >= 0.55) return 'Medium';
  return 'Low';
}

function formatRecoveryReason(candidate) {
  return `Crawl recovery (score ${candidate.score.toFixed(2)}, path ${candidate.pathScore.toFixed(2)}, title ${candidate.titleScore.toFixed(2)}, content ${candidate.contentScore.toFixed(2)})`;
}

function serializeRecoveryCandidate(candidate) {
  return {
    url: candidate.url,
    title: candidate.title,
    score: candidate.score,
    confidence: candidate.confidence,
    pathScore: candidate.pathScore,
    titleScore: candidate.titleScore,
    contentScore: candidate.contentScore,
    hostScore: candidate.hostScore,
    signalScore: candidate.signalScore,
    seedId: candidate.seedId,
    profile: candidate.profile,
    crawledAt: candidate.crawledAt,
    contentLength: candidate.contentLength,
    servicePatternMatch: candidate.servicePatternMatch,
  };
}

function mergeDiscoveryCandidate(candidateMap, candidate) {
  const normalized = normalizeUrl(candidate.url);
  const existing = candidateMap.get(normalized);
  const candidateContent = candidate.content || '';

  if (!existing) {
    candidateMap.set(normalized, {
      ...candidate,
      sources: [candidate.source],
    });
    return;
  }

  const sources = new Set([...(existing.sources || []), candidate.source]);
  existing.sources = [...sources];
  existing.source = existing.sources.join('+');
  existing.discoveryScore = Math.max(existing.discoveryScore || 0, candidate.discoveryScore || 0);
  if (!existing.title && candidate.title) existing.title = candidate.title;
  if (!existing.description && candidate.description) existing.description = candidate.description;
  if (candidateContent && (!existing.content || existing.content.length < candidateContent.length)) {
    existing.content = candidateContent;
  }
}

function bumpVersion(version, type) {
  const parts = String(version).split('.').map(Number);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts.length > 2 ? parts[2] || 0 : null;

  if (type === 'minor') {
    const newMinor = minor + 1;
    return patch !== null ? `${major}.${newMinor}.0` : `${major}.${newMinor}`;
  }

  if (patch !== null) {
    return `${major}.${minor}.${patch + 1}`;
  }

  return `${major}.${minor}.1`;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = new Array(limit).fill(0).map(async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}

async function callCatalogWorker(payload, workerUrl, token) {
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker error ${response.status}: ${text}`);
  }

  return response.json();
}

async function attemptRepair(service, sitemapIndex, existingUrls, sitemapCache) {
  const originalUrl = service.url;

  const result = await checkUrl(originalUrl);

  if (result.status === 'ok' && result.finalUrl && !isSuspiciousRedirect(originalUrl, result.finalUrl)) {
    return {
      status: 'repaired',
      newUrl: result.finalUrl,
      reason: 'Safe redirect to same base domain',
      confidence: 0.9,
    };
  }

  if (result.status === 'ok') {
    return { status: 'ok' };
  }

  if (result.status === 'redirect_suspicious') {
    return {
      status: 'unresolved',
      reason: result.reason || 'Suspicious redirect',
      issue: result,
    };
  }

  const candidates = [];

  try {
    const parsed = new URL(originalUrl);
    const hostname = parsed.hostname;
    const hasWww = hostname.startsWith('www.');
    const baseHost = hasWww ? hostname.slice(4) : hostname;

    if (parsed.protocol === 'http:') {
      candidates.push({
        url: originalUrl.replace(/^http:/, 'https:'),
        reason: 'Upgrade to https',
        confidence: 0.65,
      });
    }

    if (hasWww) {
      candidates.push({
        url: originalUrl.replace(`//${hostname}`, `//${baseHost}`),
        reason: 'Remove www',
        confidence: 0.6,
      });
    } else {
      candidates.push({
        url: originalUrl.replace(`//${hostname}`, `//www.${hostname}`),
        reason: 'Add www',
        confidence: 0.6,
      });
    }

    if (parsed.pathname.endsWith('/')) {
      const trimmed = originalUrl.replace(/\/$/, '');
      candidates.push({
        url: trimmed,
        reason: 'Remove trailing slash',
        confidence: 0.6,
      });
    } else {
      candidates.push({
        url: `${originalUrl}/`,
        reason: 'Add trailing slash',
        confidence: 0.55,
      });
    }
  } catch {
    // ignore
  }

  const tested = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate.url);
    if (tested.has(normalized)) continue;
    tested.add(normalized);

    if (existingUrls.has(normalized)) {
      continue;
    }

    const check = await checkUrl(candidate.url);
    if (check.status === 'ok') {
      const finalUrl = check.finalUrl || candidate.url;
      if (isSuspiciousRedirect(candidate.url, finalUrl)) {
        continue;
      }
      return {
        status: 'repaired',
        newUrl: finalUrl,
        reason: candidate.reason,
        confidence: candidate.confidence,
      };
    }
  }

  const baseDomain = (() => {
    try {
      return getBaseDomain(new URL(originalUrl).hostname);
    } catch {
      return null;
    }
  })();

  let sitemapUrls = [];

  if (baseDomain && sitemapIndex.has(baseDomain)) {
    sitemapUrls = sitemapIndex.get(baseDomain);
  } else if (baseDomain && sitemapCache.has(baseDomain)) {
    sitemapUrls = sitemapCache.get(baseDomain);
  } else if (baseDomain) {
    const host = new URL(originalUrl).hostname;
    const roots = [
      `https://${host}/sitemap.xml`,
      `https://www.${host}/sitemap.xml`,
    ];
    const collected = [];
    for (const root of roots) {
      const urls = await fetchSitemap(root);
      if (urls.length) {
        collected.push(...urls);
        break;
      }
    }
    sitemapUrls = collected;
    sitemapCache.set(baseDomain, sitemapUrls);
  }

  if (sitemapUrls.length) {
    const scored = sitemapUrls.map(url => ({
      url,
      score: similarityScore(originalUrl, url),
    })).sort((a, b) => b.score - a.score).slice(0, 5);

    for (const candidate of scored) {
      if (candidate.score < 0.55) continue;
      const normalized = normalizeUrl(candidate.url);
      if (existingUrls.has(normalized)) continue;

      const check = await checkUrl(candidate.url);
      if (check.status === 'ok') {
        const finalUrl = check.finalUrl || candidate.url;
        if (isSuspiciousRedirect(candidate.url, finalUrl)) {
          continue;
        }
        const confidence = Math.min(0.85, 0.55 + candidate.score * 0.4);
        return {
          status: 'repaired',
          newUrl: finalUrl,
          reason: `Sitemap match (score ${candidate.score.toFixed(2)})`,
          confidence,
        };
      }
    }
  }

  return {
    status: 'unresolved',
    reason: result.reason || result.status,
    issue: result,
  };
}

function generateReport(changes, stats, mode) {
  const lines = [];
  lines.push('# Catalog Agent Report');
  lines.push(`Generated: ${todayISO()}`);
  lines.push(`Mode: ${mode}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`- Services before: ${stats.beforeCount}`);
  lines.push(`- Services after: ${stats.afterCount}`);
  lines.push(`- New services: ${changes.newServices.length}`);
  lines.push(`- Link repairs: ${changes.linkRepairs.length}`);
  lines.push(`- Crawl recovery suggestions: ${changes.crawlRecoverySuggestions.length}`);
  lines.push(`- Unresolved issues: ${changes.unresolved.length}`);
  lines.push('');

  const grouped = {
    High: { repairs: [], additions: [] },
    Medium: { repairs: [], additions: [] },
    Low: { repairs: [], additions: [] },
  };

  for (const repair of changes.linkRepairs) {
    grouped[confidenceLabel(repair.confidence)].repairs.push(repair);
  }

  for (const addition of changes.newServices) {
    grouped[confidenceLabel(addition.confidence)].additions.push(addition);
  }

  for (const level of ['High', 'Medium', 'Low']) {
    const repairs = grouped[level].repairs;
    const additions = grouped[level].additions;
    if (!repairs.length && !additions.length) continue;

    lines.push(`## ${level} Confidence Changes`);

    if (repairs.length) {
      lines.push('### Link Repairs');
      for (const item of repairs) {
        lines.push(`- ID ${item.id}: ${item.name}`);
        lines.push(`  - Old URL: ${item.oldUrl}`);
        lines.push(`  - New URL: ${item.newUrl}`);
        lines.push(`  - Reason: ${item.reason}`);
        lines.push(`  - Confidence: ${item.confidence.toFixed(2)}`);
      }
      lines.push('');
    }

    if (additions.length) {
      lines.push('### New Services');
      for (const item of additions) {
        lines.push(`- ID ${item.id}: ${item.name}`);
        lines.push(`  - URL: ${item.url}`);
        lines.push(`  - Department: ${item.department}`);
        lines.push(`  - Category: ${item.category}`);
        if (item.source) {
          lines.push(`  - Source: ${item.source}`);
        }
        lines.push(`  - Confidence: ${item.confidence.toFixed(2)}`);
      }
      lines.push('');
    }
  }

  if (changes.crawlRecoverySuggestions.length) {
    lines.push('## Crawl Recovery Suggestions');
    for (const item of changes.crawlRecoverySuggestions) {
      lines.push(`- ID ${item.id}: ${item.name}`);
      lines.push(`  - URL: ${item.url}`);
      lines.push(`  - Issue: ${item.status}`);
      if (item.reason) {
        lines.push(`  - Details: ${item.reason}`);
      }
      if (item.blockedByServiceId) {
        lines.push(`  - Blocked: Candidate URL already used by service ID ${item.blockedByServiceId}`);
      }
      for (const candidate of item.candidates || []) {
        lines.push(`  - Candidate: ${candidate.url}`);
        if (candidate.title) {
          lines.push(`    - Title: ${candidate.title}`);
        }
        lines.push(`    - Score: ${candidate.score.toFixed(2)} (${confidenceLabel(candidate.score)})`);
        lines.push(`    - Breakdown: path ${candidate.pathScore.toFixed(2)}, title ${candidate.titleScore.toFixed(2)}, content ${candidate.contentScore.toFixed(2)}`);
      }
    }
    lines.push('');
  }

  if (changes.unresolved.length) {
    lines.push('## Unresolved Issues (Needs Review)');
    for (const item of changes.unresolved) {
      lines.push(`- ID ${item.id}: ${item.name}`);
      lines.push(`  - URL: ${item.url}`);
      lines.push(`  - Issue: ${item.status}`);
      if (item.reason) {
        lines.push(`  - Details: ${item.reason}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const catalogRaw = fs.readFileSync(CONFIG.catalogPath, 'utf-8');
  const catalog = JSON.parse(catalogRaw);
  const originalCatalogJson = JSON.stringify(catalog, null, 2);

  const schemaRaw = fs.readFileSync(CONFIG.schemaPath, 'utf-8');
  const schema = JSON.parse(schemaRaw);
  const enums = parseSchemaEnums(schema);

  const existingUrls = new Set();
  const urlToServiceId = new Map();
  const servicesById = new Map();
  for (const service of catalog.services) {
    const normalized = normalizeUrl(service.url);
    existingUrls.add(normalized);
    if (!urlToServiceId.has(normalized)) {
      urlToServiceId.set(normalized, service.id);
    }
    if (service.departmentUrl) existingUrls.add(normalizeUrl(service.departmentUrl));
    servicesById.set(service.id, service);
  }

  const categories = getKnownCategories(catalog.services);
  const departments = getKnownDepartments(catalog.services);
  const departmentsByName = new Map(departments.map(d => [d.en, d]));

  const sitemapIndex = new Map();
  const sitemapCache = new Map();
  let crawlRecoveryIndex = null;
  let crawlDiscoveryCandidates = [];

  if (args.crawlRecovery) {
    if (args.crawlResultsDir && fs.existsSync(args.crawlResultsDir)) {
      const crawlRecords = loadNormalizedCrawlResults(args.crawlResultsDir, {
        lookbackDays: args.crawlLookbackDays,
      });
      if (crawlRecords.length) {
        crawlRecoveryIndex = buildRecoveryIndex(crawlRecords);
      }
      if (args.verbose) {
        console.error(`Loaded ${crawlRecords.length} crawl recovery records from ${args.crawlResultsDir}`);
      }
    } else if (args.verbose) {
      console.error(`Crawl recovery requested but results directory not found: ${args.crawlResultsDir || '(missing)'}`);
    }
  }

  if (args.mode === 'monthly' && args.crawlDiscovery) {
    if (args.crawlResultsDir && fs.existsSync(args.crawlResultsDir)) {
      crawlDiscoveryCandidates = buildCrawlDiscoveryCandidates(args.crawlResultsDir, {
        lookbackDays: args.crawlDiscoveryLookbackDays,
        limit: args.limit,
        existingUrls,
      });
      if (args.verbose) {
        console.error(`Loaded ${crawlDiscoveryCandidates.length} crawl discovery candidates from ${args.crawlResultsDir}`);
      }
    } else if (args.verbose) {
      console.error(`Crawl discovery requested but results directory not found: ${args.crawlResultsDir || '(missing)'}`);
    }
  }

  if (args.mode === 'monthly') {
    for (const root of CONFIG.sitemapRoots) {
      const urls = await fetchSitemap(root);
      for (const url of urls) {
        try {
          const base = getBaseDomain(new URL(url).hostname);
          if (!sitemapIndex.has(base)) sitemapIndex.set(base, []);
          sitemapIndex.get(base).push(url);
        } catch {
          // ignore
        }
      }
    }

    for (const [key, urls] of sitemapIndex.entries()) {
      sitemapIndex.set(key, uniqueBy(urls, u => u));
    }
  }

  const changes = {
    linkRepairs: [],
    crawlRecoverySuggestions: [],
    newServices: [],
    unresolved: [],
  };

  if (args.verbose) {
    console.error(`Checking ${catalog.services.length} catalog URLs...`);
  }

  const linkResults = await mapWithConcurrency(catalog.services, CONFIG.linkConcurrency, async (service) => {
    const result = await attemptRepair(service, sitemapIndex, existingUrls, sitemapCache);
    return { service, result };
  });

  for (const entry of linkResults) {
    const { service, result } = entry;
    if (result.status === 'repaired') {
      const normalizedNew = normalizeUrl(result.newUrl);
      const existingId = urlToServiceId.get(normalizedNew);
      if (existingId && existingId !== service.id) {
        changes.unresolved.push({
          id: service.id,
          name: service.name?.en || 'Unknown',
          url: service.url,
          status: 'conflict',
          reason: `Candidate URL already used by service ID ${existingId}`,
        });
        continue;
      }

      const oldUrl = service.url;
      service.url = result.newUrl;
      existingUrls.add(normalizeUrl(result.newUrl));
      urlToServiceId.delete(normalizeUrl(oldUrl));
      urlToServiceId.set(normalizedNew, service.id);

      changes.linkRepairs.push({
        id: service.id,
        name: service.name?.en || 'Unknown',
        oldUrl,
        newUrl: result.newUrl,
        reason: result.reason,
        confidence: result.confidence,
      });
    } else if (result.status === 'unresolved') {
      changes.unresolved.push({
        id: service.id,
        name: service.name?.en || 'Unknown',
        url: service.url,
        status: result.issue?.status || result.reason || 'unknown',
        reason: result.issue?.reason || result.reason,
      });
    }
  }

  if (args.crawlRecovery && crawlRecoveryIndex && crawlRecoveryIndex.records.length) {
    const remainingUnresolved = [];

    for (const item of changes.unresolved) {
      const service = servicesById.get(item.id);
      if (!service) {
        remainingUnresolved.push(item);
        continue;
      }

      const recovery = recoverServiceFromCrawl(service, crawlRecoveryIndex, {
        existingUrls,
      });

      if (!recovery.bestCandidate) {
        remainingUnresolved.push(item);
        continue;
      }

      const candidates = recovery.suggestions.map(serializeRecoveryCandidate);
      const best = candidates[0];
      const normalizedNew = normalizeUrl(best.url);
      const existingId = urlToServiceId.get(normalizedNew);

      if (recovery.autoApply && (!existingId || existingId === service.id)) {
        const oldUrl = service.url;
        service.url = best.url;
        existingUrls.add(normalizedNew);
        urlToServiceId.delete(normalizeUrl(oldUrl));
        urlToServiceId.set(normalizedNew, service.id);

        changes.linkRepairs.push({
          id: service.id,
          name: service.name?.en || 'Unknown',
          oldUrl,
          newUrl: best.url,
          reason: formatRecoveryReason(best),
          confidence: best.score,
          source: 'crawl_recovery',
          recovery: best,
        });
        continue;
      }

      if (recovery.suggestOnly) {
        changes.crawlRecoverySuggestions.push({
          ...item,
          kind: 'crawl-recovery-candidate',
          blockedByServiceId: existingId && existingId !== service.id ? existingId : null,
          candidates,
        });
      }

      remainingUnresolved.push(item);
    }

    changes.unresolved = remainingUnresolved;
  }

  if (args.mode === 'monthly') {
    const allSitemapUrls = [];
    for (const urls of sitemapIndex.values()) {
      allSitemapUrls.push(...urls);
    }

    const potential = [];
    const seen = new Set();
    for (const url of allSitemapUrls) {
      const normalized = normalizeUrl(url);
      if (existingUrls.has(normalized)) continue;
      if (seen.has(normalized)) continue;
      if (!looksLikeService(url)) continue;
      seen.add(normalized);
      potential.push(url);
    }

    const candidateMap = new Map();

    for (const candidate of crawlDiscoveryCandidates) {
      mergeDiscoveryCandidate(candidateMap, candidate);
    }

    const sitemapCandidates = await mapWithConcurrency(potential.slice(0, args.limit), CONFIG.discoveryConcurrency, async (url) => {
      const info = await fetchPageInfo(url);
      if (!info) return null;
      return {
        ...info,
        source: 'sitemap',
        discoveryScore: 0.6,
      };
    });

    for (const candidate of sitemapCandidates.filter(Boolean)) {
      mergeDiscoveryCandidate(candidateMap, candidate);
    }

    const validCandidates = [...candidateMap.values()]
      .sort((a, b) => (b.discoveryScore || 0) - (a.discoveryScore || 0))
      .slice(0, args.limit);

    const workerUrl = process.env.CATALOG_WORKER_URL;
    const workerToken = process.env.CATALOG_AGENT_TOKEN;

    if (!workerUrl || !workerToken) {
      throw new Error('Missing CATALOG_WORKER_URL or CATALOG_AGENT_TOKEN environment variables');
    }

    const constraints = {
      lifeEvent: enums.lifeEvent,
      taskType: enums.taskType,
      audience: enums.audience,
      categories,
      departments,
    };

    const nextIdStart = catalog.services.reduce((max, s) => Math.max(max, s.id || 0), 0) + 1;
    let nextId = nextIdStart;

    const llmResults = await mapWithConcurrency(validCandidates, CONFIG.llmConcurrency, async (candidate) => {
      const payload = {
        task: 'metadata',
        url: candidate.url,
        title: candidate.title,
        description: candidate.description,
        content: candidate.content,
        constraints,
      };

      try {
        const response = await callCatalogWorker(payload, workerUrl, workerToken);
        return { candidate, response };
      } catch (error) {
        return { candidate, error };
      }
    });

    for (const entry of llmResults) {
      const { candidate, response, error } = entry;
      if (error || !response || !response.service) {
        continue;
      }

      const known = { departmentsByName };
      const service = sanitizeService({ ...response.service, url: candidate.url }, enums, known);
      if (!service) {
        continue;
      }

      const normalized = normalizeUrl(service.url);
      if (existingUrls.has(normalized)) {
        continue;
      }

      const hasKnownDepartment = departmentsByName.has(service.department.en);
      const categoryMatch = categories.find(c => c.en === service.category.en);
      const confidence = computeServiceConfidence(service, {
        hasKnownDepartment,
        hasKnownCategory: !!categoryMatch,
        hasDescription: !!candidate.description || !!candidate.content,
      });

      service.id = nextId++;
      catalog.services.push(service);
      existingUrls.add(normalized);
      urlToServiceId.set(normalized, service.id);

      changes.newServices.push({
        id: service.id,
        name: service.name.en,
        url: service.url,
        department: service.department.en,
        category: service.category.en,
        source: candidate.source,
        confidence,
      });
    }
  }

  const beforeCount = catalog.serviceCount || catalog.services.length;
  const afterCount = catalog.services.length;

  const hasCatalogChanges = changes.linkRepairs.length || changes.newServices.length;
  const hasReportChanges = hasCatalogChanges || changes.unresolved.length || changes.crawlRecoverySuggestions.length;

  if (hasCatalogChanges) {
    const bumpType = changes.newServices.length ? 'minor' : 'patch';
    catalog.version = bumpVersion(catalog.version, bumpType);
    catalog.lastUpdated = todayISO();
    catalog.serviceCount = afterCount;

    if (!args.dryRun) {
      fs.writeFileSync(CONFIG.catalogPath, JSON.stringify(catalog, null, 2) + '\n');
    }
  }

  if (hasReportChanges && !args.dryRun) {
    fs.mkdirSync(CONFIG.reportDir, { recursive: true });
    const reportPath = path.join(CONFIG.reportDir, `catalog-diff-${todayISO()}.md`);
    const reportJsonPath = path.join(CONFIG.reportDir, `catalog-diff-${todayISO()}.json`);

    const report = generateReport(changes, { beforeCount, afterCount }, args.mode);
    fs.writeFileSync(reportPath, report + '\n');

    const jsonReport = {
      generated: todayISO(),
      mode: args.mode,
      summary: {
        beforeCount,
        afterCount,
        newServices: changes.newServices.length,
        linkRepairs: changes.linkRepairs.length,
        crawlRecoverySuggestions: changes.crawlRecoverySuggestions.length,
        unresolved: changes.unresolved.length,
      },
      linkRepairs: changes.linkRepairs,
      crawlRecoverySuggestions: changes.crawlRecoverySuggestions,
      newServices: changes.newServices,
      unresolved: changes.unresolved,
    };

    fs.writeFileSync(reportJsonPath, JSON.stringify(jsonReport, null, 2) + '\n');
  }

  if (!hasCatalogChanges && !hasReportChanges && args.verbose) {
    console.error('No catalog changes detected.');
  }

  const updatedCatalogJson = JSON.stringify(catalog, null, 2);
  if (args.verbose && originalCatalogJson !== updatedCatalogJson) {
    console.error('Catalog updated.');
  }
}

main().catch(err => {
  console.error('Catalog agent failed:', err.message);
  process.exit(1);
});
