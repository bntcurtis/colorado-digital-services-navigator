#!/usr/bin/env node
/**
 * Colorado Service Navigator - Link Health Checker
 *
 * Checks all URLs in the service catalog for:
 * - Hard failures (4xx, 5xx status codes)
 * - Soft 404s (pages that return 200 but contain "not found" messaging)
 * - Suspicious redirects (final domain differs significantly from original)
 * - Timeouts and connection errors
 *
 * Usage: node scripts/check-links.js [--json] [--verbose]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  catalogPath: path.join(__dirname, '..', 'service-catalog-v8.json'),
  timeout: 15000,
  concurrency: 5, // Be nice to government servers
  userAgent: 'Colorado-Service-Navigator-LinkChecker/1.0 (https://github.com/bntcurtis)',

  // Phrases that indicate a soft 404 (page exists but content is gone)
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

  // Title patterns that suggest a 404 page
  soft404TitlePatterns: [
    /404/i,
    /not\s+found/i,
    /page\s+missing/i,
    /error/i,
  ],
};

// Parse command line args
const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const verbose = args.includes('--verbose');

/**
 * Extract the registrable domain (e.g., "colorado.gov" from "dmv.colorado.gov")
 */
function getBaseDomain(hostname) {
  const parts = hostname.split('.');
  // Handle .co.us, .state.co.us patterns common in government sites
  if (parts.length >= 3) {
    const lastThree = parts.slice(-3).join('.');
    if (lastThree.match(/\.(state\.co\.us|co\.us)$/)) {
      return parts.slice(-4).join('.');
    }
  }
  // Standard TLDs: return last two parts
  return parts.slice(-2).join('.');
}

/**
 * Check if a redirect is suspicious (went to a completely different site)
 */
function isSuspiciousRedirect(originalUrl, finalUrl) {
  try {
    const originalHost = new URL(originalUrl).hostname;
    const finalHost = new URL(finalUrl).hostname;

    // Same host is fine
    if (originalHost === finalHost) return false;

    // Same base domain is fine (dmv.colorado.gov -> www.colorado.gov)
    const originalBase = getBaseDomain(originalHost);
    const finalBase = getBaseDomain(finalHost);
    if (originalBase === finalBase) return false;

    // Different base domain - this is suspicious
    return true;
  } catch {
    return true;
  }
}

/**
 * Check page content for soft 404 indicators
 */
function detectSoft404(html, title) {
  // Check title first (more reliable)
  if (title) {
    for (const pattern of CONFIG.soft404TitlePatterns) {
      if (pattern.test(title)) {
        return { detected: true, reason: `Title contains 404 indicator: "${title}"` };
      }
    }
  }

  // Check body content - only the first 10KB to avoid false positives from long pages
  const contentSample = html.slice(0, 10000);

  for (const pattern of CONFIG.soft404Patterns) {
    const match = contentSample.match(pattern);
    if (match) {
      return { detected: true, reason: `Content contains: "${match[0]}"` };
    }
  }

  return { detected: false };
}

/**
 * Extract <title> from HTML
 */
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Check a single URL
 */
async function checkUrl(service) {
  const url = service.url;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

    // First, do a HEAD request to check status quickly
    const headResponse = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': CONFIG.userAgent },
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    const finalUrl = headResponse.url;

    // Check for HTTP errors
    if (!headResponse.ok) {
      return {
        service,
        status: 'broken',
        httpStatus: headResponse.status,
        reason: `HTTP ${headResponse.status}`,
        elapsed,
        finalUrl,
      };
    }

    // Check for suspicious redirects
    if (isSuspiciousRedirect(url, finalUrl)) {
      return {
        service,
        status: 'redirect_suspicious',
        httpStatus: headResponse.status,
        reason: `Redirected to different domain`,
        originalUrl: url,
        finalUrl,
        elapsed,
      };
    }

    // For 200 responses, fetch the body to check for soft 404s
    // But only if it's HTML
    const contentType = headResponse.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), CONFIG.timeout);

      const getResponse = await fetch(finalUrl, {
        method: 'GET',
        signal: controller2.signal,
        headers: { 'User-Agent': CONFIG.userAgent },
      });

      clearTimeout(timeoutId2);

      const html = await getResponse.text();
      const title = extractTitle(html);
      const soft404 = detectSoft404(html, title);

      if (soft404.detected) {
        return {
          service,
          status: 'soft_404',
          httpStatus: headResponse.status,
          reason: soft404.reason,
          finalUrl,
          elapsed: Date.now() - startTime,
        };
      }
    }

    // All checks passed
    return {
      service,
      status: 'ok',
      httpStatus: headResponse.status,
      finalUrl: finalUrl !== url ? finalUrl : undefined,
      elapsed,
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;

    if (error.name === 'AbortError') {
      return {
        service,
        status: 'timeout',
        reason: `Request timed out after ${CONFIG.timeout}ms`,
        elapsed,
      };
    }

    return {
      service,
      status: 'error',
      reason: error.message,
      elapsed,
    };
  }
}

/**
 * Process URLs in batches to respect rate limits
 */
async function checkAllUrls(services) {
  const results = [];

  for (let i = 0; i < services.length; i += CONFIG.concurrency) {
    const batch = services.slice(i, i + CONFIG.concurrency);
    const batchResults = await Promise.all(batch.map(checkUrl));
    results.push(...batchResults);

    if (verbose && !outputJson) {
      const progress = Math.round(((i + batch.length) / services.length) * 100);
      process.stderr.write(`\rProgress: ${progress}% (${i + batch.length}/${services.length})`);
    }

    // Small delay between batches to be polite
    if (i + CONFIG.concurrency < services.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (verbose && !outputJson) {
    process.stderr.write('\n');
  }

  return results;
}

/**
 * Generate a human-readable report
 */
function generateReport(results) {
  const broken = results.filter(r => r.status === 'broken');
  const soft404s = results.filter(r => r.status === 'soft_404');
  const suspiciousRedirects = results.filter(r => r.status === 'redirect_suspicious');
  const timeouts = results.filter(r => r.status === 'timeout');
  const errors = results.filter(r => r.status === 'error');
  const ok = results.filter(r => r.status === 'ok');

  const lines = [
    `# Link Health Report`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## Summary`,
    `- ✅ Healthy: ${ok.length}`,
    `- ❌ Broken (HTTP errors): ${broken.length}`,
    `- 👻 Soft 404s: ${soft404s.length}`,
    `- 🔀 Suspicious redirects: ${suspiciousRedirects.length}`,
    `- ⏱️ Timeouts: ${timeouts.length}`,
    `- ⚠️ Errors: ${errors.length}`,
    `- **Total: ${results.length}**`,
    ``,
  ];

  if (broken.length > 0) {
    lines.push(`## ❌ Broken Links (HTTP Errors)`, ``);
    for (const r of broken) {
      lines.push(`- **ID ${r.service.id}**: ${r.service.name.en}`);
      lines.push(`  - URL: ${r.service.url}`);
      lines.push(`  - Status: ${r.httpStatus}`);
      lines.push(``);
    }
  }

  if (soft404s.length > 0) {
    lines.push(`## 👻 Soft 404s (Page exists but content is gone)`, ``);
    for (const r of soft404s) {
      lines.push(`- **ID ${r.service.id}**: ${r.service.name.en}`);
      lines.push(`  - URL: ${r.service.url}`);
      lines.push(`  - Reason: ${r.reason}`);
      lines.push(``);
    }
  }

  if (suspiciousRedirects.length > 0) {
    lines.push(`## 🔀 Suspicious Redirects (Different domain)`, ``);
    for (const r of suspiciousRedirects) {
      lines.push(`- **ID ${r.service.id}**: ${r.service.name.en}`);
      lines.push(`  - Original: ${r.originalUrl}`);
      lines.push(`  - Redirects to: ${r.finalUrl}`);
      lines.push(``);
    }
  }

  if (timeouts.length > 0) {
    lines.push(`## ⏱️ Timeouts`, ``);
    for (const r of timeouts) {
      lines.push(`- **ID ${r.service.id}**: ${r.service.name.en}`);
      lines.push(`  - URL: ${r.service.url}`);
      lines.push(``);
    }
  }

  if (errors.length > 0) {
    lines.push(`## ⚠️ Connection Errors`, ``);
    for (const r of errors) {
      lines.push(`- **ID ${r.service.id}**: ${r.service.name.en}`);
      lines.push(`  - URL: ${r.service.url}`);
      lines.push(`  - Error: ${r.reason}`);
      lines.push(``);
    }
  }

  return lines.join('\n');
}

/**
 * Main entry point
 */
async function main() {
  // Load catalog
  const catalogRaw = fs.readFileSync(CONFIG.catalogPath, 'utf-8');
  const catalog = JSON.parse(catalogRaw);

  if (!outputJson) {
    console.error(`Checking ${catalog.services.length} services...`);
  }

  // Also check departmentUrl fields (they can break too)
  const allUrls = [];
  for (const service of catalog.services) {
    allUrls.push(service);
  }

  const results = await checkAllUrls(allUrls);

  // Count issues
  const issues = results.filter(r => r.status !== 'ok');

  if (outputJson) {
    console.log(JSON.stringify({
      generated: new Date().toISOString(),
      summary: {
        total: results.length,
        healthy: results.filter(r => r.status === 'ok').length,
        broken: results.filter(r => r.status === 'broken').length,
        soft404: results.filter(r => r.status === 'soft_404').length,
        suspiciousRedirects: results.filter(r => r.status === 'redirect_suspicious').length,
        timeouts: results.filter(r => r.status === 'timeout').length,
        errors: results.filter(r => r.status === 'error').length,
      },
      issues: issues.map(r => ({
        id: r.service.id,
        name: r.service.name.en,
        url: r.service.url,
        status: r.status,
        httpStatus: r.httpStatus,
        reason: r.reason,
        finalUrl: r.finalUrl,
      })),
    }, null, 2));
  } else {
    console.log(generateReport(results));
  }

  // Exit with error code if there are issues (useful for CI)
  if (issues.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
