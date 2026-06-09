import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadVisibleApplicationsMock = vi.fn();
const maybeSingleMock = vi.fn();
const orderMock = vi.fn();
const limitMock = vi.fn();
const inMock = vi.fn();
const orMock = vi.fn();
const eqMock = vi.fn();
const notMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/visibleApplications', () => ({
  loadVisibleApplications: (...args: any[]) => loadVisibleApplicationsMock(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

describe('useLicenseeMetrics queryFn', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    loadVisibleApplicationsMock.mockRejectedValue(new Error('rpc failed'));

    const queryByTable = (table: string) => {
      if (table === 'licensees') {
        return {
          select: (columns: string) => {
            if (columns === 'id, license_id') {
              return { in: inMock.mockResolvedValue({ data: [{ id: 'lic-1', license_id: 'license-1' }], error: null }) };
            }
            if (columns === 'id') {
              return { in: inMock.mockResolvedValue({ data: [{ id: 'lic-1' }], error: null }) };
            }
            throw new Error(`Unexpected licensees select: ${columns}`);
          },
        };
      }

      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'licensee_id, entity_name') {
              return { eq: eqMock.mockReturnValue({ maybeSingle: maybeSingleMock.mockResolvedValue({ data: { licensee_id: 'lic-1', entity_name: 'Entity 1' }, error: null }) }) };
            }
            if (columns === 'id') {
              return { in: inMock.mockResolvedValue({ data: [{ id: 'user-1' }], error: null }) };
            }
            throw new Error(`Unexpected profiles select: ${columns}`);
          },
        };
      }

      if (table === 'returns_filed') {
        return {
          select: (columns: string, options?: any) => {
            if (options?.count === 'exact' && options?.head === true) {
              throw new Error('Unexpected head select on returns_filed');
            }

            if (columns === 'entity_id') {
              return {
                eq: () => ({
                  not: () => ({
                    order: () => ({
                      limit: limitMock.mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              };
            }

            if (columns === 'id, unique_id, due_date, workflow_status, entity_id, on_behalf_of_licensee_id') {
              return {
                or: orMock.mockResolvedValue({
                  data: [
                    { id: 'ret-1', unique_id: 'RET-1', due_date: '2099-01-10', workflow_status: 'SUB', entity_id: 'lic-1', on_behalf_of_licensee_id: null },
                    { id: 'ret-2', unique_id: 'RET-2', due_date: '2024-01-10', workflow_status: 'WIP', entity_id: 'lic-1', on_behalf_of_licensee_id: null },
                  ],
                  error: null,
                }),
              };
            }

            throw new Error(`Unexpected returns_filed select: ${columns}`);
          },
        };
      }

      if (table === 'licenses') {
        return {
          select: (columns: string) => {
            if (columns === 'id') {
              return { eq: eqMock.mockResolvedValue({ data: [], error: null }) };
            }
            if (columns === 'id, license_number, status, valid_until') {
              return { in: inMock.mockResolvedValue({ data: [{ id: 'license-1', license_number: 'LIC-001', status: 'active', valid_until: null }], error: null }) };
            }
            throw new Error(`Unexpected licenses select: ${columns}`);
          },
        };
      }

      if (table === 'notifications') {
        return {
          select: () => ({
            eq: () => ({
              eq: eqMock.mockResolvedValue({ count: 3, error: null }),
            }),
          }),
        };
      }

      if (table === 'payments') {
        return {
          select: () => ({
            in: () => ({
              in: inMock.mockResolvedValue({ count: 0, data: [], error: null, order: orderMock }),
              order: orderMock.mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    };

    fromMock.mockImplementation(queryByTable);
  });

  it('returns entity license and return metrics even when visible applications fail', async () => {
    const { fetchLicenseeMetrics } = await import('@/hooks/useLicenseeMetrics');
    const result = await fetchLicenseeMetrics('lic-1', 'user-1');

    expect(result.licenses.active).toBe(1);
    expect(result.licenses.total).toBe(1);
    expect(result.returns.submitted).toBe(1);
    expect(result.returns.pending_review).toBe(1);
    expect(result.returns.overdue).toBe(1);
    expect(result.notifications.unread).toBe(3);
    expect(result.applications).toEqual({ draft: 0, submitted: 0, approved: 0, rejected: 0 });
  });
});