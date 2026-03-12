#!/usr/bin/env node
/**
 * Normalize Crawl Results
 *
 * Transforms raw Cloudflare crawl results into a stable local schema.
 * Captures source seed, crawl profile, final URL, status, title,
 * markdown excerpt, and content-quality signals.
 *
 * Usage:
 *   node scripts/normalize-crawl-results.js --input-dir ./crawl-results [--output-dir ./crawl-normalized] [--verbose]
 *   node scripts/normalize-crawl-results.js --input <raw-file.json> [--output <normalized.json>] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const SERVICE_PATTERNS = [
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
];

const EXCLUDE_PATTERNS = [
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
];

function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function extractPathSegments(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

function extractTitle(record) {
  // Prefer metadata title, then try to extract from markdown heading
  if (record.metadata?.title) return record.metadata.title;
  if (record.markdown) {
    const match = record.markdown.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}

function truncateMarkdown(markdown, maxLength) {
  if (!markdown) return null;
  if (markdown.length <= maxLength) return markdown;
  return markdown.slice(0, maxLength) + '...';
}

function matchesServicePattern(url) {
  return SERVICE_PATTERNS.some(p => p.test(url));
}

function matchesExcludePattern(url) {
  return EXCLUDE_PATTERNS.some(p => p.test(url));
}

function computeSignals(url, record) {
  const markdown = record.markdown || '';
  return {
    servicePatternMatch: matchesServicePattern(url) && !matchesExcludePattern(url),
    hasMarkdown: markdown.length > 0,
    contentLength: markdown.length,
    hasTitle: !!extractTitle(record),
    isColoradoGov: /\.(colorado\.gov|state\.co\.us|co\.us)$/i.test(extractHost(url) || ''),
  };
}

function normalizeRecord(record, seedId, jobId, crawledAt, profile) {
  const url = record.url;
  if (!url) return null;

  const title = extractTitle(record);
  const signals = computeSignals(url, record);

  return {
    seedId,
    jobId,
    profile,
    crawledAt,
    status: record.status || 'unknown',
    url,
    host: extractHost(url),
    pathSegments: extractPathSegments(url),
    title,
    markdown: truncateMarkdown(record.markdown, 2000),
    httpStatus: record.metadata?.status || null,
    signals,
  };
}

function normalizeRawFile(rawData) {
  const { seedId, jobId, crawledAt, profile, records } = rawData;

  if (!records || !Array.isArray(records)) return [];

  return records
    .map(record => normalizeRecord(record, seedId, jobId, crawledAt, profile))
    .filter(Boolean);
}

function generateSummary(normalized, rawData) {
  const statusCounts = {};
  let servicePatternCount = 0;
  let coloradoGovCount = 0;

  for (const record of normalized) {
    statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
    if (record.signals.servicePatternMatch) servicePatternCount++;
    if (record.signals.isColoradoGov) coloradoGovCount++;
  }

  return {
    seedId: rawData.seedId,
    jobId: rawData.jobId,
    profile: rawData.profile,
    crawledAt: rawData.crawledAt,
    url: rawData.url,
    jobStatus: rawData.status,
    totalRecords: normalized.length,
    statusCounts,
    servicePatternMatches: servicePatternCount,
    coloradoGovPages: coloradoGovCount,
    browserSecondsUsed: rawData.browserSecondsUsed || 0,
  };
}

function parseArgs(argv) {
  const args = {
    input: null,
    inputDir: null,
    output: null,
    outputDir: null,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = argv[++i];
    } else if (arg === '--input-dir') {
      args.inputDir = argv[++i];
    } else if (arg === '--output') {
      args.output = argv[++i];
    } else if (arg === '--output-dir') {
      args.outputDir = argv[++i];
    } else if (arg === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

function processFile(inputPath, outputDir, verbose) {
  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const normalized = normalizeRawFile(rawData);
  const summary = generateSummary(normalized, rawData);

  if (verbose) {
    console.error(`Normalized ${inputPath}: ${normalized.length} records, ${summary.servicePatternMatches} service-like`);
  }

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    const baseName = path.basename(inputPath, '.json').replace('crawl-raw-', 'crawl-normalized-');
    const normalizedPath = path.join(outputDir, `${baseName}.json`);
    const summaryPath = path.join(outputDir, `${baseName}-summary.json`);

    fs.writeFileSync(normalizedPath, JSON.stringify(normalized, null, 2) + '\n');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');

    if (verbose) {
      console.error(`  Wrote ${normalizedPath}`);
      console.error(`  Wrote ${summaryPath}`);
    }
  }

  return { normalized, summary };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.inputDir) {
    if (!fs.existsSync(args.inputDir)) {
      console.error(`Input directory not found: ${args.inputDir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(args.inputDir)
      .filter(f => f.startsWith('crawl-raw-') && f.endsWith('.json'));

    if (files.length === 0) {
      console.error('No raw crawl files found in input directory.');
      process.exit(0);
    }

    const outputDir = args.outputDir || args.inputDir;
    const allSummaries = [];

    for (const file of files) {
      const { summary } = processFile(path.join(args.inputDir, file), outputDir, args.verbose);
      allSummaries.push(summary);
    }

    // Write daily summary
    const dailySummaryPath = path.join(outputDir, `crawl-daily-summary-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(dailySummaryPath, JSON.stringify(allSummaries, null, 2) + '\n');

    if (args.verbose) console.error(`Daily summary: ${dailySummaryPath}`);

    // Print summary to stdout for workflow logs
    console.log(JSON.stringify({ summaries: allSummaries }, null, 2));

  } else if (args.input) {
    const outputDir = args.outputDir || path.dirname(args.input);
    const { normalized, summary } = processFile(args.input, args.output ? null : outputDir, args.verbose);

    if (args.output) {
      fs.writeFileSync(args.output, JSON.stringify(normalized, null, 2) + '\n');
    }

    console.log(JSON.stringify(summary, null, 2));

  } else {
    console.error('Usage:');
    console.error('  node scripts/normalize-crawl-results.js --input-dir <dir> [--output-dir <dir>] [--verbose]');
    console.error('  node scripts/normalize-crawl-results.js --input <file> [--output <file>] [--verbose]');
    process.exit(1);
  }
}

module.exports = { normalizeRawFile, normalizeRecord, generateSummary };

main();
