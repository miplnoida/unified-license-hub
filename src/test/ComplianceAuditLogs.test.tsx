import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const fromSpy = vi.hoisted(() => vi.fn());
const rpcSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: null, error: null }));

function makeQuery(data: unknown[]) {
  const query: any = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

const timelineRows = [
  {
    source: 'legacy',
    id: 'legacy-1',
    occurred_at: '2026-06-30T14:23:18.303096+00:00',
    user_id: 'user-legacy',
    actor_role: 'admin',
    action: 'workflow_approved',
    object_type: 'application',
    object_id: 'application-legacy-123',
    before_value: null,
    after_value: { status: 'approved' },
    justification: null,
    ip_address: null,
    user_agent: null,
    metadata: { application_number: 'APP-001' },
  },
  {
    source: 'compliance',
    id: 'compliance-1',
    occurred_at: '2026-06-22T13:47:04.407452+00:00',
    user_id: 'user-compliance',
    actor_role: 'super_admin',
    action: 'ACCESS_DENIED',
    object_type: 'route',
    object_id: '/admin/licensees',
    before_value: null,
    after_value: { message: null },
    justification: null,
    ip_address: '106.219.160.199',
    user_agent: 'vitest',
    metadata: {},
  },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromSpy,
    rpc: rpcSpy,
  },
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import ComplianceAuditLogs from '@/pages/admin/ComplianceAuditLogs';

describe('ComplianceAuditLogs', () => {
  beforeEach(() => {
    fromSpy.mockImplementation((table: string) => {
      if (table === 'audit_timeline') return makeQuery(timelineRows);
      if (table === 'security_event_logs') return makeQuery([]);
      return makeQuery([]);
    });
    rpcSpy.mockClear();
  });

  it('loads the unified audit timeline so legacy rows remain visible', async () => {
    render(<ComplianceAuditLogs />);

    await waitFor(() => expect(fromSpy).toHaveBeenCalledWith('audit_timeline'));
    expect(await screen.findByText('workflow_approved')).toBeInTheDocument();
    expect(screen.getByText('legacy')).toBeInTheDocument();
    expect(screen.getByText('compliance')).toBeInTheDocument();
    expect(screen.getByText('ACCESS_DENIED')).toBeInTheDocument();
  });
});