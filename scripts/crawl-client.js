#!/usr/bin/env node
/**
 * Cloudflare Crawl Client
 *
 * Submits crawl jobs to Cloudflare Browser Rendering /crawl endpoint,
 * polls for completion, and downloads paginated results.
 *
 * Environment variables:
 *   CF_ACCOUNT_ID  - Cloudflare account ID (required)
 *   CF_API_TOKEN   - Cloudflare API token with Browser Rendering Edit (required)
 *
 * Usage:
 *   node scripts/crawl-client.js --url https://example.com [--profile hub-discovery] [--output-dir ./crawl-results]
 *   node scripts/crawl-client.js --queue queue.json [--output-dir ./crawl-results]
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';
const POLL_INTERVAL_MS = 10000;
const MAX_POLL_ATTEMPTS = 180; // 30 minutes at 10s intervals
const RESULTS_PAGE_SIZE = 100;

function loadProfiles() {
  const profilesPath = path.join(__dirname, '..', 'config', 'crawl-profiles.json');
  return JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
}

function loadDomainPolicy() {
  const policyPath = path.join(__dirname, '..', 'config', 'crawl-domain-policy.json');
  try {
    return JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
  } catch {
    return { domains: {} };
  }
}

function getAccountId() {
  const id = process.env.CF_ACCOUNT_ID;
  if (!id) throw new Error('Missing CF_ACCOUNT_ID environment variable');
  return id;
}

function getApiToken() {
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error('Missing CF_API_TOKEN environment variable');
  return token;
}

function apiHeaders() {
  return {
    'Authorization': `Bearer ${getApiToken()}`,
    'Content-Type': 'application/json',
  };
}

function crawlEndpoint(accountId, jobId) {
  const base = `${BASE_URL}/${accountId}/browser-rendering/crawl`;
  return jobId ? `${base}/${jobId}` : base;
}

function buildCrawlPayload(url, profile, domainPolicy) {
  const profiles = loadProfiles();
  const profileConfig = profiles[profile];
  if (!profileConfig) {
    throw new Error(`Unknown crawl profile: ${profile}. Available: ${Object.keys(profiles).join(', ')}`);
  }

  // Build payload from profile — profiles already have the correct
  // nested structure (options.includeExternalLinks, etc.)
  const payload = { url, ...profileConfig };

  // Apply domain-level overrides
  try {
    const hostname = new URL(url).hostname;
    const policy = domainPolicy.domains[hostname];
    if (policy) {
      if (policy.source) payload.source = policy.source;
      if (policy.render !== undefined) payload.render = policy.render;
      if (policy.maxDepth) payload.depth = policy.maxDepth;
      if (policy.maxPages) payload.limit = policy.maxPages;
      // Domain-level options overrides go into the options object
      if (!payload.options) payload.options = {};
      if (policy.includeSubdomains !== undefined) payload.options.includeSubdomains = policy.includeSubdomains;
    }
  } catch {
    // URL parse failure — proceed with profile defaults
  }

  return payload;
}

async function submitCrawl(url, profile) {
  const accountId = getAccountId();
  const domainPolicy = loadDomainPolicy();
  const payload = buildCrawlPayload(url, profile, domainPolicy);

  const response = await fetch(crawlEndpoint(accountId), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Crawl submit failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Crawl submit failed: ${JSON.stringify(data.errors || data)}`);
  }

  // POST response: { success: true, result: "<job-id-string>" }
  return data.result;
}

async function pollCrawlStatus(jobId) {
  const accountId = getAccountId();
  const endpoint = `${crawlEndpoint(accountId, jobId)}?limit=1`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: apiHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Crawl status check failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Crawl status failed: ${JSON.stringify(data.errors || data)}`);
  }

  // GET response: { success: true, result: { id, status, total, finished, browserSecondsUsed, records, cursor } }
  return data.result;
}

async function waitForCompletion(jobId, verbose) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = await pollCrawlStatus(jobId);
    const status = result.status;

    if (verbose) {
      const finished = result.finished || 0;
      const total = result.total || '?';
      console.error(`  Poll ${attempt + 1}: status=${status}, finished=${finished}/${total}`);
    }

    if (status !== 'running') {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Crawl job ${jobId} timed out after ${MAX_POLL_ATTEMPTS} poll attempts`);
}

async function fetchAllResults(jobId) {
  const accountId = getAccountId();
  const allRecords = [];
  let cursor = null;

  while (true) {
    const params = new URLSearchParams({ limit: String(RESULTS_PAGE_SIZE) });
    if (cursor) params.set('cursor', String(cursor));

    const endpoint = `${crawlEndpoint(accountId, jobId)}?${params}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: apiHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Crawl results fetch failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Crawl results failed: ${JSON.stringify(data.errors || data)}`);
    }

    const result = data.result;
    const records = result.records || [];
    allRecords.push(...records);

    // Use the cursor returned by the API for the next page
    if (result.cursor && records.length > 0) {
      cursor = result.cursor;
    } else {
      break;
    }
  }

  return allRecords;
}

async function runCrawlJob(seedId, url, profile, outputDir, verbose) {
  if (verbose) console.error(`Starting crawl: ${seedId} (${url}) [profile: ${profile}]`);

  const jobId = await submitCrawl(url, profile);
  if (verbose) console.error(`  Job submitted: ${jobId}`);

  const finalStatus = await waitForCompletion(jobId, verbose);
  if (verbose) console.error(`  Job finished: status=${finalStatus.status}`);

  const records = await fetchAllResults(jobId);
  if (verbose) console.error(`  Fetched ${records.length} records`);

  const result = {
    seedId,
    jobId,
    url,
    profile,
    status: finalStatus.status,
    total: finalStatus.total || records.length,
    finished: finalStatus.finished || records.length,
    browserSecondsUsed: finalStatus.browserSecondsUsed || 0,
    crawledAt: new Date().toISOString(),
    records,
  };

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = `crawl-raw-${seedId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2) + '\n');
    if (verbose) console.error(`  Wrote raw results to ${filepath}`);
  }

  return result;
}

async function runQueue(queuePath, outputDir, verbose) {
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
  const results = [];

  for (const job of queue) {
    try {
      const result = await runCrawlJob(job.id, job.url, job.profile, outputDir, verbose);
      results.push({ id: job.id, status: 'success', result });
    } catch (error) {
      console.error(`  Job ${job.id} failed: ${error.message}`);
      results.push({ id: job.id, status: 'error', error: error.message });
    }
  }

  return results;
}

function parseArgs(argv) {
  const args = {
    url: null,
    profile: 'domain-freshness',
    seedId: 'manual',
    queue: null,
    outputDir: null,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') {
      args.url = argv[++i];
    } else if (arg === '--profile') {
      args.profile = argv[++i];
    } else if (arg === '--seed-id') {
      args.seedId = argv[++i];
    } else if (arg === '--queue') {
      args.queue = argv[++i];
    } else if (arg === '--output-dir') {
      args.outputDir = argv[++i];
    } else if (arg === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.queue) {
    const results = await runQueue(args.queue, args.outputDir, args.verbose);
    console.log(JSON.stringify(results, null, 2));
  } else if (args.url) {
    const result = await runCrawlJob(args.seedId, args.url, args.profile, args.outputDir, args.verbose);
    console.log(JSON.stringify({ status: 'success', result }, null, 2));
  } else {
    console.error('Usage:');
    console.error('  node scripts/crawl-client.js --url <url> [--profile <profile>] [--seed-id <id>] [--output-dir <dir>] [--verbose]');
    console.error('  node scripts/crawl-client.js --queue <queue.json> [--output-dir <dir>] [--verbose]');
    process.exit(1);
  }
}

// Export for use by other scripts
module.exports = { submitCrawl, waitForCompletion, fetchAllResults, runCrawlJob, runQueue, buildCrawlPayload };

main().catch(err => {
  console.error('Crawl client failed:', err.message);
  process.exit(1);
});
