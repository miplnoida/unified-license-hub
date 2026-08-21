// EPR-03 / P11 — Enforcement process independence guardrails.
//
// Enforcement is an independent regulatory process. These tests fail if the
// browser ever regains lifecycle authority, if the retired lifecycle surfaces
// come back, or if Enforcement is re-coupled to the Complaint workflow.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const WORKSPACE = 'src/pages/enforcement/EnforcementWorkspace.tsx';
const QUEUE = 'src/pages/enforcement/EnforcementWorkQueue.tsx';
const OPS = 'src/lib/enforcementProcessOps.ts';

describe('EPR-03 enforcement process independence', () => {
  it('retired enforcement lifecycle surfaces are deleted', () => {
    for (const legacy of [
      'src/pages/enforcement/EnforcementList.tsx',
      'src/pages/enforcement/EnforcementDetail.tsx',
      'src/components/enforcement/EnforcementLifecyclePanel.tsx',
      'src/components/enforcement/EnforcementObligationsPanel.tsx',
      'src/lib/enforcementGovernedOps.ts',
    ]) {
      expect(existsSync(legacy), `${legacy} must be retired`).toBe(false);
    }
  });

  it('routes point at the canonical work queue and case workspace', () => {
    const routes = readFileSync('src/routes/dashboardRoutes.tsx', 'utf8');
    expect(routes).toContain("path=\"/enforcement\"");
    expect(routes).toContain('EnforcementWorkQueue');
    expect(routes).toContain("path=\"/enforcement/:id\"");
    expect(routes).toContain('EnforcementWorkspace');
    expect(routes).not.toContain('EnforcementDetail');
  });

  it('lifecycle authority is server-owned', () => {
    const ops = readFileSync(OPS, 'utf8');
    expect(ops).toContain('enforcement_referral_create');
    expect(ops).toContain('enforcement_case_action');
    expect(ops).not.toContain('execute_complaint_workflow_action');
    expect(ops).not.toContain('enforcement_lifecycle_action');
  });

  it('no enforcement screen writes lifecycle tables directly', () => {
    for (const file of [WORKSPACE, QUEUE, 'src/components/enforcement/EntityEnforcementPanel.tsx']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/from\((['"])enforcement_actions\1\)\.(insert|update|delete|upsert)/);
      expect(src, file).not.toMatch(/from\((['"])enforcement_case_events\1\)\.(insert|update|delete|upsert)/);
      expect(src, file).not.toMatch(/from\((['"])enforcement_obligations\1\)\.(insert|update|delete|upsert)/);
    }
  });

  it('Entity 360 enforcement tab is a read-only summary', () => {
    const tab = readFileSync('src/components/entity-detail/EnforcementTab.tsx', 'utf8');
    expect(tab).toContain('EntityEnforcementPanel');
    const panel = readFileSync('src/components/enforcement/EntityEnforcementPanel.tsx', 'utf8');
    expect(panel).not.toContain('enforcementCaseAction');
    expect(panel).not.toContain('enforcementReferralCreate');
  });

  it('every supported referral source is offered by the referral dialog', () => {
    const ops = readFileSync(OPS, 'utf8');
    for (const kind of [
      'COMPLAINT',
      'CONDUCT_INVESTIGATION',
      'THEMATIC_FINDING',
      'PRUDENTIAL_BREACH',
      'PRUDENTIAL_ACTION',
      'EXAMINATION_FINDING',
      'LICENSING_VIOLATION',
      'FP_MATTER',
      'MANUAL_REFERRAL',
    ]) {
      expect(ops, kind).toContain(kind);
    }
  });

  it('the certification script is retained as EPR-03 evidence', () => {
    const cert = readFileSync('scripts/epr03/enforcement-certification.sql', 'utf8');
    expect(cert).toContain('PRUDENTIAL_BREACH');
    expect(cert).toContain('Maker/checker separation absolute');
  });
});
