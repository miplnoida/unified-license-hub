import { beforeEach, describe, expect, it, vi } from 'vitest';

const orderSecondMock = vi.fn();
const orderFirstMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

describe('fetchWorkflowTypeConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderSecondMock.mockResolvedValue({
      data: [
        { key: 'registration', display_label: 'Registration', description: 'Registration reviews', is_active: true, sort_order: 10 },
        { key: 'pre_application', display_label: 'Pre Application', description: 'Pre-license applications', is_active: true, sort_order: 20 },
      ],
      error: null,
    });
    orderFirstMock.mockReturnValue({ order: orderSecondMock });
    selectMock.mockReturnValue({ order: orderFirstMock });
    fromMock.mockImplementation((table: string) => {
      if (table !== 'approval_workflow_types') throw new Error(`Unexpected table ${table}`);
      return { select: selectMock };
    });
  });

  it('loads workflow type configuration from the backend table', async () => {
    const { fetchWorkflowTypeConfigs } = await import('@/hooks/useWorkflowEngine');
    const rows = await fetchWorkflowTypeConfigs();

    expect(fromMock).toHaveBeenCalledWith('approval_workflow_types');
    expect(selectMock).toHaveBeenCalledWith('key, display_label, description, is_active, sort_order');
    expect(orderFirstMock).toHaveBeenCalledWith('sort_order', { ascending: true });
    expect(orderSecondMock).toHaveBeenCalledWith('display_label', { ascending: true });
    expect(rows.map((row) => row.key)).toEqual(['registration', 'pre_application']);
  });
});