import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('workflow runtime notification dispatch contract', () => {
  const performWorkflowSrc = readFileSync(
    resolve(__dirname, '../../supabase/functions/perform-workflow-action/index.ts'),
    'utf-8',
  );

  const dispatchSrc = readFileSync(
    resolve(__dirname, '../../supabase/functions/dispatch-notification-event/index.ts'),
    'utf-8',
  );

  it('loads all enabled approval_action_notifications rows for the current step + action', () => {
    expect(performWorkflowSrc).toMatch(/from\("approval_action_notifications"\)/);
    expect(performWorkflowSrc).toMatch(/\.eq\("step_id",\s*step_id\)/);
    expect(performWorkflowSrc).toMatch(/\.eq\("action_type",\s*raw_action\)/);
    expect(performWorkflowSrc).toMatch(/\.eq\("is_enabled",\s*true\)/);
    expect(performWorkflowSrc).toMatch(/for \(const row of \(cfgRows \?\? \[\]\)\)/);
  });

  it('passes template_id, recipient_type, and recipient_config to the runtime override dispatcher', () => {
    expect(performWorkflowSrc).toMatch(/template_id:\s*\(row as any\)\.template_id/);
    expect(performWorkflowSrc).toMatch(/recipient_type:\s*\(row as any\)\.recipient_type/);
    expect(performWorkflowSrc).toMatch(/recipient_config:\s*\(row as any\)\.recipient_config/);
    expect(performWorkflowSrc).toMatch(/action_notification_override:\s*true/);
  });

  it('runtime expands override rows into independent dispatch configs', () => {
    expect(dispatchSrc).toMatch(/dispatchConfigs = shouldUseActionOverrides && eventRows.length > 0/);
    expect(dispatchSrc).toMatch(/eventRows\.map\(\(row\) => \(\{/);
    expect(dispatchSrc).toMatch(/cfg:\s*buildOverrideConfig\(cfg as Record<string, any>, row, templateMap\)/);
  });

  it('runtime uses override template content and recipient rules for each row', () => {
    expect(dispatchSrc).toMatch(/recipient_rules:\s*recipientRules/);
    expect(dispatchSrc).toMatch(/title_template:\s*template\?\.subject \|\| baseCfg\.title_template/);
    expect(dispatchSrc).toMatch(/message_template:\s*template\?\.body \|\| baseCfg\.message_template/);
    expect(dispatchSrc).toMatch(/email_subject_template:\s*template\?\.subject \|\| baseCfg\.email_subject_template/);
    expect(dispatchSrc).toMatch(/email_body_template:\s*template\?\.body \|\| baseCfg\.email_body_template/);
  });

  it('still supports return_for_correction and request_more_info distinct event dispatch', () => {
    expect(performWorkflowSrc).toMatch(/application\.returned_for_correction/);
    expect(performWorkflowSrc).toMatch(/application\.more_info_requested/);
  });
});