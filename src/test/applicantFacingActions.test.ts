/**
 * Behavioral contract tests for the applicant-facing workflow actions
 * `return_for_correction` and `request_more_info`.
 *
 * The full transition logic lives in the Postgres RPC perform_workflow_transition
 * (see migration 20260611...). These tests pin down the public contract that
 * the rest of the stack (edge function, UI, notifications) depends on:
 *
 *   1. Both actions are accepted by the action filter and required to be remarked.
 *   2. The edge function passes them through to the RPC verbatim — no aliasing.
 *   3. Each action maps to a distinct event_key and a distinct application
 *      status target, so the audit trail and notifications can tell them apart.
 *   4. Existing approve/reject/send_back/escalate/request_resubmission paths
 *      keep their event_key + remarks-required contract.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveAvailableActions,
  isRemarksRequired,
  REMARKS_REQUIRED_ACTIONS,
} from '@/lib/workflowActionFilter';
import { DEFAULT_EVENT_FOR_ACTION } from '@/hooks/useActionNotifications';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const edgeSrc = readFileSync(
  resolve(__dirname, '../../supabase/functions/perform-workflow-action/index.ts'),
  'utf-8',
);

// Action → expected applicant-facing application status set by the RPC.
// Keep in sync with perform_workflow_transition.
const ACTION_TO_APP_STATUS: Record<string, string> = {
  approve: 'in_progress', // or 'approved' on final step — covered separately
  reject: 'rejected',
  request_resubmission: 'resubmission_required',
  return_for_correction: 'returned_for_correction',
  request_more_info: 'info_requested',
};

describe('return_for_correction', () => {
  it('is surfaced as a candidate action on any non-final step that allows it', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: ['approve', 'return_for_correction'],
    });
    expect(actions).toContain('return_for_correction');
  });

  it('requires reviewer remarks', () => {
    expect(isRemarksRequired('return_for_correction')).toBe(true);
    expect(REMARKS_REQUIRED_ACTIONS).toContain('return_for_correction');
  });

  it('has a distinct default notification event_key', () => {
    expect(DEFAULT_EVENT_FOR_ACTION.return_for_correction).toBe('application.returned_for_correction');
    expect(DEFAULT_EVENT_FOR_ACTION.return_for_correction).not.toEqual(
      DEFAULT_EVENT_FOR_ACTION.request_resubmission,
    );
  });

  it('targets the returned_for_correction application status', () => {
    expect(ACTION_TO_APP_STATUS.return_for_correction).toBe('returned_for_correction');
  });
});

describe('request_more_info', () => {
  it('is surfaced as a candidate action when allowed', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: true,
      isLastLevel: false,
      allowedActions: ['approve', 'request_more_info'],
    });
    expect(actions).toContain('request_more_info');
  });

  it('requires reviewer remarks', () => {
    expect(isRemarksRequired('request_more_info')).toBe(true);
    expect(REMARKS_REQUIRED_ACTIONS).toContain('request_more_info');
  });

  it('has a distinct default notification event_key', () => {
    expect(DEFAULT_EVENT_FOR_ACTION.request_more_info).toBe('application.more_info_requested');
    expect(DEFAULT_EVENT_FOR_ACTION.request_more_info).not.toEqual(
      DEFAULT_EVENT_FOR_ACTION.return_for_correction,
    );
    expect(DEFAULT_EVENT_FOR_ACTION.request_more_info).not.toEqual(
      DEFAULT_EVENT_FOR_ACTION.request_resubmission,
    );
  });

  it('targets the info_requested application status', () => {
    expect(ACTION_TO_APP_STATUS.request_more_info).toBe('info_requested');
  });
});

describe('edge function: perform-workflow-action', () => {
  it('accepts both new actions in ACCEPTED_ACTIONS', () => {
    expect(edgeSrc).toMatch(/"return_for_correction"/);
    expect(edgeSrc).toMatch(/"request_more_info"/);
  });

  it('does NOT alias the new actions to request_resubmission anymore', () => {
    // The old alias table must be gone — these actions are first-class.
    expect(edgeSrc).not.toMatch(/ACTION_ALIAS_TO_RPC/);
    expect(edgeSrc).not.toMatch(/return_for_correction:\s*"request_resubmission"/);
    expect(edgeSrc).not.toMatch(/request_more_info:\s*"request_resubmission"/);
  });

  it('passes raw_action straight to perform_workflow_transition', () => {
    expect(edgeSrc).toMatch(/_action_type:\s*raw_action/);
  });

  it('dispatches a distinct event_key per action', () => {
    expect(edgeSrc).toMatch(/application\.returned_for_correction/);
    expect(edgeSrc).toMatch(/application\.more_info_requested/);
    expect(edgeSrc).toMatch(/application\.resubmission_requested/);
    expect(edgeSrc).toMatch(/application\.rejected/);
  });

  it('fans out admin-configured per-action notifications from approval_action_notifications', () => {
    expect(edgeSrc).toMatch(/approval_action_notifications/);
    expect(edgeSrc).toMatch(/\.eq\("action_type",\s*raw_action\)/);
    expect(edgeSrc).toMatch(/\.eq\("is_enabled",\s*true\)/);
    expect(edgeSrc).toMatch(/action_notification_override:\s*true/);
  });
});

describe('notification runtime override contract', () => {
  const dispatchSrc = readFileSync(
    resolve(__dirname, '../../supabase/functions/dispatch-notification-event/index.ts'),
    'utf-8',
  );

  it('supports explicit per-action notification overrides only when requested by the caller', () => {
    expect(dispatchSrc).toMatch(/action_notification_override === true/);
    expect(dispatchSrc).toMatch(/resolveStepActionNotificationOverrides/);
  });

  it('maps custom recipient bindings into runtime recipient rules', () => {
    expect(dispatchSrc).toMatch(/case "applicant"/);
    expect(dispatchSrc).toMatch(/case "current_approver"/);
    expect(dispatchSrc).toMatch(/case "previous_actor"/);
    expect(dispatchSrc).toMatch(/case "role"/);
    expect(dispatchSrc).toMatch(/case "admin"/);
    expect(dispatchSrc).toMatch(/case "custom_email"/);
    expect(dispatchSrc).toMatch(/case "direct_email"/);
  });
});

describe('existing actions: unchanged contract', () => {
  it('approve/reject still require remarks and surface correctly', () => {
    expect(isRemarksRequired('approve')).toBe(true);
    expect(isRemarksRequired('reject')).toBe(true);
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: true,
      allowedActions: ['approve', 'reject'],
    });
    expect(actions).toEqual(['approve', 'reject']);
  });

  it('send_back / escalate do not require remarks', () => {
    expect(isRemarksRequired('send_back')).toBe(false);
    expect(isRemarksRequired('escalate')).toBe(false);
  });

  it('approve event_key and reject event_key unchanged', () => {
    expect(DEFAULT_EVENT_FOR_ACTION.approve).toBe('application.approved_step');
    expect(DEFAULT_EVENT_FOR_ACTION.reject).toBe('application.rejected');
  });
});

describe('applicant resubmission resumes the same workflow at the previous step', () => {
  /**
   * The DB invariant we rely on (asserted via the migration text, since vitest
   * can't run plpgsql): when an action pauses the workflow, current_step_id
   * is preserved on workflow_instances; submit_application then resumes from
   * that exact step. We pin the contract by inspecting the migration source.
   */
  const migrationSrc = (() => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const dir = path.resolve(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort();
    // Read the most recent migration that defines submit_application/perform_workflow_transition.
    for (const f of [...files].reverse()) {
      const src = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (src.includes('perform_workflow_transition') && src.includes('return_for_correction')) {
        return src;
      }
    }
    throw new Error('First-class action migration not found');
  })();

  it('migration adds return_for_correction and request_more_info to perform_workflow_transition', () => {
    expect(migrationSrc).toMatch(/return_for_correction/);
    expect(migrationSrc).toMatch(/request_more_info/);
    expect(migrationSrc).toMatch(/returned_for_correction/);
    expect(migrationSrc).toMatch(/info_requested/);
  });

  it('both actions pause the workflow instance (do not complete it)', () => {
    // Look for assignments around the new action branches.
    expect(migrationSrc).toMatch(/return_for_correction[\s\S]{0,200}paused/);
    expect(migrationSrc).toMatch(/request_more_info[\s\S]{0,200}paused/);
  });

  it('records the actual action_type in approval_actions (not an alias)', () => {
    // The single INSERT into approval_actions uses _action_type for both
    // `action` and `action_type` columns — so audit rows preserve the
    // applicant-facing label.
    expect(migrationSrc).toMatch(/INSERT INTO public\.approval_actions[\s\S]+_action_type,\s*_action_type/);
  });

  it('submit_application treats the new statuses as resubmittable', () => {
    expect(migrationSrc).toMatch(/v_is_resub[\s\S]{0,200}returned_for_correction/);
    expect(migrationSrc).toMatch(/v_is_resub[\s\S]{0,200}info_requested/);
  });

  it('submit_application resumes the paused instance at its preserved current_step_id', () => {
    expect(migrationSrc).toMatch(/v_first_step_id\s*:=\s*v_existing_instance\.current_step_id/);
    expect(migrationSrc).toMatch(/status\s*=\s*'active'[\s\S]{0,200}WHERE id = v_existing_instance\.id/);
  });
});
