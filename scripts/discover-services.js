#!/usr/bin/env node
/**
 * Colorado Service Navigator - Service Discovery Tool
 *
 * Crawls Colorado government sitemaps to find potential new services
 * that aren't yet in the catalog. Uses heuristics to identify pages
 * that look like citizen-facing services.
 *
 * Usage: node scripts/discover-services.js [--json] [--limit N]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  catalogPath: path.join(__dirname, '..', 'service-catalog-v8.json'),
  timeout: 30000,
  concurrency: 3,
  userAgent: 'Colorado-Service-Navigator-Discovery/1.0 (https://github.com/bntcurtis)',

  // Root sitemaps to check (these often contain sitemap indexes)
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

  // URL patterns that suggest a citizen-facing service
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

  // URL patterns to exclude (not services)
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
    /\/\d{4}\/\d{2}\//i, // Date-based URLs (blog posts)
  ],
};

// Parse args
const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const limitArg = args.find(a => a.startsWith('--limit'));
const urlLimit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1]) : 500;

/**
 * Fetch and parse a sitemap (handles both sitemap indexes and regular sitemaps)
 */
async function fetchSitemap(url, depth = 0) {
  if (depth > 2) return []; // Prevent infinite recursion

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': CONFIG.userAgent },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const urls = [];

    // Check if this is a sitemap index (contains other sitemaps)
    const sitemapMatches = xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
    const childSitemaps = [...sitemapMatches].map(m => m[1].trim());

    if (childSitemaps.length > 0) {
      // It's a sitemap index - recursively fetch child sitemaps
      for (const childUrl of childSitemaps.slice(0, 10)) { // Limit to avoid too many requests
        const childUrls = await fetchSitemap(childUrl, depth + 1);
        urls.push(...childUrls);
        await new Promise(r => setTimeout(r, 200)); // Rate limit
      }
    } else {
      // Regular sitemap - extract URLs
      const urlMatches = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi);
      for (const match of urlMatches) {
        urls.push(match[1].trim());
      }
    }

    return urls;
  } catch (error) {
    console.error(`Error fetching sitemap ${url}:`, error.message);
    return [];
  }
}

/**
 * Check if a URL looks like a citizen-facing service
 */
function looksLikeService(url) {
  // Must match at least one service pattern
  const matchesService = CONFIG.servicePatterns.some(pattern => pattern.test(url));
  if (!matchesService) return false;

  // Must not match any exclude pattern
  const isExcluded = CONFIG.excludePatterns.some(pattern => pattern.test(url));
  if (isExcluded) return false;

  return true;
}

/**
 * Normalize URL for comparison (remove trailing slash, lowercase, etc.)
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove trailing slash, lowercase host
    let normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}`;
    return normalized;
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Fetch page title and meta description for a URL
 */
async function fetchPageInfo(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': CONFIG.userAgent },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : null;

    return { title, description };
  } catch {
    return null;
  }
}

/**
 * Main entry point
 */
async function main() {
  // Load existing catalog
  const catalogRaw = fs.readFileSync(CONFIG.catalogPath, 'utf-8');
  const catalog = JSON.parse(catalogRaw);

  // Build a set of existing URLs (normalized)
  const existingUrls = new Set();
  for (const service of catalog.services) {
    existingUrls.add(normalizeUrl(service.url));
    if (service.departmentUrl) {
      existingUrls.add(normalizeUrl(service.departmentUrl));
    }
  }

  if (!outputJson) {
    console.error(`Loaded ${catalog.services.length} existing services`);
    console.error(`Crawling ${CONFIG.sitemapRoots.length} sitemaps...`);
  }

  // Crawl all sitemaps
  const allDiscoveredUrls = new Set();
  for (const sitemapUrl of CONFIG.sitemapRoots) {
    if (!outputJson) {
      console.error(`  Fetching ${sitemapUrl}...`);
    }
    const urls = await fetchSitemap(sitemapUrl);
    for (const url of urls) {
      allDiscoveredUrls.add(url);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!outputJson) {
    console.error(`Found ${allDiscoveredUrls.size} total URLs in sitemaps`);
  }

  // Filter to potential services
  const potentialServices = [];
  for (const url of allDiscoveredUrls) {
    const normalized = normalizeUrl(url);

    // Skip if already in catalog
    if (existingUrls.has(normalized)) continue;

    // Check if it looks like a service
    if (looksLikeService(url)) {
      potentialServices.push(url);
    }
  }

  if (!outputJson) {
    console.error(`Found ${potentialServices.length} potential new services`);
    console.error(`Fetching page info for top ${Math.min(urlLimit, potentialServices.length)}...`);
  }

  // Fetch page info for top candidates
  const candidates = [];
  const urlsToCheck = potentialServices.slice(0, urlLimit);

  for (let i = 0; i < urlsToCheck.length; i += CONFIG.concurrency) {
    const batch = urlsToCheck.slice(i, i + CONFIG.concurrency);
    const results = await Promise.all(batch.map(async url => {
      const info = await fetchPageInfo(url);
      return { url, ...info };
    }));

    for (const result of results) {
      if (result.title) {
        candidates.push(result);
      }
    }

    if (!outputJson) {
      process.stderr.write(`\r  Progress: ${Math.min(i + CONFIG.concurrency, urlsToCheck.length)}/${urlsToCheck.length}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  if (!outputJson) {
    process.stderr.write('\n');
  }

  // Sort by URL (group by department)
  candidates.sort((a, b) => a.url.localeCompare(b.url));

  // Output results
  if (outputJson) {
    console.log(JSON.stringify({
      generated: new Date().toISOString(),
      existingCount: catalog.services.length,
      sitemapUrlsFound: allDiscoveredUrls.size,
      potentialServicesFound: potentialServices.length,
      candidatesWithInfo: candidates.length,
      candidates,
    }, null, 2));
  } else {
    console.log(`# Potential New Services`);
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log(``);
    console.log(`Found ${candidates.length} potential services not in the current catalog:`);
    console.log(``);

    for (const c of candidates) {
      console.log(`## ${c.title || 'Untitled'}`);
      console.log(`- URL: ${c.url}`);
      if (c.description) {
        console.log(`- Description: ${c.description}`);
      }
      console.log(``);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
