/**
 * Pure validators for workflow builder. Used both by the UI (inline errors)
 * and any future "Publish" gate. No DB calls.
 */
import type { WorkflowStep } from '@/hooks/useWorkflowEngine';
import type { StepAction } from '@/hooks/useStepActions';

export interface StepValidationIssue {
  step_id: string;
  field: string;
  message: string;
}

export function validateStepOrder(steps: WorkflowStep[]): StepValidationIssue[] {
  const issues: StepValidationIssue[] = [];
  const seen = new Map<number, string[]>();
  for (const s of steps) {
    const arr = seen.get(s.step_order) || [];
    arr.push(s.id);
    seen.set(s.step_order, arr);
  }
  for (const [order, ids] of seen.entries()) {
    if (ids.length > 1) {
      for (const id of ids) {
        issues.push({
          step_id: id,
          field: 'step_order',
          message: `Duplicate step order ${order}`,
        });
      }
    }
  }
  return issues;
}

export function validateApprover(step: WorkflowStep): StepValidationIssue[] {
  const issues: StepValidationIssue[] = [];
  if (step.approver_type === 'specific_users') {
    const ids = step.approver_config?.user_ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) {
      issues.push({
        step_id: step.id,
        field: 'approver_config.user_ids',
        message: 'Specific Users approver requires at least one user',
      });
    }
  } else {
    const hasRoleId = !!step.approver_role_id;
    const hasCfgRoles = Array.isArray(step.approver_config?.role_ids) && step.approver_config!.role_ids!.length > 0;
    if (!hasRoleId && !hasCfgRoles) {
      issues.push({
        step_id: step.id,
        field: 'approver_role_id',
        message: 'Role Based User approver requires at least one role',
      });
    }
  }
  return issues;
}

export function validateSla(step: WorkflowStep): StepValidationIssue[] {
  if (step.sla_hours == null) return [];
  if (!Number.isFinite(step.sla_hours) || step.sla_hours <= 0) {
    return [{
      step_id: step.id,
      field: 'sla_hours',
      message: 'SLA hours must be a positive number',
    }];
  }
  return [];
}

export function validateStepActions(step: WorkflowStep, actions: StepAction[]): StepValidationIssue[] {
  const issues: StepValidationIssue[] = [];
  if (actions.length === 0) {
    issues.push({
      step_id: step.id,
      field: 'actions',
      message: 'Step must have at least one action',
    });
  }
  // Duplicate action_type detection — blocks save/publish even if legacy data
  // somehow bypassed the unique (step_id, action_type) constraint.
  const seenTypes = new Map<string, number>();
  for (const a of actions) {
    seenTypes.set(a.action_type, (seenTypes.get(a.action_type) ?? 0) + 1);
  }
  for (const [t, n] of seenTypes.entries()) {
    if (n > 1) {
      issues.push({
        step_id: step.id,
        field: 'actions',
        message: `Duplicate action type "${t}" — each action type may appear only once per step`,
      });
    }
  }
  for (const a of actions) {
    if (a.next_step_mode === 'specific_step' && !a.next_step_id) {
      issues.push({
        step_id: step.id,
        field: `action.${a.id}.next_step_id`,
        message: `"${a.label || a.action_type}" → Specific Step needs a target step`,
      });
    }
    if (a.next_step_mode === 'end_workflow' && !a.end_state) {
      issues.push({
        step_id: step.id,
        field: `action.${a.id}.end_state`,
        message: `"${a.label || a.action_type}" → End Workflow needs an end state`,
      });
    }
  }
  return issues;
}

export interface WorkflowValidationResult {
  issues: StepValidationIssue[];
  ok: boolean;
}

export function validateWorkflow(params: {
  steps: WorkflowStep[];
  actionsByStep: Record<string, StepAction[]>;
}): WorkflowValidationResult {
  const issues: StepValidationIssue[] = [];
  if (params.steps.length === 0) {
    issues.push({ step_id: '', field: 'steps', message: 'Workflow must have at least one step' });
  }
  issues.push(...validateStepOrder(params.steps));
  // Sort by step_order to find last step
  const sorted = [...params.steps].sort((a, b) => a.step_order - b.step_order);
  const lastId = sorted.at(-1)?.id;

  for (const s of params.steps) {
    if (!s.name || !s.name.trim()) {
      issues.push({ step_id: s.id, field: 'name', message: 'Step name is required' });
    }
    issues.push(...validateApprover(s));
    issues.push(...validateSla(s));
    const actions = params.actionsByStep[s.id] ?? [];
    issues.push(...validateStepActions(s, actions));
    if (s.id === lastId) {
      const hasEnd = actions.some(a => a.next_step_mode === 'end_workflow');
      if (!hasEnd) {
        issues.push({
          step_id: s.id,
          field: 'actions',
          message: 'Final step must include at least one "End Workflow" action',
        });
      }
    }
  }
  return { issues, ok: issues.length === 0 };
}
