#!/usr/bin/env node
/**
 * validate-catalog.js
 *
 * Zero-dependency sanity check that service-catalog-v8.json is internally
 * consistent and conforms to service-schema-v3.json on the points that
 * actually matter for the app and the automation:
 *
 *   - top-level required fields present
 *   - serviceCount matches the array length
 *   - every service has the required fields, with bilingual (en+es) values
 *     where the schema expects localized objects
 *   - ids are unique
 *   - enum fields (lifeEvent, taskType, audience) only use schema-allowed values
 *
 * Exits non-zero and prints every problem if the catalog is invalid, so the
 * workflow can block a bad catalog before it ever reaches a PR or auto-merge.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'service-catalog-v8.json');
const SCHEMA_PATH = path.join(__dirname, '..', 'service-schema-v3.json');

const LOCALIZED_FIELDS = ['name', 'description', 'department', 'category'];

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  const serviceProps = schema?.definitions?.Service?.properties || {};

  const enumFields = ['lifeEvent', 'taskType', 'audience'].reduce((acc, field) => {
    if (Array.isArray(serviceProps[field]?.enum)) {
      acc[field] = new Set(serviceProps[field].enum);
    }
    return acc;
  }, {});

  const errors = [];

  for (const key of ['version', 'lastUpdated', 'serviceCount', 'languages', 'services']) {
    if (catalog[key] === undefined) errors.push(`Missing top-level field: ${key}`);
  }

  const services = Array.isArray(catalog.services) ? catalog.services : [];
  if (catalog.serviceCount !== services.length) {
    errors.push(`serviceCount (${catalog.serviceCount}) does not match services array length (${services.length})`);
  }

  const seenIds = new Set();
  for (const service of services) {
    const label = `service id ${service?.id ?? '(missing)'}`;

    if (service.id === undefined) {
      errors.push(`A service is missing an id`);
    } else if (seenIds.has(service.id)) {
      errors.push(`Duplicate id: ${service.id}`);
    } else {
      seenIds.add(service.id);
    }

    if (typeof service.url !== 'string' || !service.url) {
      errors.push(`${label}: missing or invalid url`);
    }

    for (const field of LOCALIZED_FIELDS) {
      const value = service[field];
      if (!value || typeof value.en !== 'string' || typeof value.es !== 'string') {
        errors.push(`${label}: ${field} must have string en + es values`);
      }
    }

    for (const [field, allowed] of Object.entries(enumFields)) {
      const value = service[field];
      if (value !== undefined && value !== null && !allowed.has(value)) {
        errors.push(`${label}: ${field} value "${value}" is not in the schema enum`);
      }
    }
  }

  if (errors.length) {
    console.error(`Catalog validation FAILED with ${errors.length} problem(s):`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`Catalog valid: ${services.length} services, all checks passed.`);
}

main();
