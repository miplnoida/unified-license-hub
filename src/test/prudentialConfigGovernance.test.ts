import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * F8-W1D (GAP-F8-03) — Prudential ratios/thresholds/analytics must have ONE
 * governance owner: the existing `prudential_supervision` module and its
 * existing config authority. Returns filing/configuration stays under
 * `returns_management`. Legacy /admin/returns/... URLs keep resolving.
 */
const routes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const nav = readFileSync('src/config/navigation.tsx', 'utf8');

const PRU_PATHS = [
  '/admin/returns/prudential/thresholds',
  '/admin/returns/prudential/ratios',
  '/admin/returns/prudential/analytics',
];

function routeLine(path: string): string {
  const line = routes.split('\n').find((l) => l.includes(`path="${path}"`));
  expect(line, `route ${path} must still exist`).toBeTruthy();
  return line!;
}

describe('prudential config governance ownership', () => {
  it('keeps the legacy URLs resolving to their prudential config screens', () => {
    expect(routeLine(PRU_PATHS[0])).toContain('<PrudentialThresholds />');
    expect(routeLine(PRU_PATHS[1])).toContain('<PrudentialRatios />');
    expect(routeLine(PRU_PATHS[2])).toContain('<PrudentialAnalytics />');
  });

  it('governs all three routes with the canonical prudential module', () => {
    for (const p of PRU_PATHS) {
      const line = routeLine(p);
      expect(line).toContain('module="prudential_supervision"');
      expect(line).not.toContain('module="returns_management"');
    }
  });

  it('requires the existing prudential config authority on the config screens', () => {
    expect(routeLine(PRU_PATHS[0])).toContain('action="manage_config"');
    expect(routeLine(PRU_PATHS[1])).toContain('action="manage_config"');
    expect(routeLine(PRU_PATHS[2])).toContain('action="run_analytics"');
  });

  it('exposes exactly one active navigation entry per prudential config screen, owned by prudential_supervision', () => {
    for (const p of PRU_PATHS) {
      const entries = nav
        .split('\n')
        .filter((l) => l.includes(`href: '${p}'`) && !l.trimStart().startsWith('//'));
      expect(entries, `single nav entry for ${p}`).toHaveLength(1);
      expect(entries[0]).toContain("module: 'prudential_supervision'");
      expect(entries[0]).not.toContain("module: 'returns_management'");
    }
  });

  it('leaves returns filing/configuration screens under returns_management', () => {
    for (const p of ['/admin/returns/types', '/admin/returns/configurations', '/admin/returns/validations']) {
      expect(routeLine(p)).toContain('module="returns_management"');
    }
  });
});
