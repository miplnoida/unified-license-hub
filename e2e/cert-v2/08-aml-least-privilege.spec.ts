import { test, expect } from '@playwright/test';
import { persona } from './support/personas';
import { rpc, restSelect } from './support/api';

/**
 * AML-CLOSE-02D — least privilege and forged self-elevation.
 *
 * Uses real TEST personas through the public API exactly as the browser does.
 * Nothing is changed: every write attempted here must be refused.
 */
const AML_OFFICER = persona('aml_supervision_officer');
const HEAD_ROLE_KEY = 'aml_head';

test.describe('AML/CFT least privilege (AML-CLOSE-02D)', () => {
  test('the ordinary officer holds no confidential, review or approval right', async () => {
    for (const action of ['view_confidential', 'review', 'approve', 'policy_approve']) {
      const r = await rpc(AML_OFFICER, 'has_permission_self', { _module: 'aml_supervision', _action: action });
      if (r.status === 404) {
        // No self-check RPC: assert through the role table the officer may read about itself.
        const roles = await restSelect(AML_OFFICER, `sec_user_roles?select=status,sec_roles(key)&status=eq.active`);
        expect(roles.ok, roles.bodyText).toBeTruthy();
        const keys = (roles.body as { sec_roles: { key: string } | null }[]).map((x) => x.sec_roles?.key);
        expect(keys).not.toContain(HEAD_ROLE_KEY);
        return;
      }
      expect(r.body, action).toBe(false);
    }
  });

  test('forged authenticated self-grant of Head of AML/CFT is refused', async () => {
    const roles = await restSelect(AML_OFFICER, `sec_roles?select=id,key&key=eq.${HEAD_ROLE_KEY}`);
    const head = (roles.body as { id: string }[] | null)?.[0]?.id;
    const me = await restSelect(AML_OFFICER, `sec_user_roles?select=user_id,role_id&status=eq.active`);
    const rows = (me.body as { user_id: string; role_id: string }[]) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    const userId = rows[0].user_id;
    const r = await rpc(AML_OFFICER, 'sec_assign_user_roles', {
      p_user_id: userId, p_role_ids: [...rows.map((x) => x.role_id), head ?? '00000000-0000-0000-0000-000000000000'],
    });
    expect(r.ok, r.bodyText).toBeFalsy();
    expect(r.bodyText).toMatch(/not_authorized|permission/i);
    const after = await restSelect(AML_OFFICER, `sec_user_roles?select=role_id&status=eq.active`);
    expect((after.body as unknown[]).length).toBe(rows.length);
  });
});
