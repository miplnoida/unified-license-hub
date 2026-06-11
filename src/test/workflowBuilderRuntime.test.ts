/**
 * Pins the runtime contract for the new workflow features:
 * - perform_workflow_transition reads approval_step_actions and honors
 *   per-action routing (end_workflow / specific_step / previous / return /
 *   next / keep) and result_status_override.
 * - user_can_act_on_workflow_step recognizes the new specific_users approver
 *   type and the multi-role approver_config.
 * - perform-workflow-action edge function dispatches step-entry notifications
 *   when the workflow advances into a new step.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

function loadLatest(predicate: (src: string) => boolean): string {
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of [...files].reverse()) {
    const src = readFileSync(path.join(migrationsDir, f), 'utf-8');
    if (predicate(src)) return src;
  }
  throw new Error('No migration matched predicate');
}

describe('workflow builder runtime contract', () => {
  const rpcSrc = loadLatest(
    src =>
      src.includes('perform_workflow_transition')
      && src.includes('approval_step_actions')
      && src.includes('v_action_cfg'),
  );

  const authSrc = loadLatest(
    src => src.includes('user_can_act_on_workflow_step') && src.includes('SPECIFIC_USER_MATCH'),
  );

  const edgeSrc = readFileSync(
    path.resolve(__dirname, '../../supabase/functions/perform-workflow-action/index.ts'),
    'utf-8',
  );

  it('RPC loads per-action config from approval_step_actions', () => {
    expect(rpcSrc).toMatch(/FROM\s+public\.approval_step_actions/);
    expect(rpcSrc).toMatch(/WHERE\s+step_id\s*=\s*v_step\.id\s+AND\s+action_type\s*=\s*_action_type/);
  });

  it('RPC honors end_workflow + end_state', () => {
    expect(rpcSrc).toMatch(/next_step_mode\s*=\s*'end_workflow'/);
    expect(rpcSrc).toMatch(/end_state\s*=\s*'approved'/);
    expect(rpcSrc).toMatch(/end_state\s*=\s*'rejected'/);
    expect(rpcSrc).toMatch(/end_state\s*=\s*'cancelled'/);
  });

  it('RPC honors specific_step routing with next_step_id', () => {
    expect(rpcSrc).toMatch(/next_step_mode\s*=\s*'specific_step'/);
    expect(rpcSrc).toMatch(/v_action_cfg\.next_step_id/);
  });

  it('RPC honors previous and return_to_applicant routing', () => {
    expect(rpcSrc).toMatch(/next_step_mode\s*=\s*'previous'/);
    expect(rpcSrc).toMatch(/next_step_mode\s*=\s*'return_to_applicant'/);
  });

  it('RPC enforces per-action require_comments override', () => {
    expect(rpcSrc).toMatch(/v_action_cfg\.require_comments/);
    expect(rpcSrc).toMatch(/REMARKS_REQUIRED/);
  });

  it('RPC applies result_status_override', () => {
    expect(rpcSrc).toMatch(/v_action_cfg\.result_status_override/);
  });

  it('user_can_act recognizes specific_users approver_type', () => {
    expect(authSrc).toMatch(/approver_type[\s\S]{0,200}specific_users/);
    expect(authSrc).toMatch(/v_cfg_user_ids/);
    expect(authSrc).toMatch(/SPECIFIC_USER_MATCH/);
  });

  it('user_can_act recognizes multi-role approver_config.role_ids', () => {
    expect(authSrc).toMatch(/approver_config[\s\S]{0,80}role_ids/);
    expect(authSrc).toMatch(/CFG_ROLE_MATCH/);
  });

  it('edge function dispatches step-entry notifications when step advances', () => {
    expect(edgeSrc).toMatch(/approval_step_entry_notifications/);
    expect(edgeSrc).toMatch(/new_step_id/);
    expect(edgeSrc).toMatch(/step_entered/);
  });
});
