// Guardrails: the complaint + enforcement lifecycle must be workflow-driven.
// React code is presentation only — it must not mutate enforcement lifecycle
// tables, dispatch notifications directly, or gate actions on hardcoded
// status strings.

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function rg(pattern: string, path = 'src'): string[] {
  try {
    const out = execSync(`rg --no-heading -n ${JSON.stringify(pattern)} ${path}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

describe('complaint workflow guardrails', () => {
  it('src/lib/complaintNotifications.ts is deleted', () => {
    expect(existsSync('src/lib/complaintNotifications.ts')).toBe(false);
  });

  it('no notifyComplaintLifecycle references remain', () => {
    expect(rg('notifyComplaintLifecycle')).toEqual([]);
  });

  it('no hardcoded lifecycle gates remain in enforcement/complaint pages', () => {
    const src = readFileSync('src/pages/enforcement/EnforcementDetail.tsx', 'utf8');
    expect(src).not.toMatch(/canIssueNotice|canRecordResponse|canDecide|canAppeal|canCloseOrWithdraw/);
    expect(src).not.toMatch(/from\('enforcement_actions'\)\.(update|insert|delete)/);
    expect(src).not.toMatch(/from\('enforcement_case_events'\)\.insert/);
  });

  it('ComplaintDetail delegates lifecycle to WorkflowActionPanel', () => {
    const src = readFileSync('src/pages/complaints/ComplaintDetail.tsx', 'utf8');
    expect(src).toContain('WorkflowActionPanel');
    // No direct lifecycle RPC calls left in the React file.
    expect(src).not.toMatch(/rpc\(['"]resolve_complaint['"]/);
    expect(src).not.toMatch(/rpc\(['"]close_complaint['"]/);
    expect(src).not.toMatch(/rpc\(['"]escalate_complaint_to_enforcement['"]/);
    expect(src).not.toMatch(/rpc\(['"]start_complaint_investigation['"]/);
  });

  it('EnforcementDetail is presentation-only (no lifecycle mutations, no direct events insert)', () => {
    const src = readFileSync('src/pages/enforcement/EnforcementDetail.tsx', 'utf8');
    expect(src).toContain('WorkflowActionPanel');
    expect(src).not.toMatch(/status\s*===\s*'notice_issued'/);
    expect(src).not.toMatch(/status\s*===\s*'decided'/);
    expect(src).not.toMatch(/status\s*===\s*'response_received'/);
  });
});
