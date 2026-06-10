import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.fn();
const eqMock = vi.fn();
const inMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'approval_workflows') {
        return {
          select: selectMock.mockImplementation(() => {
            const state: Record<string, any> = {};
            const chain: any = {
              eq: vi.fn((column: string, value: string) => {
                state[column] = value;
                return chain;
              }),
              in: vi.fn((column: string, values: string[]) => {
                state[column] = values;

                if (state.license_type === 'Insurance' && state.regulator_id === 'reg-1') {
                  return Promise.resolve({
                    data: [
                      { id: 'wf-post', is_active: true, license_type: 'Insurance', sector_id: null, category_id: null, entity_type: 'post_application' },
                      { id: 'wf-legacy', is_active: true, license_type: 'Insurance', sector_id: null, category_id: null, entity_type: 'application' },
                    ],
                    error: null,
                  });
                }

                return Promise.resolve({
                  data: [
                    { id: 'wf-pre', is_active: true, license_type: 'micro', entity_type: 'pre_application' },
                    { id: 'wf-legacy-prefix', is_active: true, license_type: 'micro', entity_type: 'application' },
                  ],
                  error: null,
                });
              }),
            };

            eqMock.mockImplementation(chain.eq);
            inMock.mockImplementation(chain.in);
            return chain;
          }),
        };
      }

      if (table === 'approval_steps') {
        return {
          select: () => ({
            eq: () => ({ count: 1, error: null }),
          }),
        };
      }

      if (table === 'site_settings') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: maybeSingleMock.mockResolvedValue({ data: { value: { application_review_enabled: true } }, error: null }) }),
          }),
        };
      }

      if (table === 'categories' || table === 'sectors') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: maybeSingleMock.mockResolvedValue({ data: null, error: null }) }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

describe('workflow approval resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('falls back to pre_application prefix matching before legacy application', async () => {
    const { resolveWorkflowApproval } = await import('@/lib/workflowApprovalResolver');

    const result = await resolveWorkflowApproval({
      application: {
        id: 'app-2',
        license_type: 'Micro Insurance',
        regulator_id: null,
        data: {},
      },
    });

    expect(result.enabled).toBe(true);
    expect(result.matchedWorkflow?.id).toBe('wf-pre');
  });
});