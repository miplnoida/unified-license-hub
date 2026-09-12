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


  it('no destructive/mutating action buttons are unguarded (Slice 17 floor)', () => {
    const CRITICAL = new Set([
      'Delete', 'Approve', 'Reject', 'Assign', 'Escalate', 'Publish',
      'Archive', 'Configure', 'Bulk', 'Resubmit', 'Issue', 'Reopen',
      'Close', 'Import', 'Export',
    ]);
    const gaps = sites.filter((s) => !s.protected && CRITICAL.has(s.category));
    if (gaps.length > 0) {
       
      console.log('[rbac-audit] critical unguarded:', gaps.map((g) => `${g.file}:${g.line} ${g.category} "${g.button}"`));
    }
    expect(gaps.length, 'destructive/mutating buttons without PermissionGate/GuardedButton/data-rbac').toBe(0);
  });

  it('destructive/export categories keep 100% coverage (Slice 19 floor)', () => {
    // These categories must never regress below 100% — they represent the
    // highest-risk business actions.
    const HARD_FLOORS = ['Delete', 'Approve', 'Reject', 'Assign', 'Escalate', 'Publish', 'Archive', 'Export', 'Import', 'Issue', 'Reopen'];
    for (const cat of HARD_FLOORS) {
      const inCat = sites.filter((s) => s.category === cat);
      if (inCat.length === 0) continue;
      const unprot = inCat.filter((s) => !s.protected);
      expect(
        unprot.length,
        `${cat} floor breached: ${unprot.map((u) => `${u.file}:${u.line} "${u.button}"`).join(', ')}`,
      ).toBe(0);
    }
  });

  it('overall coverage stays at or above the Slice 22 baseline', () => {
    const total = sites.length;
    const prot = sites.filter((s) => s.protected).length;
    const pct = total === 0 ? 100 : (prot / total) * 100;
    // Slice 22: extended scanner to <ContextMenuItem>, expanded public
    // allow-list for benign navigation/framework controls, and annotated
    // the remaining Save/Create/Workflow/Report/Email sites. Coverage is
    // now 100% across all detected call sites.
    const BASELINE = 98;
    expect(pct).toBeGreaterThanOrEqual(BASELINE);
     
    console.log(`[rbac-audit] ${prot}/${total} protected (${pct.toFixed(1)}%)`);
  });

  it('Submit category holds at 100% (Slice 21 floor)', () => {
    const inCat = sites.filter((s) => s.category === 'Submit');
    const unprot = inCat.filter((s) => !s.protected);
    expect(
      unprot.length,
      `Submit floor breached: ${unprot.map((u) => `${u.file}:${u.line} "${u.button}"`).join(', ')}`,
    ).toBe(0);
  });

  it('overall coverage is 100% (Slice 22 hard floor)', () => {
    const total = sites.length;
    const unprot = sites.filter((s) => !s.protected);
    expect(
      unprot.length,
      `Unguarded action sites remain:\n${unprot.map((u) => `  - ${u.file}:${u.line} [${u.category}] "${u.button}"`).join('\n')}`,
    ).toBe(0);
    expect(total).toBeGreaterThan(0);
  });
});

