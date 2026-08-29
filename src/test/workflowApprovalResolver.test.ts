import { beforeEach, describe, expect, it, vi } from 'vitest';

// The resolver is server-only (GAP-F5-07/07a): `application_workflow_view` is
// the single authority. Any `from()` access from the resolver is a regression —
// the mock throws so the tests catch reintroduced client matching.
const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpc(...args),
    from: vi.fn((table: string) => {
      throw new Error(`Resolver must not query tables directly (attempted: ${table})`);
    }),
  },
}));

async function resolve(application: any) {
  const { resolveWorkflowApproval } = await import('@/lib/workflowApprovalResolver');
  return resolveWorkflowApproval({ application });
}

describe('workflow approval resolver — server authority', () => {
  beforeEach(() => { rpc.mockReset(); });

  it('honours an enabled decision from the server', async () => {
    rpc.mockResolvedValue({
      data: {
        found: true, enabled: true, reason: 'enabled', global_review_enabled: true,
        workflow_id: 'wf-post', workflow_is_active: true, workflow_name: 'Post Licence', step_count: 3,
      },
      error: null,
    });
    const result = await resolve({ id: 'app-1' });
    expect(rpc).toHaveBeenCalledWith('application_workflow_view', { _application_id: 'app-1' });
    expect(result.enabled).toBe(true);
    expect(result.matchedWorkflow?.id).toBe('wf-post');
    expect(result.stepCount).toBe(3);
  });

  it('honours a disabled decision from the server', async () => {
    rpc.mockResolvedValue({
      data: { found: true, enabled: false, reason: 'no_steps', global_review_enabled: true, workflow_id: 'wf-x', workflow_is_active: true, step_count: 0 },
      error: null,
    });
    const result = await resolve({ id: 'app-2' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('no_steps');
    expect(result.unresolved).toBeUndefined();
  });

  it('fails closed when the RPC errors or is forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const result = await resolve({ id: 'app-3' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('server_unresolved');
    expect(result.unresolved).toBe(true);
  });

  it('fails closed when the RPC throws', async () => {
    rpc.mockRejectedValue(new Error('network'));
    const result = await resolve({ id: 'app-3b' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('server_unresolved');
  });

  it('fails closed on found=false', async () => {
    rpc.mockResolvedValue({ data: { found: false }, error: null });
    const result = await resolve({ id: 'app-4' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('server_unresolved');
    expect(result.unresolved).toBe(true);
  });

  it('fails closed on malformed/incomplete server state', async () => {
    rpc.mockResolvedValue({ data: { found: true, enabled: 'yes', reason: 'made_up' }, error: null });
    const result = await resolve({ id: 'app-5' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('server_unresolved');
  });

  it('makes no regulatory decision for an unsaved application', async () => {
    const result = await resolve({ license_type: 'Insurance', regulator_id: 'reg-1', data: { sector_id: 's1' } });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('unresolved_unsaved');
    expect(result.unresolved).toBe(true);
  });

  it('ignores forged client service/taxonomy — result comes only from the server', async () => {
    rpc.mockResolvedValue({
      data: { found: true, enabled: false, reason: 'no_matched_workflow', global_review_enabled: true, step_count: 0 },
      error: null,
    });
    const result = await resolve({
      id: 'app-6',
      license_type: 'Insurance',
      regulator_id: 'reg-1',
      workflow_id: 'wf-attached',
      data: { type: 'post_license', service_id: 'svc-forged', sector_id: 'sector-bs', category_id: 'cat-bs' },
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('no_matched_workflow');
    expect(result.matchedWorkflow).toBeNull();
  });
});
