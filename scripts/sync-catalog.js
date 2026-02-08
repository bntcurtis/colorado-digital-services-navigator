#!/usr/bin/env node
/**
 * Sync the embedded SERVICE_CATALOG in index.html
 * with the canonical service-catalog-v8.json file.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'service-catalog-v8.json');
const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const MARKER = 'const SERVICE_CATALOG = [';

function findCatalogBlock(text) {
  const markerIndex = text.indexOf(MARKER);
  if (markerIndex === -1) {
    throw new Error('SERVICE_CATALOG marker not found in index.html');
  }

  const lineStart = text.lastIndexOf('\n', markerIndex) + 1;
  const indent = text.slice(lineStart, markerIndex);

  const arrayStart = text.indexOf('[', markerIndex);
  if (arrayStart === -1) {
    throw new Error('SERVICE_CATALOG array start not found');
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let arrayEnd = -1;

  for (let i = arrayStart; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') depth++;
    if (char === ']') depth--;

    if (depth === 0) {
      arrayEnd = i;
      break;
    }
  }

  if (arrayEnd === -1) {
    throw new Error('SERVICE_CATALOG array end not found');
  }

  let blockEnd = arrayEnd + 1;
  if (text[blockEnd] === ';') {
    blockEnd++;
  } else {
    const semiIndex = text.indexOf(';', blockEnd);
    if (semiIndex !== -1) blockEnd = semiIndex + 1;
  }

  return { start: lineStart, end: blockEnd, indent };
}

function buildCatalogBlock(services, indent) {
  const jsonText = JSON.stringify(services, null, 2);
  return `${indent}const SERVICE_CATALOG = ${jsonText};`;
}

function main() {
  const catalogRaw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  const catalog = JSON.parse(catalogRaw);

  const indexHtml = fs.readFileSync(INDEX_PATH, 'utf-8');
  const { start, end, indent } = findCatalogBlock(indexHtml);

  const newBlock = buildCatalogBlock(catalog.services, indent);
  const existingBlock = indexHtml.slice(start, end);

  if (existingBlock === newBlock) {
    return;
  }

  const updated = indexHtml.slice(0, start) + newBlock + indexHtml.slice(end);
  fs.writeFileSync(INDEX_PATH, updated);
}

main();
