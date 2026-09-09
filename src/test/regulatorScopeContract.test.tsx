/**
 * REG-SCOPE-05..09, 11, 14 — regulator context, active scope and
 * single-regulator UX for supervisory configuration screens.
 *
 * Server payloads are the only source of regulator vocabulary: the screens must
 * render what the canonical effective-regulator contract returns and must never
 * invent "All regulators".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const FSRA = { id: 'r-1', code: 'FSRA', name: 'Saint Lucia Financial Services Regulatory Authority', status: 'active' };
const SECOND = { id: 'r-2', code: 'FSC_CONDUCT', name: 'FSC Conduct Authority', status: 'active' };

let scope: any = {
  regulators: [FSRA],
  selectable_regulator_count: 1,
  cross_regulator_allowed: false,
  active_regulator: FSRA,
  regulator_scope_reason: null,
};

const METH_ROW = {
  id: 'm-1', code: 'AML_RBA', name: 'AML/CFT risk-based assessment methodology', title: null,
  version: '1.1', status: 'DRAFT', origin: 'MIPL_REFERENCE', origin_label: 'MIPL Reference',
  domain_code: 'AML_CFT', regulator_id: null, regulator_code: null, regulator_name: null,
  sector_summary: null, sector_count: 0, dimension_count: 26, question_count: 70,
  effective_from: null, effective_to: null, approval_state: 'NOT_RECORDED', approval_decided_at: null,
  has_lineage: false, updated_at: '2026-09-01T00:00:00Z',
};

const PROFILE_ROW = {
  id: 'p-1', code: 'AML_CFT_PROFILE', profile_version: '1.0', domain_code: 'AML_CFT',
  regulator_id: null, regulator_code: null, regulator_name: null, name: 'AML/CFT policy profile',
  title: null, status: 'DRAFT', origin: 'MIPL_REFERENCE', required_count: 2, satisfied_count: 0,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

const ADOPTION_TARGETS = {
  rows: [{ ...FSRA, already_adopted: false, resulting_version: '1.1+FSRA' }],
  total_count: 1,
  reference: { id: 'm-1', code: 'AML_RBA', version: '1.1', origin: 'MIPL_REFERENCE', origin_label: 'MIPL Reference' },
  reason: null,
};

const CAPABILITIES = {
  can_adopt: { allowed: true, reason: null },
  can_submit_review: { allowed: false, reason: 'Not applicable' },
  can_return_to_draft: { allowed: false, reason: 'Not applicable' },
  can_approve: { allowed: false, reason: 'Not applicable' },
  maker_checker: null,
};

function respond(fn: string) {
  switch (fn) {
    case 'supervisory_methodology_register':
      return { total_count: 1, rows: [METH_ROW], page: { limit: 25, offset: 0, sort: 'domain', dir: 'asc' } };
    case 'supervisory_methodology_register_options':
      return {
        domains: ['AML_CFT'], origins: [{ value: 'MIPL_REFERENCE', label: 'MIPL Reference' }],
        statuses: ['DRAFT'], sectors: [], approval_states: ['NOT_RECORDED'], ...scope,
      };
    case 'supervisory_policy_profile_register':
      return { rows: [PROFILE_ROW], total: 1, limit: 25, offset: 0 };
    case 'supervisory_policy_profile_register_options':
      return {
        domains: [{ domain_code: 'AML_CFT', policy_approval_permission: null }],
        statuses: ['DRAFT'], origins: ['MIPL_REFERENCE'], component_types: [], ...scope,
      };
    case 'supervisory_methodology_adoption_targets':
      return ADOPTION_TARGETS;
    case 'supervisory_methodology_action_capabilities':
      return CAPABILITIES;
    case 'supervisory_methodology_validate':
    case 'supervisory_methodology_review_readiness':
      return { blocking_count: 0, advisory_count: 0, results: [] };
    case 'supervisory_authorised_regulator_options':
      return scope;
    default:
      return null;
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string) => Promise.resolve({ data: respond(fn), error: null }),
    from: () => { throw new Error('REG-SCOPE: configuration screens must not read the regulators table directly'); },
  },
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/supervisory-methodology']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scope = {
    regulators: [FSRA], selectable_regulator_count: 1, cross_regulator_allowed: false,
    active_regulator: FSRA, regulator_scope_reason: null,
  };
});
afterEach(() => cleanup());

import MethodologyRegister from '@/pages/admin/SupervisoryMethodologyRegister';
import PolicyProfileRegister from '@/pages/admin/SupervisoryPolicyProfileRegister';
import { MethodologyActionBar } from '@/components/admin/supervisory-methodology/MethodologyActionBar';

describe('REG-SCOPE-05 single-regulator methodology register', () => {
  it('shows the regulator as context and never offers All regulators', async () => {
    wrap(<MethodologyRegister />);
    await screen.findByTestId('regulator-scope-context');
    expect(screen.getByTestId('regulator-scope-context')).toHaveTextContent(`Regulator: ${FSRA.name}`);
    expect(screen.queryByText('All regulators')).toBeNull();
    expect(screen.queryByLabelText('Regulator')).toBeNull();
  });
});

describe('REG-SCOPE-06 single-regulator policy profile register', () => {
  it('shows the regulator as context and never offers All regulators', async () => {
    wrap(<PolicyProfileRegister />);
    await screen.findByTestId('regulator-scope-context');
    expect(screen.queryByText('All regulators')).toBeNull();
    expect(screen.queryByLabelText('Regulator')).toBeNull();
  });
});

describe('REG-SCOPE-07 platform reference labelling', () => {
  it('labels a MIPL reference row as not regulator-owned, never All regulators', async () => {
    wrap(<MethodologyRegister />);
    expect((await screen.findAllByText(/MIPL Reference — not regulator-owned/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('All regulators')).toBeNull();
  });
});

describe('REG-SCOPE-08 multi-regulator selector', () => {
  it('renders a selector only when two or more authorised active regulators exist', async () => {
    scope = {
      regulators: [FSRA, SECOND], selectable_regulator_count: 2, cross_regulator_allowed: false,
      active_regulator: null, regulator_scope_reason: null,
    };
    wrap(<MethodologyRegister />);
    const trigger = await screen.findByLabelText('Regulator');
    expect(screen.queryByTestId('regulator-scope-context')).toBeNull();
    await userEvent.click(trigger);
    expect(await screen.findByText(SECOND.name)).toBeInTheDocument();
    expect(screen.queryByText('All regulators')).toBeNull();
  });
});

describe('REG-SCOPE-09 cross-regulator oversight only', () => {
  it('offers All regulators only when the server grants cross-regulator viewing', async () => {
    scope = {
      regulators: [FSRA, SECOND], selectable_regulator_count: 2, cross_regulator_allowed: true,
      active_regulator: null, regulator_scope_reason: null,
    };
    wrap(<MethodologyRegister />);
    await userEvent.click(await screen.findByLabelText('Regulator'));
    expect((await screen.findAllByText('All regulators')).length).toBeGreaterThan(0);
  });
});

describe('REG-SCOPE-11 adoption with one eligible regulator', () => {
  it('resolves the single eligible regulator without a redundant selection', async () => {
    wrap(
      <MethodologyActionBar
        methodology={{ id: 'm-1', code: 'AML_RBA', version: '1.1', origin: 'MIPL_REFERENCE', status: 'DRAFT' } as any}
        capabilities={CAPABILITIES as any}
        isLoading={false}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Adopt for Regulator/i }));
    await waitFor(() => expect(screen.getByTestId('adopt-sole-regulator')).toHaveTextContent(
      `Adopt for ${FSRA.name} (${FSRA.code})`));
    expect(screen.queryByLabelText('Regulator')).toBeNull();
  });
});

describe('REG-SCOPE-14 master vs operational regulator sources', () => {
  it('keeps the regulator master for Regulator Management only', () => {
    const management = readFileSync('src/pages/admin/RegulatorManagement.tsx', 'utf8');
    expect(management).toMatch(/useRegulatorMaster/);
    for (const p of [
      'src/pages/admin/SupervisoryMethodologyRegister.tsx',
      'src/pages/admin/SupervisoryPolicyProfileRegister.tsx',
      'src/components/admin/supervisory-methodology/MethodologyActionBar.tsx',
      'src/components/admin/supervisory-policy-profile/PolicyProfileActionBar.tsx',
    ]) {
      const s = readFileSync(p, 'utf8');
      expect(s).not.toMatch(/useRegulatorMaster|from\('regulators'/);
      expect(s).not.toMatch(/All regulators/);
    }
  });
});
