import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), result: { data: [] as unknown[], error: null as unknown }, reject: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: api }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => <h1>Audit Logs</h1> }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (value: string) => void; disabled?: boolean }) => <select value={value} onChange={e => onValueChange(e.target.value)} disabled={disabled}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
import ComplianceAuditLogs from '@/pages/admin/ComplianceAuditLogs';

const row = { source: 'legacy', id: 'entry-1', occurred_at: '2026-01-01T00:00:00Z', action: 'retained-action', object_type: 'application', object_id: 'case-1' };
const securityRow = { id: 'sec-1', event_time: '2026-01-01T00:00:00Z', event_type: 'retained-event' };

beforeEach(() => {
  cleanup();
  api.result = { data: [], error: null };
  api.reject = false;
  api.from.mockReset().mockImplementation(() => {
    const query = {
      select: () => query, order: () => query, limit: () => query, eq: () => query,
      ilike: () => query, gte: () => query, lte: () => query,
      then: (resolve: (value: typeof api.result) => unknown, reject: (error: Error) => unknown) =>
        (api.reject ? Promise.reject(new Error('offline')) : Promise.resolve(api.result)).then(resolve, reject),
    };
    return query;
  });
});

describe('audit failure recovery', () => {
  it('starts loading, reports an error rather than empty history, and retries', async () => {
    api.result = { data: [], error: new Error('denied') };
    render(<ComplianceAuditLogs />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading audit entries');
    expect(screen.queryByText('No entries')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load audit entries');
    expect(screen.queryByText('No entries')).not.toBeInTheDocument();
    api.result = { data: [row], error: null };
    await userEvent.click(screen.getByRole('button', { name: 'Retry audit entries' }));
    expect(await screen.findByText('retained-action')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retains stale all-entry rows on a rejected refresh and recovers to a genuine empty result', async () => {
    api.result = { data: [row], error: null };
    render(<ComplianceAuditLogs />);
    await screen.findByText('retained-action');
    api.reject = true;
    await userEvent.click(screen.getByRole('button', { name: /Apply Filters/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('stale');
    expect(screen.getByText('retained-action')).toBeInTheDocument();
    api.reject = false;
    api.result = { data: [], error: null };
    await userEvent.click(screen.getByRole('button', { name: 'Retry audit entries' }));
    expect(await screen.findByText('No entries')).toBeInTheDocument();
    expect(screen.queryByText('retained-action')).not.toBeInTheDocument();
  });

  it('handles security errors, retries and retains stale security rows', async () => {
    render(<ComplianceAuditLogs />);
    await screen.findByText('No entries');
    api.result = { data: [], error: new Error('denied') };
    await userEvent.click(screen.getByRole('tab', { name: 'Security Events' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load security events');
    expect(screen.queryByText('No security events')).not.toBeInTheDocument();
    api.result = { data: [securityRow], error: null };
    await userEvent.click(screen.getByRole('button', { name: 'Retry security events' }));
    await screen.findByText('retained-event');
    api.reject = true;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ACCESS_DENIED' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('stale');
    expect(screen.getByText('retained-event')).toBeInTheDocument();
  });

  it('handles case errors, retries and retains the last successful trail', async () => {
    render(<ComplianceAuditLogs />);
    await screen.findByText('No entries');
    await userEvent.click(screen.getByRole('tab', { name: 'Case-Centric' }));
    fireEvent.change(screen.getByPlaceholderText('Enter case / entity ID'), { target: { value: 'case-1' } });
    api.result = { data: [], error: new Error('denied') };
    await userEvent.click(screen.getByRole('button', { name: 'Trace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load case history');
    expect(screen.queryByText(/Enter an object ID and click Trace/)).not.toBeInTheDocument();
    api.result = { data: [row], error: null };
    await userEvent.click(screen.getByRole('button', { name: 'Retry case history' }));
    await screen.findByText('retained-action');
    api.reject = true;
    await userEvent.click(screen.getByRole('button', { name: 'Trace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('stale');
    expect(screen.getByText('retained-action')).toBeInTheDocument();
  });

  it('reports and retries initiation catalogue failures without replacing successful options', async () => {
    render(<ComplianceAuditLogs />);
    await screen.findByText('No entries');
    await userEvent.click(screen.getByRole('tab', { name: 'Case-Centric' }));
    api.reject = true;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fp_assessment' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load initiations');
    api.reject = false;
    api.result = { data: [{ id: 'init-1', created_at: '2026-01-01', assessment_type: 'initial', fp_individuals: { full_name: 'Test Individual' } }], error: null };
    await userEvent.click(screen.getByRole('button', { name: 'Retry initiations' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: /Test Individual/ })).toBeInTheDocument();
  });
});
