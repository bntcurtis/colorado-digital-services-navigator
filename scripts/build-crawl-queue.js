#!/usr/bin/env node
/**
 * Build Crawl Queue
 *
 * Selects the next set of daily crawl jobs within the free-tier budget.
 * Reads seed config, crawl history, and existing catalog to decide which
 * seeds to crawl today.
 *
 * Free-tier budget: 5 crawl jobs per day.
 * Strategy:
 *   - 1 hub seed (always)
 *   - up to 3 domain freshness seeds (stale + high priority)
 *   - 1 reserved slot (recovery or overflow domain)
 *
 * Usage:
 *   node scripts/build-crawl-queue.js [--output queue.json] [--history-dir ./crawl-results] [--budget 5] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BUDGET = 5;
const HUB_SLOTS = 1;
const RESERVED_SLOTS = 1;

function loadSeeds() {
  const seedsPath = path.join(__dirname, '..', 'config', 'crawl-seeds.json');
  return JSON.parse(fs.readFileSync(seedsPath, 'utf-8'));
}

function loadCrawlHistory(historyDir) {
  if (!historyDir || !fs.existsSync(historyDir)) return [];

  const files = fs.readdirSync(historyDir)
    .filter(f => f.startsWith('crawl-raw-') && f.endsWith('.json'))
    .sort()
    .reverse();

  const history = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf-8'));
      history.push({
        seedId: data.seedId,
        crawledAt: data.crawledAt,
        status: data.status,
        recordCount: (data.records || []).length,
      });
    } catch {
      // skip unreadable files
    }
  }
  return history;
}

function lastCrawledMap(history) {
  const map = new Map();
  for (const entry of history) {
    if (!map.has(entry.seedId)) {
      map.set(entry.seedId, new Date(entry.crawledAt));
    }
  }
  return map;
}

function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function selectQueue(seeds, history, budget, verbose) {
  const lastCrawled = lastCrawledMap(history);
  const now = new Date();
  const queue = [];

  // Separate hub and domain seeds
  const hubSeeds = seeds.filter(s => s.class === 'hub');
  const domainSeeds = seeds.filter(s => s.class === 'domain');

  // 1. Pick hub seed(s) — always include at least one
  const hubCandidates = hubSeeds
    .map(seed => ({
      ...seed,
      daysSinceLastCrawl: daysSince(lastCrawled.get(seed.id)),
    }))
    .filter(s => s.daysSinceLastCrawl >= s.frequencyDays)
    .sort((a, b) => b.priority - a.priority || b.daysSinceLastCrawl - a.daysSinceLastCrawl);

  // If no hub is stale enough, pick the highest-priority one anyway
  if (hubCandidates.length === 0 && hubSeeds.length > 0) {
    hubCandidates.push({
      ...hubSeeds.sort((a, b) => b.priority - a.priority)[0],
      daysSinceLastCrawl: 0,
    });
  }

  for (let i = 0; i < Math.min(HUB_SLOTS, hubCandidates.length); i++) {
    queue.push(hubCandidates[i]);
  }

  // 2. Pick domain freshness seeds — stale + high priority
  const domainSlots = budget - HUB_SLOTS - RESERVED_SLOTS;
  const domainCandidates = domainSeeds
    .map(seed => ({
      ...seed,
      daysSinceLastCrawl: daysSince(lastCrawled.get(seed.id)),
    }))
    .filter(s => s.daysSinceLastCrawl >= s.frequencyDays)
    .sort((a, b) => {
      // Prioritize: never-crawled > most overdue > highest priority
      if (a.daysSinceLastCrawl === Infinity && b.daysSinceLastCrawl !== Infinity) return -1;
      if (b.daysSinceLastCrawl === Infinity && a.daysSinceLastCrawl !== Infinity) return 1;

      const overdueA = a.daysSinceLastCrawl / a.frequencyDays;
      const overdueB = b.daysSinceLastCrawl / b.frequencyDays;
      if (Math.abs(overdueA - overdueB) > 0.5) return overdueB - overdueA;

      return b.priority - a.priority;
    });

  for (let i = 0; i < Math.min(domainSlots, domainCandidates.length); i++) {
    queue.push(domainCandidates[i]);
  }

  // 3. Reserved slot — fill with next best domain if no recovery needed
  const usedIds = new Set(queue.map(q => q.id));
  const overflow = domainCandidates.find(s => !usedIds.has(s.id));
  if (overflow && queue.length < budget) {
    queue.push(overflow);
  }

  if (verbose) {
    console.error(`Queue built: ${queue.length} jobs (budget: ${budget})`);
    for (const job of queue) {
      const age = job.daysSinceLastCrawl === Infinity ? 'never' : `${job.daysSinceLastCrawl.toFixed(1)}d ago`;
      console.error(`  ${job.id} (${job.class}, priority=${job.priority}, last=${age})`);
    }
  }

  // Return queue in the shape expected by crawl-client.js --queue
  return queue.map(s => ({
    id: s.id,
    url: s.url,
    profile: s.profile,
  }));
}

function parseArgs(argv) {
  const args = {
    output: null,
    historyDir: null,
    budget: DEFAULT_BUDGET,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output') {
      args.output = argv[++i];
    } else if (arg === '--history-dir') {
      args.historyDir = argv[++i];
    } else if (arg === '--budget') {
      args.budget = parseInt(argv[++i], 10) || DEFAULT_BUDGET;
    } else if (arg === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seeds = loadSeeds();
  const history = loadCrawlHistory(args.historyDir);
  const queue = selectQueue(seeds, history, args.budget, args.verbose);

  const json = JSON.stringify(queue, null, 2);

  if (args.output) {
    fs.writeFileSync(args.output, json + '\n');
    if (args.verbose) console.error(`Queue written to ${args.output}`);
  } else {
    console.log(json);
  }
}

module.exports = { selectQueue, loadSeeds, loadCrawlHistory };

main();
