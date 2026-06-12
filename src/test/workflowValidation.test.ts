/**
 * Pure validators for the workflow builder.
 */
import { describe, it, expect } from 'vitest';
import {
  validateStepOrder, validateApprover, validateSla,
  validateStepActions, validateWorkflow,
} from '@/lib/workflowValidation';
import type { WorkflowStep } from '@/hooks/useWorkflowEngine';
import type { StepAction } from '@/hooks/useStepActions';

const step = (over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id: over.id ?? 's1',
  workflow_id: 'wf',
  step_order: over.step_order ?? 1,
  name: over.name ?? 'Step',
  description: null,
  approver_role: 'admin' as any,
  approver_role_id: 'r1',
  approver_type: over.approver_type ?? 'role_based_user',
  approver_config: over.approver_config ?? { role_ids: ['r1'] },
  auto_approve_on_timeout: false,
  step_entry_notifications_enabled: true,
  step_type: 'sequential',
  sla_hours: over.sla_hours ?? 24,
  is_required: true,
  allowed_actions: over.allowed_actions ?? ['approve'],
  escalation_role: null,
  escalation_after_hours: null,
  condition: null,
  created_at: '',
});

const action = (over: Partial<StepAction> = {}): StepAction => ({
  id: over.id ?? 'a1',
  step_id: over.step_id ?? 's1',
  action_type: over.action_type ?? 'approve',
  label: over.label ?? 'Approve',
  require_comments: over.require_comments ?? false,
  result_status_override: over.result_status_override ?? null,
  next_step_mode: over.next_step_mode ?? 'next',
  next_step_id: over.next_step_id ?? null,
  end_state: over.end_state ?? null,
  sort_order: 0,
  is_enabled: true,
  require_digital_signature: false,
  signature_data_url: null,
  created_at: '',
  updated_at: '',
});

describe('workflowValidation', () => {
  it('flags duplicate step_order', () => {
    const issues = validateStepOrder([step({ id: 'a', step_order: 1 }), step({ id: 'b', step_order: 1 })]);
    expect(issues.length).toBe(2);
    expect(issues[0].field).toBe('step_order');
  });

  it('requires user_ids when approver_type is specific_users', () => {
    const issues = validateApprover(step({ approver_type: 'specific_users', approver_config: {} }));
    expect(issues.some(i => i.message.includes('Specific Users'))).toBe(true);
  });

  it('accepts specific_users when ids exist', () => {
    const issues = validateApprover(step({ approver_type: 'specific_users', approver_config: { user_ids: ['u1'] } }));
    expect(issues).toEqual([]);
  });

  it('rejects non-positive SLA', () => {
    expect(validateSla(step({ sla_hours: 0 }))).toHaveLength(1);
    expect(validateSla(step({ sla_hours: 24 }))).toHaveLength(0);
  });

  it('requires at least one action per step', () => {
    expect(validateStepActions(step(), [])).toHaveLength(1);
  });

  it('flags Move-to-Specific-Step without target', () => {
    const issues = validateStepActions(step(), [action({ next_step_mode: 'specific_step' })]);
    expect(issues[0].message).toMatch(/Specific Step/);
  });

  it('flags End-Workflow without end_state', () => {
    const issues = validateStepActions(step(), [action({ next_step_mode: 'end_workflow' })]);
    expect(issues[0].message).toMatch(/end state/i);
  });

  it('flags duplicate action_types within a step', () => {
    const issues = validateStepActions(step(), [
      action({ id: 'a1', action_type: 'approve' }),
      action({ id: 'a2', action_type: 'approve' }),
    ]);
    expect(issues.some(i => /Duplicate action type/.test(i.message))).toBe(true);
  });

  it('requires final step to have an end-workflow action', () => {
    const s1 = step({ id: 's1', step_order: 1 });
    const s2 = step({ id: 's2', step_order: 2 });
    const result = validateWorkflow({
      steps: [s1, s2],
      actionsByStep: {
        s1: [action({ id: 'a1', next_step_mode: 'next' })],
        s2: [action({ id: 'a2', next_step_mode: 'next' })], // no end_workflow
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.message.includes('End Workflow'))).toBe(true);
  });

  it('accepts a valid workflow', () => {
    const s = step();
    const result = validateWorkflow({
      steps: [s],
      actionsByStep: {
        s1: [action({ next_step_mode: 'end_workflow', end_state: 'approved' })],
      },
    });
    expect(result.ok).toBe(true);
  });
});
