import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke }, from: mocks.from },
}));

import { previewReport } from '@/pages/reports/services/reportService';

describe('report preview server authority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retains the server-scoped rows, filters and total', async () => {
    const rows = [{ reference: 'F-1', entity_name: 'Institution A' }];
    mocks.invoke.mockResolvedValue({ data: { rows, totalCount: 13, rowCount: 1 }, error: null });
    const filters = { entityId: 'institution-a', status: 'remediation_pending' };
    await expect(previewReport('examination_findings', filters, 1)).resolves.toEqual({ rows, count: 13 });
    expect(mocks.invoke).toHaveBeenCalledWith('generate-report', {
      body: { source: 'examination_findings', filters, mode: 'preview', limit: 1 },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not substitute a raw-table read after a server authorization refusal', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, error: 'Not authorized' }, error: null });
    await expect(previewReport('examination_findings', {})).rejects.toThrow('Not authorized');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable server into empty or unfiltered results', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('Service unavailable') });
    await expect(previewReport('examination_findings', {})).rejects.toThrow('Service unavailable');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});