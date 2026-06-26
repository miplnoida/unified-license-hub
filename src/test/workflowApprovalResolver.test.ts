import { beforeEach, describe, expect, it, vi } from 'vitest';

// Per-regulator workflow fixtures. Resolver filters by regulator_id + entity_type
// and ranks by taxonomy specificity. license_type is intentionally NOT in the
// SQL filter — pre/post license workflows are admin-configured with
// license_type='general' and matched purely by taxonomy.
const workflowsByRegulator: Record<string, any[]> = {
  'reg-1': [
    { id: 'wf-post', is_active: true, license_type: 'Insurance', sector_id: null, sub_sector_id: null, category_id: null, service_id: null, entity_type: 'post_application' },
    { id: 'wf-legacy', is_active: true, license_type: 'Insurance', sector_id: null, sub_sector_id: null, category_id: null, service_id: null, entity_type: 'application' },
  ],
  'reg-bs': [
    { id: 'wf-bs-pre', is_active: true, license_type: 'general', sector_id: 'sector-bs', sub_sector_id: null, category_id: null, service_id: null, entity_type: 'pre_application' },
  ],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'approval_workflows') {
        return {
          select: () => {
            const state: Record<string, any> = {};
            const chain: any = {
              eq: (column: string, value: string) => { state[column] = value; return chain; },
              in: (column: string, values: string[]) => { state[column] = values; return chain; },
              then: (resolve: any, reject?: any) => {
                const rows = workflowsByRegulator[state.regulator_id] || [];
                const entityTypes: string[] = state.entity_type || [];
                const filtered = rows.filter((r) => entityTypes.includes(r.entity_type));
                return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
              },
            };
            return chain;
          },
        };
      }

      if (table === 'approval_steps') {
        return { select: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }) };
      }

      if (table === 'site_settings') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { value: { application_review_enabled: true } }, error: null }) }) }) };
      }

      if (table === 'categories' || table === 'sectors') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

describe('workflow approval resolver', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('prefers post_application over legacy application for post-license routing', async () => {
    const { resolveWorkflowApproval } = await import('@/lib/workflowApprovalResolver');
    const result = await resolveWorkflowApproval({
      application: {
        id: 'app-1',
        license_type: 'Insurance',
        regulator_id: 'reg-1',
        data: { type: 'post_license', service_id: 'svc-1' },
      },
    });
    expect(result.enabled).toBe(true);
    expect(result.matchedWorkflow?.id).toBe('wf-post');
  });

  it('matches pre_application workflow by sector even when license_type differs (Building Society)', async () => {
    const { resolveWorkflowApproval } = await import('@/lib/workflowApprovalResolver');
    const result = await resolveWorkflowApproval({
      application: {
        id: 'app-bs',
        license_type: 'Building Society - Building Society - Building Society',
        regulator_id: 'reg-bs',
        data: { sector_id: 'sector-bs', sub_sector_id: 'sub-bs', category_id: 'cat-bs' },
      },
    });
    expect(result.enabled).toBe(true);
    expect(result.matchedWorkflow?.id).toBe('wf-bs-pre');
  });
});
