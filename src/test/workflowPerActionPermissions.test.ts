/**
 * Documents the contract that the WorkflowPanel uses from
 * user_can_act_on_workflow_step. The RPC returns per-action flags and the
 * panel translates those into buttons. This test exercises a small pure
 * helper that mirrors the panel's button-building logic so we can regression-
 * test the rules without rendering React.
 */
import { describe, it, expect } from 'vitest';

type WorkflowActionType = 'approve' | 'reject' | 'send_back' | 'escalate' | 'request_resubmission';

interface CanActFlags {
  can_add_remark?: boolean;
  can_reject?: boolean;
  can_forward?: boolean;
  can_approve?: boolean;
  can_send_back?: boolean;
  can_escalate?: boolean;
  can_request_resubmission?: boolean;
}

function buildButtonLabels(f: CanActFlags): string[] {
  const out: string[] = [];
  if (f.can_forward) out.push('Forward to Next Level');
  if (f.can_approve) out.push('Approve');
  if (f.can_reject) out.push('Reject');
  if (f.can_send_back) out.push('Send Back to Junior');
  if (f.can_escalate) out.push('Escalate to Senior');
  if (f.can_request_resubmission) out.push('Request Resubmission');
  if (f.can_add_remark) out.push('Add Remark');
  return out;
}

describe('per-action workflow permissions', () => {
  it('regulator (not approver) with remark permission only sees Add Remark', () => {
    expect(buildButtonLabels({ can_add_remark: true })).toEqual(['Add Remark']);
  });

  it('regulator (not approver) with reject allowed sees Reject + Add Remark, never Forward/Approve', () => {
    const labels = buildButtonLabels({ can_add_remark: true, can_reject: true });
    expect(labels).toContain('Reject');
    expect(labels).toContain('Add Remark');
    expect(labels).not.toContain('Forward to Next Level');
    expect(labels).not.toContain('Approve');
  });

  it('configured approver on non-final step with approve+reject configured sees Forward + Reject', () => {
    const labels = buildButtonLabels({
      can_add_remark: true, can_forward: true, can_reject: true, can_send_back: true,
    });
    expect(labels).toContain('Forward to Next Level');
    expect(labels).not.toContain('Approve');
    expect(labels).toContain('Reject');
    expect(labels).toContain('Send Back to Junior');
  });

  it('final-level approver sees Approve (not Forward) + Reject', () => {
    const labels = buildButtonLabels({
      can_add_remark: true, can_approve: true, can_reject: true,
    });
    expect(labels).toContain('Approve');
    expect(labels).not.toContain('Forward to Next Level');
    expect(labels).toContain('Reject');
  });

  it('non-internal viewer (all flags false) sees nothing', () => {
    expect(buildButtonLabels({})).toEqual([]);
  });
});
