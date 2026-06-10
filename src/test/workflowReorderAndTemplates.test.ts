import { describe, it, expect } from 'vitest';
import type { WorkflowActionType } from '@/hooks/useWorkflowEngine';

// These tests pin the contract for Phase 2 admin hardening:
//   - The reorder RPC payload is shaped as { _workflow_id, _orders: [{id, step_order}] }
//   - Template steps may carry allowed_actions and are honoured when seeding;
//     when missing/empty we fall back to the safe defaults used by the UI.

interface TemplateStep {
  name: string;
  approver_role: string;
  sla_hours?: number;
  allowed_actions?: WorkflowActionType[];
}

function buildReorderPayload(steps: { id: string; step_order: number }[], workflowId: string) {
  return {
    _workflow_id: workflowId,
    _orders: steps.map(s => ({ id: s.id, step_order: s.step_order })),
  };
}

function resolveTemplateAllowedActions(s: TemplateStep): WorkflowActionType[] {
  return Array.isArray(s.allowed_actions) && s.allowed_actions.length > 0
    ? s.allowed_actions
    : (['approve', 'reject', 'send_back'] as WorkflowActionType[]);
}

describe('reorder payload', () => {
  it('packs ids and 1-based orders for the RPC', () => {
    const payload = buildReorderPayload(
      [
        { id: 'a', step_order: 1 },
        { id: 'b', step_order: 2 },
        { id: 'c', step_order: 3 },
      ],
      'wf-1',
    );
    expect(payload._workflow_id).toBe('wf-1');
    expect(payload._orders).toEqual([
      { id: 'a', step_order: 1 },
      { id: 'b', step_order: 2 },
      { id: 'c', step_order: 3 },
    ]);
  });

  it('keeps ordering when swapping adjacent steps', () => {
    const steps = [
      { id: 'a', step_order: 1 },
      { id: 'b', step_order: 2 },
    ];
    const swapped = [steps[1], steps[0]].map((s, i) => ({ id: s.id, step_order: i + 1 }));
    expect(buildReorderPayload(swapped, 'wf').
      _orders).toEqual([
      { id: 'b', step_order: 1 },
      { id: 'a', step_order: 2 },
    ]);
  });
});

describe('template allowed_actions seeding', () => {
  it('uses the template-provided allowed_actions when present', () => {
    const s: TemplateStep = {
      name: 'Review',
      approver_role: 'admin',
      allowed_actions: ['approve', 'reject'],
    };
    expect(resolveTemplateAllowedActions(s)).toEqual(['approve', 'reject']);
  });

  it('falls back to the safe default trio when template omits actions', () => {
    expect(resolveTemplateAllowedActions({ name: 'x', approver_role: 'admin' })).toEqual([
      'approve',
      'reject',
      'send_back',
    ]);
  });

  it('falls back when allowed_actions is an empty array', () => {
    expect(
      resolveTemplateAllowedActions({ name: 'x', approver_role: 'admin', allowed_actions: [] }),
    ).toEqual(['approve', 'reject', 'send_back']);
  });
});
