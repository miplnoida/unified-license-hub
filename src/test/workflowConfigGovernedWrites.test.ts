/**
 * Phase 1 contract: every workflow-configuration write from the browser must go
 * through a governed SECURITY DEFINER RPC. Direct DML on the config tables is
 * revoked for `authenticated`, so a re-introduced `.insert()/.update()/.delete()`
 * would fail at runtime with "permission denied" — this test catches it in CI.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

const CONFIG_TABLES = [
  'approval_steps',
  'approval_step_actions',
  'approval_action_notifications',
  'approval_step_entry_notifications',
];

const WRITER_FILES = [
  'hooks/useActionNotifications.ts',
  'hooks/useStepEntryNotifications.ts',
  'hooks/useWorkflowEngine.ts',
  'hooks/useStepActions.ts',
  'lib/workflowTemplateSnapshot.ts',
];

describe('workflow configuration governed write surface', () => {
  it('no frontend module performs direct DML on a workflow config table', () => {
    const offenders: string[] = [];
    for (const file of WRITER_FILES) {
      const src = read(file);
      for (const table of CONFIG_TABLES) {
        // Match `.from('<table>')` ... `.insert(`/`.update(`/`.delete(` within the
        // same chained expression (no intervening semicolon).
        const re = new RegExp(
          `from\\(\\s*(?:'${table}'|"${table}"|TABLE)[^;]{0,400}?\\.(insert|update|delete)\\(`,
          'gs',
        );
        if (re.test(src)) offenders.push(`${file} → ${table}`);
      }
    }
    expect(offenders, `Direct DML found:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('notification bindings are saved and deleted through the governed RPCs', () => {
    const actions = read('hooks/useActionNotifications.ts');
    expect(actions).toMatch(/rpc\('approval_action_notification_save'/);
    expect(actions).toMatch(/rpc\('approval_action_notification_delete'/);

    const entry = read('hooks/useStepEntryNotifications.ts');
    expect(entry).toMatch(/rpc\(\s*\n?\s*'approval_step_entry_notification_save'/);
    expect(entry).toMatch(/rpc\(\s*\n?\s*'approval_step_entry_notification_delete'/);
  });

  it('step create/update/delete go through approval_step_save / approval_step_delete', () => {
    const engine = read('hooks/useWorkflowEngine.ts');
    expect(engine).toMatch(/rpc\('approval_step_save'/);
    expect(engine).toMatch(/rpc\('approval_step_delete'/);
  });

  it('template cloning inserts steps through the governed snapshot RPC', () => {
    const snapshot = read('lib/workflowTemplateSnapshot.ts');
    expect(snapshot).toMatch(/rpc\(\s*\n?\s*'approval_steps_snapshot_insert'/);
  });

  it('allowed_actions is never sent from the browser (server-derived column)', () => {
    const engine = read('hooks/useWorkflowEngine.ts');
    // Type declarations and the destructuring that STRIPS the field are fine;
    // an object-literal payload assignment is not.
    const assignments = engine
      .split('\n')
      .filter(line =>
        /allowed_actions\s*:/.test(line)
        && !line.trim().startsWith('//')
        && !/allowed_actions\s*:\s*(WorkflowActionType|string)/.test(line)
        && !/allowed_actions\s*:\s*_ignored/.test(line));
    expect(assignments, 'useWorkflowEngine still sends allowed_actions').toEqual([]);

    // The template-apply payload (snapshot capture may still READ the column).
    const snapshot = read('lib/workflowTemplateSnapshot.ts');
    const applyBody = snapshot.slice(snapshot.indexOf('export async function applyV2SnapshotToWorkflow'));
    expect(applyBody).not.toMatch(/allowed_actions\s*:/);
  });



  it('permission failures are surfaced as an actionable message, not raw SQL', () => {
    const mapper = read('lib/workflowConfigErrors.ts');
    expect(mapper).toMatch(/42501/);
    expect(mapper).toMatch(/do not have permission to configure workflows/i);
    for (const file of ['hooks/useActionNotifications.ts', 'hooks/useStepEntryNotifications.ts', 'hooks/useWorkflowEngine.ts']) {
      expect(read(file)).toMatch(/throwWorkflowConfigError/);
    }
  });
});
