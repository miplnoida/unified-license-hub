// Guardrails: the complaint + enforcement lifecycle must be workflow-driven.
// React code is presentation only — it must not mutate enforcement lifecycle
// tables, dispatch notifications directly, or gate actions on hardcoded
// status strings.

import { describe, expect, it } from 'vitest';
import { deriveInvestigationMode } from '@/lib/complaintWorkflow';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Run ripgrep and return matching lines.
 *
 * Honest exit-code handling:
 *   0  -> matches were found; return them
 *   1  -> no matches; return []
 *   2+ -> ripgrep or shell error (missing binary, invalid path, unreadable
 *         file, etc.). We MUST NOT treat that as "no matches" — that would
 *         let real regressions slip through silently. Throw so the test fails
 *         loudly with the underlying stderr.
 */
function rg(pattern: string, path = 'src'): string[] {
  try {
    const out = execSync(`rg --no-heading -n ${JSON.stringify(pattern)} ${path}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim().split('\n').filter(Boolean);
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: Buffer | string; message?: string };
    // ripgrep exit code 1 means "no matches" — a legitimate empty result.
    if (e && e.status === 1) return [];
    const stderr =
      typeof e?.stderr === 'string' ? e.stderr : e?.stderr?.toString?.() ?? '';
    throw new Error(
      `ripgrep failed (exit=${e?.status ?? 'n/a'}) for pattern ${JSON.stringify(pattern)} in ${path}: ${stderr || e?.message || 'unknown error'}`,
    );
  }
}

describe('complaint workflow guardrails', () => {
  it('src/lib/complaintNotifications.ts is deleted', () => {
    expect(existsSync('src/lib/complaintNotifications.ts')).toBe(false);
  });

  it('no notifyComplaintLifecycle references remain in production code', () => {
    const hits = rg('notifyComplaintLifecycle').filter((l) => !l.startsWith('src/test/'));
    expect(hits).toEqual([]);
  });

  it('no hardcoded lifecycle gates remain in the enforcement workspace', () => {
    const src = readFileSync('src/pages/enforcement/EnforcementWorkspace.tsx', 'utf8');
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

  it('EPR-03: the enforcement workspace never borrows the complaint workflow', () => {
    const src = readFileSync('src/pages/enforcement/EnforcementWorkspace.tsx', 'utf8');
    expect(src).toContain('enforcementCaseAction');
    expect(src).not.toContain('execute_complaint_workflow_action');
    expect(src).not.toContain('WorkflowActionPanel');
    expect(src).not.toMatch(/status\s*===\s*'notice_issued'/);
    expect(src).not.toMatch(/status\s*===\s*'decided'/);
    expect(src).not.toMatch(/status\s*===\s*'response_received'/);
  });
});

describe('deriveInvestigationMode', () => {
  const step = (over: Partial<any> = {}) => ({
    step_key: 's1', label: 'Step 1', order: 1, is_current: true, is_terminal: false, is_start: true, ...over,
  });

  it('is not relevant when no workflow step and no records', () => {
    expect(deriveInvestigationMode({ tracking: {}, actions: [], status: 'new', hasRecords: false })).toBe('not_relevant');
  });

  it('is read-only when no step but records exist', () => {
    expect(deriveInvestigationMode({ tracking: {}, actions: [], status: 'new', hasRecords: true })).toBe('read_only');
  });

  it('is active on a non-terminal current step with an available configured action', () => {
    expect(deriveInvestigationMode({
      tracking: { current_step_key: 's1', steps: [step()] },
      actions: [{ action_key: 'a', label: 'Forward' }],
      status: 'under_review',
      hasRecords: false,
    })).toBe('active');
  });

  it('is read-only when the viewer has no configured action, on a terminal step, or when closed', () => {
    expect(deriveInvestigationMode({
      tracking: { current_step_key: 's1', steps: [step()] }, actions: [], status: 'under_review', hasRecords: true,
    })).toBe('read_only');
    expect(deriveInvestigationMode({
      tracking: { current_step_key: 's1', steps: [step({ is_terminal: true })] },
      actions: [{ action_key: 'a', label: 'Close' }], status: 'under_review', hasRecords: true,
    })).toBe('read_only');
    expect(deriveInvestigationMode({ tracking: {}, actions: [], status: 'closed', hasRecords: true })).toBe('read_only');
  });

  it('falls back to active when workflow context is unknown', () => {
    expect(deriveInvestigationMode({
      tracking: null, actions: null, status: 'under_review', hasRecords: false, contextUnknown: true,
    })).toBe('active');
  });
});
