import { describe, it, expect } from 'vitest';
import { pendingStepMessage } from '@/lib/workflowPendingLabel';

const roles = {
  r1: 'Analyst',
  r2: 'Licensing Officer',
  r3: 'Supervisor',
  ri1: 'Insurance Licensing Officer',
  ri2: 'Insurance Supervisor',
};
const users = { u1: 'John Smith', u2: 'Maria Thomas' };
const legacy = { licensing_officer: 'Licensing Officer', super_admin: 'Super Admin' };
const maps = { dynamicRolesMap: roles, userNamesMap: users, legacyRoleLabels: legacy };

describe('pendingStepMessage', () => {
  it('one role', () => {
    expect(pendingStepMessage({ approver_role_id: 'r1' }, maps).text)
      .toBe('This step is pending at Analyst level.');
  });

  it('two roles', () => {
    expect(pendingStepMessage({ approver_config: { role_ids: ['r1', 'r2'] } }, maps).text)
      .toBe('This step is pending at Analyst / Licensing Officer level.');
  });

  it('three or more roles, no truncation', () => {
    expect(pendingStepMessage({ approver_role_id: 'r1', approver_config: { role_ids: ['r2', 'r3'] } }, maps).text)
      .toBe('This step is pending at Analyst / Licensing Officer / Supervisor level.');
  });

  it('keeps sector-specific role names verbatim', () => {
    expect(pendingStepMessage({ approver_config: { role_ids: ['ri1', 'ri2'] } }, maps).text)
      .toBe('This step is pending at Insurance Licensing Officer / Insurance Supervisor level.');
  });

  it('single specific user', () => {
    expect(pendingStepMessage({ approver_type: 'specific_users', approver_config: { user_ids: ['u1'] } }, maps).text)
      .toBe('This step is pending with John Smith.');
  });

  it('multiple specific users', () => {
    expect(pendingStepMessage({ approver_type: 'specific_users', approver_config: { user_ids: ['u1', 'u2'] } }, maps).text)
      .toBe('This step is pending with John Smith / Maria Thomas.');
  });

  it('modern ids take precedence over legacy role', () => {
    expect(pendingStepMessage({ approver_role: 'super_admin', approver_role_id: 'r2' }, maps).text)
      .toBe('This step is pending at Licensing Officer level.');
  });

  it('legacy-only configuration resolves the legacy label', () => {
    expect(pendingStepMessage({ approver_role: 'licensing_officer' }, maps).text)
      .toBe('This step is pending at Licensing Officer level.');
  });

  it('unresolved ids fall back safely without exposing ids', () => {
    const roleText = pendingStepMessage({ approver_config: { role_ids: ['r2', 'missing-uuid'] } }, maps).text;
    expect(roleText).toBe('This step is pending at Licensing Officer / Assigned Reviewer level.');
    const userText = pendingStepMessage(
      { approver_type: 'specific_users', approver_config: { user_ids: ['u1', 'ghost-uuid'] } },
      maps,
    ).text;
    expect(userText).toBe('This step is pending with John Smith / Assigned Approver.');
  });

  it('empty configuration degrades gracefully', () => {
    expect(pendingStepMessage({}, maps).text).toBe('This step is pending review.');
    expect(pendingStepMessage(null, maps).mode).toBe('none');
  });
});
