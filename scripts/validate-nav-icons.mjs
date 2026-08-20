#!/usr/bin/env node
/**
 * Navigation icon validator.
 *
 * Fails when any ACTIVE row in `sec_navigation_items` carries an `icon_key`
 * that is missing, empty or absent from the approved catalogue in
 * `src/lib/rbac/navIcons.tsx`. A placeholder dot in the sidebar is a data
 * defect, so this runs in CI alongside the other guard scripts.
 *
 *   node scripts/validate-nav-icons.mjs
 *
 * Skips (exit 0) when no database connection is configured.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as lucide from 'lucide-react';

const source = readFileSync(new URL('../src/lib/rbac/navIcons.tsx', import.meta.url), 'utf8');
const mapBody = source.split('export const NAV_ICON_MAP')[1]?.split('};')[0] ?? '';
const approved = new Set(
  mapBody.replace(/^[^{]*\{/, '').split(/[\s,]+/).map((t) => t.trim()).filter((t) => /^[A-Z][A-Za-z0-9]*$/.test(t)),
);

if (approved.size === 0) {
  console.error('validate-nav-icons: could not parse NAV_ICON_MAP');
  process.exit(1);
}

// 1) Every approved key must be a real lucide export.
const notReal = [...approved].filter((k) => !(k in lucide));
if (notReal.length) {
  console.error(`validate-nav-icons: NAV_ICON_MAP references non-existent lucide icons: ${notReal.join(', ')}`);
  process.exit(1);
}

if (!process.env.PGHOST) {
  console.log(`validate-nav-icons: ${approved.size} approved icons valid. No database configured — skipping data check.`);
  process.exit(0);
}

const rows = execFileSync('psql', [
  '-At', '-F', '|', '-c',
  "select key, coalesce(icon_key,'') from public.sec_navigation_items where is_active order by key",
], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map((l) => l.split('|'));

const offenders = rows.filter(([, icon]) => !icon || !approved.has(icon));
if (offenders.length) {
  console.error('validate-nav-icons: navigation items with unapproved or missing icon_key:');
  offenders.forEach(([key, icon]) => console.error(`  ${key} -> ${icon || '(empty)'}`));
  process.exit(1);
}

console.log(`validate-nav-icons: OK — ${rows.length} active navigation items, all icons approved.`);
