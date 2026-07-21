import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCoverage, classifyCoverage, type CatalogEntry } from '@/lib/rbac/coverage';

const ROOT = resolve(__dirname, '../../..');
const CATALOG_PATH = resolve(ROOT, 'src/lib/rbac/catalog.json');

describe('permission coverage scanner', () => {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as CatalogEntry[];
  const matrix = buildCoverage(ROOT, catalog);

  it('emits one row per catalogued permission', () => {
    expect(matrix.rows.length).toBeGreaterThanOrEqual(catalog.length);
  });

  it('detects RLS/RPC enforcement via has_permission()', () => {
    const enforced = matrix.rows.filter(
      (r) => r.rls.length + r.rpc.length + r.storage.length > 0,
    );
    expect(enforced.length).toBeGreaterThan(0);
  });

  it('finds at least one route guard via <M module="…">', () => {
    const routed = matrix.rows.filter((r) => r.route.length > 0);
    expect(routed.length).toBeGreaterThan(0);
  });

  it('publishes the generated docs artifact when present', () => {
    // The generator writes docs/rbac/permission-coverage.json — CI runs the
    // generator before tests. If the file is missing, this is only a warning
    // (the scanner test above still validates the primitive).
    const p = resolve(ROOT, 'docs/rbac/permission-coverage.json');
    if (existsSync(p)) {
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      expect(Array.isArray(doc.rows)).toBe(true);
    }
  });

  it('classifyCoverage returns one of the four legal states for every row', () => {
    for (const r of matrix.rows) {
      expect(['orphaned', 'ui-only', 'backend-only', 'enforced']).toContain(classifyCoverage(r));
    }
  });
});
