#!/usr/bin/env node
/**
 * F7-C route-retirement reproducibility guard.
 *
 * The live registry state is asserted by certify:f7c section O. A database
 * repaired by hand but not reproducible from repository migrations is NOT
 * certifiable, so this guard proves the retirement contract exists in
 * supabase/migrations for every obsolete Returns registry path.
 */
import fs from 'node:fs';
import path from 'node:path';

const RETIRED = [
  '/admin/returns/definitions',
  '/admin/returns/metrics',
  '/admin/returns/migration',
  '/returns/filings',
];

const dir = 'supabase/migrations';
const sql = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('\n');

const missing = RETIRED.filter((p) => {
  // the path must appear in a statement that deactivates registry/navigation rows
  const re = new RegExp(`is_active\\s*=\\s*false[\\s\\S]{0,2000}?${p.replace(/\//g, '\\/')}'`, 'i');
  return !re.test(sql);
});

if (missing.length) {
  console.error('F7C ROUTE RETIREMENT NOT REPRODUCIBLE FROM MIGRATIONS:');
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(`F7C route retirement reproducible from migrations: ${RETIRED.length}/${RETIRED.length} paths.`);
