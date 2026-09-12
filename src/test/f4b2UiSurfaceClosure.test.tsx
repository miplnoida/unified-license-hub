/**
 * F4-B2 — UI / surface closure regression coverage.
 *
 * Proves permanently that:
 *   - /applications/queue stays routed to the canonical ApplicationQueue surface
 *   - the retired legacy PreLicense / PostLicense sample screens stay absent
 *   - the canonical pre/post-license entry routes are preserved
 *   - the applicant withdrawal control is owner-only, non-terminal-only,
 *     reason-gated, confirmation-gated and routed exclusively through the
 *     governed `withdraw_application` RPC (no direct application mutation)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// vi.mock calls below are hoisted, so this import is safe at the top of the file.
import { ApplicationWithdrawalPanel } from '@/components/applications/ApplicationWithdrawalPanel';
import { existsSync, readFileSync } from 'node:fs';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const routes = readFileSync('src/routes/dashboardRoutes.tsx', 'utf8');
const panelSource = readFileSync(
  'src/components/applications/ApplicationWithdrawalPanel.tsx',
  'utf8',
);
const detailSource = readFileSync('src/pages/applications/ApplicationDetail.tsx', 'utf8');
const governedOps = readFileSync('src/lib/applicationGovernedOps.ts', 'utf8');

describe('F4-B2 route / surface manifest', () => {
  it('keeps /applications/queue routed to the canonical ApplicationQueue', () => {
    expect(existsSync('src/pages/applications/ApplicationQueue.tsx')).toBe(true);
    expect(routes).toMatch(
      /path="\/applications\/queue"[\s\S]{0,160}<ApplicationQueue \/>/,
    );
    expect(routes).toContain("import('@/pages/applications/ApplicationQueue')");
  });

  it('keeps the canonical pre/post-license application entry routes', () => {
    expect(routes).toMatch(/path="\/pre-license\/new"[\s\S]{0,200}<NewApplication \/>/);
    expect(routes).toMatch(
      /path="\/post-license\/new"[\s\S]{0,200}<NewPostLicenseApplication \/>/,
    );
  });

  it('legacy PreLicense / PostLicense sample screens are retired', () => {
    expect(existsSync('src/pages/PreLicense.tsx')).toBe(false);
    expect(existsSync('src/pages/PostLicense.tsx')).toBe(false);
    expect(routes).not.toMatch(/import\(['"]@\/pages\/(Pre|Post)License['"]\)/);
  });
});

describe('F4-B2 withdrawal governance (static)', () => {
  it('withdrawal is a governed RPC call with no direct application mutation', () => {
    expect(governedOps).toContain("'withdraw_application'");
    expect(panelSource).toContain('applicationWithdraw');
    for (const source of [panelSource, detailSource]) {
      expect(source).not.toMatch(
        /from\(['"]applications['"]\)[\s\S]{0,240}\.update\(\{[\s\S]{0,300}withdraw/i,
      );
      expect(source).not.toMatch(
        /from\(['"]applications['"]\)[\s\S]{0,200}\.update\(\{[\s\S]{0,300}status\s*:/,
      );
    }
    // The RPC name must never be reached other than through the governed helper.
    expect(panelSource).not.toMatch(/supabase\.rpc\(/);
  });

  it('the canonical applicant Application Detail surface renders the panel', () => {
    expect(detailSource).toContain('<ApplicationWithdrawalPanel');
    expect(detailSource).toContain(
      "import { ApplicationWithdrawalPanel } from '@/components/applications/ApplicationWithdrawalPanel'",
    );
  });
});

const mockAuth = vi.hoisted(() => ({ user: { id: 'owner-1' } as { id: string } | null }));
const mockWithdraw = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
vi.mock('@/lib/applicationGovernedOps', () => ({
  applicationWithdraw: (...args: unknown[]) => mockWithdraw(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      }),
    }),
  },
}));

const baseProps = {
  applicationId: 'app-1',
  applicationNumber: 'APP-0001',
  applicantId: 'owner-1',
  entityId: null,
  applicationData: {},
};

describe('F4-B2 withdrawal control behaviour', () => {
  beforeEach(() => {
    mockAuth.user = { id: 'owner-1' };
    mockWithdraw.mockReset();
    mockWithdraw.mockResolvedValue({ success: true, application_id: 'app-1', status: 'withdrawn' });
  });

  it('eligible owner sees the withdrawal control', () => {
    render(<ApplicationWithdrawalPanel {...baseProps} status="submitted" />);
    expect(screen.getByTestId('application-withdrawal-panel')).toBeTruthy();
  });

  it('a different signed-in user never sees the control', () => {
    mockAuth.user = { id: 'someone-else' };
    render(<ApplicationWithdrawalPanel {...baseProps} status="submitted" />);
    expect(screen.queryByTestId('application-withdrawal-panel')).toBeNull();
  });

  it('terminal applications cannot be withdrawn', () => {
    for (const status of ['approved', 'rejected', 'cancelled', 'closed']) {
      const { unmount } = render(<ApplicationWithdrawalPanel {...baseProps} status={status} />);
      expect(screen.queryByTestId('application-withdrawal-panel')).toBeNull();
      unmount();
    }
  });

  it('an already withdrawn application shows the final withdrawn state instead', () => {
    render(
      <ApplicationWithdrawalPanel
        {...baseProps}
        status="withdrawn"
        applicationData={{ withdrawal_reason: 'No longer required' }}
      />,
    );
    expect(screen.getByTestId('application-withdrawn-state')).toBeTruthy();
    expect(screen.queryByTestId('application-withdrawal-panel')).toBeNull();
  });

  it('an empty reason blocks submission', () => {
    render(<ApplicationWithdrawalPanel {...baseProps} status="submitted" />);
    const button = screen.getByTestId('withdraw-application-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('requires confirmation and then calls the governed RPC with the reason', async () => {
    const onWithdrawn = vi.fn();
    render(
      <ApplicationWithdrawalPanel {...baseProps} status="submitted" onWithdrawn={onWithdrawn} />,
    );
    fireEvent.change(screen.getByTestId('withdrawal-reason'), { target: { value: 'Business plan changed' } });
    fireEvent.click(screen.getByTestId('withdraw-application-button'));
    // Confirmation dialog gates the call.
    expect(mockWithdraw).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('withdraw-application-confirm'));
    await waitFor(() =>
      expect(mockWithdraw).toHaveBeenCalledWith('app-1', 'Business plan changed'),
    );
    await waitFor(() => expect(onWithdrawn).toHaveBeenCalled());
  });

  it('surfaces server errors safely without mutating local state', async () => {
    mockWithdraw.mockRejectedValue(new Error('Cannot withdraw an application in \'approved\' status'));
    render(<ApplicationWithdrawalPanel {...baseProps} status="submitted" />);
    fireEvent.change(screen.getByTestId('withdrawal-reason'), { target: { value: 'Changed our mind' } });
    fireEvent.click(screen.getByTestId('withdraw-application-button'));
    fireEvent.click(await screen.findByTestId('withdraw-application-confirm'));
    await waitFor(() => expect(mockWithdraw).toHaveBeenCalled());
    // The panel stays mounted (no optimistic terminal state in the browser).
    expect(screen.getByTestId('application-withdrawal-panel')).toBeTruthy();
  });
});
