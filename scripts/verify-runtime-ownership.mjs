#!/usr/bin/env node
/**
 * Runtime ownership oracle for the unified Rule Engine (ADM-RE-001).
 *
 * Fails the build when:
 *   - a governed family is missing from the registry,
 *   - a family declares more than one runtime owner,
 *   - two families share the same runtime owner AND the same source event
 *     (that is the double-execution shape we must never ship),
 *   - a family claims a source table another family already owns,
 *   - more than one family is marked as centrally editable.
 *
 * Run: node scripts/verify-runtime-ownership.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(resolve(root, 'docs/rule-engine/runtime-ownership.json'), 'utf8'));

const EXPECTED_FAMILIES = [
  'shared_engine', 'return_validation', 'prudential', 'conduct', 'complaint_triage',
  'sufficiency', 'rfi_auto', 'correspondence', 'escalation',
];

const REQUIRED_FIELDS = [
  'family', 'label', 'source_table', 'source_event', 'trigger_type', 'trigger_location',
  'evaluator', 'runtime_owner', 'suppression_owner', 'action_executor',
  'notification_owner', 'audit_owner',
];

const errors = [];
const families = registry.families || [];

for (const key of EXPECTED_FAMILIES) {
  if (!families.some((f) => f.family === key)) errors.push(`missing family in registry: ${key}`);
}

const seenTables = new Map();
const seenOwnerEvent = new Map();
let centralEditors = 0;

for (const f of families) {
  for (const field of REQUIRED_FIELDS) {
    const v = f[field];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push(`${f.family}: field "${field}" is empty — every cell must be traced to a real runtime artefact`);
    }
  }

  if (Array.isArray(f.runtime_owner)) {
    errors.push(`${f.family}: declares ${f.runtime_owner.length} runtime owners — exactly one is allowed`);
  }

  const table = String(f.source_table || '').toLowerCase();
  if (seenTables.has(table)) {
    errors.push(`source table ${table} is claimed by both ${seenTables.get(table)} and ${f.family}`);
  } else {
    seenTables.set(table, f.family);
  }

  const ownerEvent = `${String(f.runtime_owner).toLowerCase()}##${String(f.source_event).toLowerCase()}`;
  if (seenOwnerEvent.has(ownerEvent)) {
    errors.push(
      `duplicate runtime execution path: ${f.family} and ${seenOwnerEvent.get(ownerEvent)} ` +
      `both run "${f.runtime_owner}" for source event "${f.source_event}"`,
    );
  } else {
    seenOwnerEvent.set(ownerEvent, f.family);
  }

  if (f.central_editor === true) centralEditors++;
  if (f.central_editor === false && !f.module_editor) {
    errors.push(`${f.family}: module-owned family must name its module editor screen`);
  }
}

if (centralEditors !== 1) {
  errors.push(`exactly one family may be centrally editable (the shared engine); found ${centralEditors}`);
}

if (errors.length) {
  console.error('Runtime ownership verification FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Runtime ownership verified: ${families.length} families, one runtime owner each, no duplicate execution paths.`);
