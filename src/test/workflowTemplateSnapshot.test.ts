/**
 * Pure tests for the v2 workflow template snapshot helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSnapshotFromRows,
  isV2Snapshot,
  buildLocalIdMap,
  type TemplateSnapshotV2,
} from '@/lib/workflowTemplateSnapshot';
import type { WorkflowStep } from '@/hooks/useWorkflowEngine';
import type { StepAction } from '@/hooks/useStepActions';
import type { StepEntryNotification } from '@/hooks/useStepEntryNotifications';
import type { ActionNotification } from '@/hooks/useActionNotifications';

const step = (over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id: over.id ?? 's1',
  workflow_id: 'wf',
  step_order: over.step_order ?? 1,
  name: over.name ?? 'Step',
  description: null,
  approver_role: 'admin' as any,
  approver_role_id: over.approver_role_id ?? 'r1',
  approver_type: over.approver_type ?? 'role_based_user',
  approver_config: over.approver_config ?? { role_ids: ['r1'] },
  auto_approve_on_timeout: over.auto_approve_on_timeout ?? false,
  step_entry_notifications_enabled: true,
  step_type: 'sequential',
  sla_hours: over.sla_hours ?? 24,
  is_required: true,
  allowed_actions: over.allowed_actions ?? ['approve'],
  escalation_role: null,
  escalation_after_hours: null,
  sla_warning_threshold_percent: null,
  sla_pause_on_rfi: false,
  sla_warning_template_id: null,
  sla_breach_template_id: null,
  condition: null,
  created_at: '',
});

const action = (over: Partial<StepAction> = {}): StepAction => ({
  id: 'a',
  step_id: over.step_id ?? 's1',
  action_type: over.action_type ?? 'approve',
  label: over.label ?? 'Approve',
  require_comments: over.require_comments ?? false,
  result_status_override: null,
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

describe('workflowTemplateSnapshot', () => {
  it('preserves modern step config in v2 snapshot', () => {
    const s = step({
      approver_type: 'specific_users',
      approver_config: { user_ids: ['u1', 'u2'] },
      sla_hours: 72,
      auto_approve_on_timeout: true,
    });
    const snap = buildSnapshotFromRows({
      steps: [s],
      actionsByStepId: { s1: [action()] },
      entryNotificationsByStepId: {},
      actionNotificationsByStepId: {},
    });
    expect(snap.version).toBe(2);
    expect(snap.steps[0].approver_type).toBe('specific_users');
    expect(snap.steps[0].approver_config).toEqual({ user_ids: ['u1', 'u2'] });
    expect(snap.steps[0].sla_hours).toBe(72);
    expect(snap.steps[0].auto_approve_on_timeout).toBe(true);
  });

  it('rewrites next_step_id → next_step_local_id (only for specific_step)', () => {
    const s1 = step({ id: 's1', step_order: 1 });
    const s2 = step({ id: 's2', step_order: 2 });
    const snap = buildSnapshotFromRows({
      steps: [s1, s2],
      actionsByStepId: {
        s1: [action({ next_step_mode: 'specific_step', next_step_id: 's2' })],
        s2: [action({ step_id: 's2', next_step_mode: 'next' })],
      },
      entryNotificationsByStepId: {},
      actionNotificationsByStepId: {},
    });
    expect(snap.steps[0].actions[0].next_step_local_id).toBe('s2');
    expect(snap.steps[1].actions[0].next_step_local_id).toBeNull();
  });

  it('carries entry and action notifications per step', () => {
    const entry: StepEntryNotification = {
      id: 'n1', step_id: 's1', event_key: 'step_assigned',
      recipient_type: 'role', recipient_config: { role: 'admin' },
      template_id: 't1', is_enabled: true,
      created_at: '', updated_at: '',
    };
    const an: ActionNotification = {
      id: 'an1', step_id: 's1', action_type: 'approve', event_key: 'approved',
      recipient_type: 'applicant', recipient_config: {}, template_id: 't2', is_enabled: true,
    };
    const snap = buildSnapshotFromRows({
      steps: [step()],
      actionsByStepId: { s1: [action()] },
      entryNotificationsByStepId: { s1: [entry] },
      actionNotificationsByStepId: { s1: [an] },
    });
    expect(snap.steps[0].entry_notifications).toHaveLength(1);
    expect(snap.steps[0].action_notifications[0].action_type).toBe('approve');
  });

  it('isV2Snapshot detects v1 vs v2', () => {
    expect(isV2Snapshot([{ name: 'x', approver_role: 'admin' }])).toBe(false);
    expect(isV2Snapshot([{ local_id: 's1', actions: [] }])).toBe(true);
    expect(isV2Snapshot([])).toBe(false);
  });

  it('buildLocalIdMap pairs in snapshot order', () => {
    const snap: TemplateSnapshotV2 = {
      version: 2,
      steps: [
        { local_id: 'old-a', step_order: 1 } as any,
        { local_id: 'old-b', step_order: 2 } as any,
      ],
    };
    const map = buildLocalIdMap(snap, ['new-a', 'new-b']);
    expect(map).toEqual({ 'old-a': 'new-a', 'old-b': 'new-b' });
  });

  it('buildLocalIdMap throws on length mismatch', () => {
    const snap: TemplateSnapshotV2 = {
      version: 2,
      steps: [{ local_id: 'x', step_order: 1 } as any],
    };
    expect(() => buildLocalIdMap(snap, ['a', 'b'])).toThrow(/length/);
  });
});
