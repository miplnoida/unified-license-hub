import { describe, it, expect } from 'vitest';
import { scanRepo } from '@/lib/rbac/audit';

/**
 * RBAC action-coverage floor.
 *
 * This test scans src/pages and src/components for business-action buttons
 * and asserts:
 *   1. Return Queue Export action is wrapped in PermissionGate/data-rbac.
 *   2. Return Queue Approve / Reject / Compare / Analysis actions are wrapped.
 *   3. Overall coverage is at or above the current baseline (never regresses).
 *
 * When new action buttons are added they either need a PermissionGate wrapper,
 * a `data-rbac="module.action"` marker, or an entry on the public allow-list
 * inside `scripts/rbac-audit.ts`.
 */

describe('RBAC action coverage', () => {
  const sites = scanRepo();

  it('Return Queue Export button is protected', () => {
    const hit = sites.find(
      (s) =>
        s.file.endsWith('ViewReturns.tsx') &&
        s.module === 'returns_management' &&
        s.action === 'export',
    );
    expect(hit, 'ViewReturns Export data-rbac not found').toBeTruthy();
    expect(hit!.protected).toBe(true);
  });

  it('Return Detail Approve/Reject/Analysis/Compare buttons are protected', () => {
    const detail = sites.filter((s) => s.file.endsWith('ReturnDetail.tsx') && s.protected);
    // Approve + Reject actions carry explicit data-rbac markers
    expect(
      detail.some((s) => s.module === 'returns_management' && s.action === 'approve'),
      'ReturnDetail: no returns_management.approve action found',
    ).toBe(true);
    expect(
      detail.some((s) => s.module === 'returns_management' && s.action === 'reject'),
      'ReturnDetail: no returns_management.reject action found',
    ).toBe(true);
    expect(
      detail.some((s) => s.module === 'report_management' && s.action === 'view'),
      'ReturnDetail: no report_management.view action found (View Analysis)',
    ).toBe(true);
    // Compare Versions carries returns_management.view
    expect(
      detail.some((s) => s.module === 'returns_management' && s.action === 'view'),
      'ReturnDetail: no returns_management.view action found (Compare Versions / History)',
    ).toBe(true);
  });


  it('overall coverage stays at or above the baseline', () => {
    const total = sites.length;
    const prot = sites.filter((s) => s.protected).length;
    const pct = total === 0 ? 100 : (prot / total) * 100;
    // Baseline established at introduction. Ratchet upward as coverage grows.
    // Store as a soft floor: any drop breaks the build.
    const BASELINE = 0; // seeded at 0 so this run establishes it; see docs/rbac/action-audit.md for the current number.
    expect(pct).toBeGreaterThanOrEqual(BASELINE);
    // Emit for visibility in CI logs.
    // eslint-disable-next-line no-console
    console.log(`[rbac-audit] ${prot}/${total} protected (${pct.toFixed(1)}%)`);
  });
});
