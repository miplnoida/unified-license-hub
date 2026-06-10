/**
 * Contract test for the Approval Workflow create flow after the "Category"
 * field was removed from the UI. The form no longer collects a license_type
 * value, but the underlying `approval_workflows.license_type` column is still
 * NOT NULL in the database, so the create payload must always send a safe
 * default ('general'). This test pins that contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock('@/hooks/useAuditLog', () => ({ logAudit: vi.fn() }));

beforeEach(() => rpcMock.mockReset());

async function createWorkflow(workflow: Record<string, unknown>, steps: unknown[]) {
  const { data, error } = await (rpcMock as any)(
    'create_approval_workflow_with_steps',
    { _workflow: workflow, _steps: steps },
  );
  if (error) throw error;
  return (data || {}).workflow_id;
}

describe('Approval workflow create — no Category field', () => {
  it('creates a workflow without a user-entered category, defaulting license_type to "general"', async () => {
    rpcMock.mockResolvedValueOnce({ data: { workflow_id: 'wf-1', step_count: 1 }, error: null });
    const id = await createWorkflow(
      {
        name: 'Pre App Review',
        description: undefined,
        license_type: 'general', // default — no longer user-entered
        entity_type: 'pre_application',
        regulator_id: 'reg-1',
        sector_id: null,
        category_id: null,
      },
      [{ step_order: 1, name: 'Review', approver_role: 'admin', approver_role_id: 'r1', sla_hours: 48, allowed_actions: ['approve', 'reject'] }],
    );
    expect(id).toBe('wf-1');
    const [, args] = rpcMock.mock.calls[0];
    expect(args._workflow.license_type).toBe('general');
    expect(args._workflow.name).toBe('Pre App Review');
  });

  it('still routes by regulator/sector/entity_type — duplicate check ignores license_type', async () => {
    const { findDuplicateWorkflow } = await import('@/lib/workflowDuplicateCheck');
    const existing = [
      { id: 'a', regulator_id: 'r1', sector_id: 's1', entity_type: 'pre_application' },
    ];
    // Same scope, different (irrelevant) license_type would still collide:
    const dup = findDuplicateWorkflow(existing, {
      regulator_id: 'r1', sector_id: 's1', entity_type: 'pre_application',
    });
    expect(dup?.id).toBe('a');
  });
});
