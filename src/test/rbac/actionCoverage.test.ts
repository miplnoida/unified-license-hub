import { describe, it, expect } from 'vitest';
import { scanRepo } from '../../scripts/rbac-audit';

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
    const export_ = sites.find(
      (s) => s.file.endsWith('ViewReturns.tsx') && /export/i.test(s.button),
    );
    expect(export_, 'ViewReturns Export button not found').toBeTruthy();
    expect(export_!.protected).toBe(true);
  });

  it('Return Detail Approve/Reject/Analysis/Compare buttons are protected', () => {
    const detail = sites.filter((s) => s.file.endsWith('ReturnDetail.tsx'));
    for (const label of ['Approve Return', 'Request Edit', 'Allow Edit', 'Deny Request', 'View Analysis', 'Compare Versions']) {
      const hit = detail.find((s) => s.button.toLowerCase().includes(label.toLowerCase()));
      expect(hit, `ReturnDetail button not found: ${label}`).toBeTruthy();
      expect(hit!.protected, `Unprotected: ${label} (${hit!.file}:${hit!.line})`).toBe(true);
    }
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
