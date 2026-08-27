import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCoverage, classifyCoverage, type CatalogEntry } from '@/lib/rbac/coverageScanner';

/**
 * GAP-F0-02 — permission catalogue integrity gate.
 *
 * Two invariants:
 *  1. NO INVALID REFERENCES — every permission referenced by UI guards, route
 *     guards, RLS/RPC policies, storage policies or edge gates exists in the
 *     catalogue snapshot (`src/lib/rbac/catalog.json`, synced from
 *     `public.sec_permissions`). An unknown pair silently denies everyone.
 *  2. NO UNACCOUNTED ORPHANS — every catalogued pair with no reference at all
 *     carries an explicit disposition in the register.
 */
const ROOT = resolve(__dirname, '../../..');

const catalog = JSON.parse(
  readFileSync(resolve(ROOT, 'src/lib/rbac/catalog.json'), 'utf8'),
) as CatalogEntry[];
const register = JSON.parse(
  readFileSync(resolve(ROOT, 'docs/rbac/permission-disposition.json'), 'utf8'),
) as { rows: { module: string; action: string; disposition: string; rationale: string }[] };

const matrix = buildCoverage(ROOT, catalog);
const cataloguePairs = new Set(catalog.map((c) => `${c.module}.${c.name}`));

describe('permission catalogue integrity (GAP-F0-02)', () => {
  it('every referenced permission exists in the catalogue', () => {
    const invalid = matrix.rows
      .filter((r) => classifyCoverage(r) !== 'orphaned')
      .map((r) => `${r.module}.${r.action}`)
      .filter((pair) => !cataloguePairs.has(pair));
    expect(invalid, `references to uncatalogued permissions: ${invalid.join(', ')}`).toEqual([]);
  });

  it('every orphaned catalogue entry is dispositioned', () => {
    const dispositioned = new Set(register.rows.map((r) => `${r.module}.${r.action}`));
    const orphans = matrix.rows
      .filter((r) => classifyCoverage(r) === 'orphaned')
      .map((r) => `${r.module}.${r.action}`);
    const undispositioned = orphans.filter((p) => !dispositioned.has(p));
    expect(
      undispositioned,
      `orphans missing from docs/rbac/permission-disposition.json: ${undispositioned.join(', ')}`,
    ).toEqual([]);
  });

  it('the disposition register carries no stale rows', () => {
    const orphans = new Set(
      matrix.rows.filter((r) => classifyCoverage(r) === 'orphaned').map((r) => `${r.module}.${r.action}`),
    );
    const stale = register.rows
      .map((r) => `${r.module}.${r.action}`)
      .filter((p) => !orphans.has(p) || !cataloguePairs.has(p));
    expect(stale, `stale disposition rows (now referenced or removed): ${stale.join(', ')}`).toEqual([]);
  });

  it('every disposition has a rationale', () => {
    for (const r of register.rows) {
      expect(r.disposition, `${r.module}.${r.action}`).toBeTruthy();
      expect((r.rationale ?? '').length, `${r.module}.${r.action}`).toBeGreaterThan(20);
    }
  });
});
