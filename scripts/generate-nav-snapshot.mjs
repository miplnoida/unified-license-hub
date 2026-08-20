#!/usr/bin/env node
/**
 * Regenerate `src/lib/breadcrumbs/navigationSnapshot.ts` from the live
 * `sec_navigation_items` / `sec_routes` tables.
 *
 * The snapshot is the deterministic breadcrumb fallback (context still loading,
 * unit tests, coverage script). Run after changing the navigation taxonomy:
 *   PGHOST=... node scripts/generate-nav-snapshot.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SQL = `select json_agg(t order by t.key) from (
  select n.key,
         p.key as parent_key,
         n.label,
         coalesce(n.href_override, r.path_pattern) as href,
         n.item_type,
         n.audience,
         coalesce(n.show_in_sidebar, true) as show_in_sidebar
  from sec_navigation_items n
  left join sec_navigation_items p on p.id = n.parent_id
  left join sec_routes r on r.id = n.route_id
  where n.is_active
) t`;

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
const args = conn ? [conn, '-At', '-c', SQL] : ['-At', '-c', SQL];
const rows = JSON.parse(execFileSync('psql', args, { encoding: 'utf8' }).trim() || '[]');

const q = (v) => (v === null || v === undefined ? 'null' : JSON.stringify(v));
const body = rows
  .map(
    (r) =>
      `  { key: ${q(r.key)}, parentKey: ${q(r.parent_key)}, label: ${q(r.label)}, href: ${q(r.href)}, ` +
      `itemType: ${q(r.item_type)}, audience: ${q(r.audience)}, showInSidebar: ${r.show_in_sidebar ? 'true' : 'false'} },`,
  )
  .join('\n');

const out = `/**
 * GENERATED SNAPSHOT — do not edit by hand.
 *
 * Frozen copy of the active \`sec_navigation_items\` hierarchy (key, parent, label,
 * href). The live tree from \`sec_get_user_context()\` is always preferred; this
 * snapshot is the deterministic fallback so breadcrumbs still render a correct
 * ancestry before the security context resolves, in tests, and in the
 * \`verify-breadcrumb-coverage\` script (which cannot reach the database).
 *
 * Regenerate with: node scripts/generate-nav-snapshot.mjs
 */
import type { NavSnapshotItem } from './types';

export const navigationSnapshot: NavSnapshotItem[] = [
${body}
];
`;

fs.writeFileSync('src/lib/breadcrumbs/navigationSnapshot.ts', out);
console.log(`Wrote ${rows.length} navigation items to src/lib/breadcrumbs/navigationSnapshot.ts`);
