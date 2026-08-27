#!/usr/bin/env tsx
/**
 * sync-permission-catalog — refresh `src/lib/rbac/catalog.json` from the
 * CATALOGUE OF RECORD (`public.sec_permissions` ⋈ `public.sec_modules`).
 *
 * `catalog.json` is a checked-in *materialised snapshot* used by static CI
 * checks (permission coverage, RBAC parity, alias-namespace guard) that must
 * run without database access. It is never a second catalogue: this script is
 * the only writer, and it copies the live rows verbatim.
 *
 * Requires the managed PG* environment (psql). Usage:
 *   bunx tsx scripts/sync-permission-catalog.ts
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SQL = `
select m.key || '|' || p.key || '|' || p.is_enforced::text
from public.sec_permissions p
join public.sec_modules m on m.id = p.module_id
where p.is_active and m.is_active
order by 1
`;

const out = execFileSync('psql', ['-At', '-c', SQL], { encoding: 'utf8' }).trim();
const rows = out
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [module, name, enforced] = line.split('|');
    return { module, name, enforced: enforced === 't' || enforced === 'true' };
  });

writeFileSync(join(ROOT, 'src/lib/rbac/catalog.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(`catalog.json: ${rows.length} permissions synced from sec_permissions`);
