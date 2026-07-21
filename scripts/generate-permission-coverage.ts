#!/usr/bin/env tsx
/**
 * Generate the permission coverage matrix.
 *
 * Reads:
 *   - src/lib/rbac/catalog.json      (checked-in permission snapshot)
 *   - project source files + supabase/migrations SQL
 *
 * Writes:
 *   - docs/rbac/permission-coverage.md
 *   - docs/rbac/permission-coverage.csv
 *   - docs/rbac/permission-coverage.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildCoverage, classifyCoverage, type CoverageRow, type CatalogEntry } from '../src/lib/rbac/coverage';

const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'docs/rbac');
mkdirSync(OUT, { recursive: true });

const catalog: CatalogEntry[] = JSON.parse(
  readFileSync(join(ROOT, 'src/lib/rbac/catalog.json'), 'utf8'),
);

const matrix = buildCoverage(ROOT, catalog);

// --------------------------------------------------------------------------
// JSON
// --------------------------------------------------------------------------
writeFileSync(
  join(OUT, 'permission-coverage.json'),
  JSON.stringify(matrix, null, 2),
);

// --------------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------------
const csvHeader = [
  'module',
  'action',
  'menu',
  'route',
  'button',
  'rls',
  'rpc',
  'storage',
  'report',
  'orphaned',
  'first_reference',
];
const csvLines = [csvHeader.join(',')];
const surfacesOf = (r: CoverageRow) => [r.menu, r.route, r.button, r.rls, r.rpc, r.storage, r.report];
for (const r of matrix.rows) {
  const firstRef =
    surfacesOf(r).flat()[0]?.file
      ? `${surfacesOf(r).flat()[0].file}:${surfacesOf(r).flat()[0].line}`
      : '';
  csvLines.push(
    [
      r.module,
      r.action,
      r.menu.length,
      r.route.length,
      r.button.length,
      r.rls.length,
      r.rpc.length,
      r.storage.length,
      r.report.length,
      r.orphaned ? 'YES' : 'no',
      `"${firstRef}"`,
    ].join(','),
  );
}
writeFileSync(join(OUT, 'permission-coverage.csv'), csvLines.join('\n'));

// --------------------------------------------------------------------------
// Markdown
// --------------------------------------------------------------------------
const badge = (r: CoverageRow) => {
  switch (classifyCoverage(r)) {
    case 'orphaned':
      return '🔴 Orphaned';
    case 'ui-only':
      return '🟡 UI only';
    case 'backend-only':
      return '🔵 Backend only';
    case 'enforced':
      return '🟢 Enforced';
  }
};

const orphaned = matrix.rows.filter((r) => r.orphaned);
const byModule = new Map<string, CoverageRow[]>();
for (const r of matrix.rows) {
  if (!byModule.has(r.module)) byModule.set(r.module, []);
  byModule.get(r.module)!.push(r);
}

const md: string[] = [];
md.push('# Permission Coverage Matrix');
md.push('');
md.push(`_Generated ${matrix.generatedAt}. Do not edit by hand — run \`bunx tsx scripts/generate-permission-coverage.ts\`._`);
md.push('');
md.push(`**Total permissions:** ${matrix.rows.length}  \`|\`  **Orphaned:** ${matrix.orphanedCount}`);
md.push('');
md.push('Coverage classes:');
md.push('');
md.push('- 🟢 **Enforced** — appears in at least one UI surface **and** at least one backend surface (RLS / RPC / storage).');
md.push('- 🔵 **Backend only** — enforced by RLS / RPC / storage but no UI surface uses it. Safe, but the button that would trigger it is missing.');
md.push('- 🟡 **UI only** — a menu / route / button / report references it but no RLS / RPC / storage guard enforces it server-side. Frontend gate only — not security.');
md.push('- 🔴 **Orphaned** — used nowhere. Cannot be assigned to a role (server trigger `permission_orphaned` blocks it).');
md.push('');

if (orphaned.length > 0) {
  md.push('## Orphaned permissions');
  md.push('');
  md.push('These permissions exist in the `permissions` catalog but have no enforcement path anywhere. Either wire them up, or set `permissions.enforced = false` to make the intent explicit.');
  md.push('');
  md.push('| Module | Action |');
  md.push('| --- | --- |');
  for (const r of orphaned) md.push(`| \`${r.module}\` | \`${r.action}\` |`);
  md.push('');
}

const surfacesLine = (refs: { file: string; line: number }[]) =>
  refs.length === 0 ? '—' : `${refs.length} (\`${refs[0].file}:${refs[0].line}\`${refs.length > 1 ? ' + ' + (refs.length - 1) + ' more' : ''})`;

for (const [module, rows] of [...byModule.entries()].sort()) {
  md.push(`## \`${module}\``);
  md.push('');
  md.push('| Action | Coverage | Menu | Route | Button | RLS | RPC | Storage | Report |');
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows.sort((a, b) => a.action.localeCompare(b.action))) {
    md.push(
      `| \`${r.action}\` | ${badge(r)} | ${surfacesLine(r.menu)} | ${surfacesLine(r.route)} | ${surfacesLine(r.button)} | ${surfacesLine(r.rls)} | ${surfacesLine(r.rpc)} | ${surfacesLine(r.storage)} | ${surfacesLine(r.report)} |`,
    );
  }
  md.push('');
}

writeFileSync(join(OUT, 'permission-coverage.md'), md.join('\n'));

console.log(`permission-coverage: ${matrix.rows.length} rows, ${matrix.orphanedCount} orphaned`);
