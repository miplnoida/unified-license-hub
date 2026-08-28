/**
 * F1-B.1 / GAP-F1-09 — automated coverage for the master-configuration surfaces.
 *
 * Covers: the Decision Authority operator screen, the Service Completeness
 * screen (including the BUSINESS_CONFIGURATION_REQUIRED display state),
 * authorized vs unauthorized configuration mutation, and the governed
 * config save / retire write path.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------- shared mocks

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

let permissions: Array<[string, string]> = [['role_management', 'manage_config'], ['settings', 'edit']];
vi.mock('@/hooks/usePermissions', () => ({
  useUserDynamicPermissions: () => ({
    isLoading: false,
    isAssignmentOnly: false,
    hasPermission: (m: string, a: string) => permissions.some(([pm, pa]) => pm === m && pa === a),
  }),
}));
vi.mock('@/hooks/useCan', () => ({
  useCan: (m: string, a: string) => permissions.some(([pm, pa]) => pm === m && pa === a),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const overview = {
  generated_at: '2026-08-28T00:00:00Z',
  rules: [
    {
      id: 'rule-1',
      decision_type: 'application.approve',
      enforcement_mode: 'OBSERVE_ONLY',
      status: 'active',
      required_module_key: 'application_management',
      required_permission_key: 'approve',
      requires_maker_checker: true,
      requires_committee: false,
      committee_kind: null,
      minimum_quorum: null,
      requires_conflict_clearance: true,
      allow_delegation: true,
      effective_from: '2026-08-01',
      effective_to: null,
      notes: null,
      regulator_id: null,
      regulatory_function_id: null,
      sector_id: null,
      sub_sector_id: null,
      service_id: null,
      regulator_name: null,
      regulatory_function_name: null,
      sector_name: null,
      sub_sector_name: null,
      service_name: null,
      observation_count: 4,
      would_deny_count: 0,
    },
  ],
  observation_summary: [],
  recent_observations: [],
  decision_type_census: [],
};

const save = { mutateAsync: vi.fn(async () => 'rule-1'), isPending: false };
const setStatus = { mutateAsync: vi.fn(async () => undefined), isPending: false };
vi.mock('@/hooks/useDecisionAuthority', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDecisionAuthorityOverview: () => ({ data: overview, isLoading: false, error: null }),
    useDecisionAuthorityMutations: () => ({ save, setStatus }),
  };
});

const report = {
  generated_at: '2026-08-28T00:00:00Z',
  services: 136,
  totals: { SATISFIED: 522, SATISFIED_BY_FALLBACK: 141, NOT_APPLICABLE: 8, MISSING_REQUIRED: 9 },
  by_dimension: [
    { dimension: 'sla', evaluated: 136, satisfied: 128, satisfied_by_fallback: 0, not_applicable: 0, missing_required: 8 },
    { dimension: 'fee', evaluated: 136, satisfied: 122, satisfied_by_fallback: 5, not_applicable: 8, missing_required: 1 },
  ],
  incomplete_services: 8,
  incomplete: [
    ...Array.from({ length: 8 }, (_, i) => ({
      service_id: `svc-${i}`,
      service_name: `Renew Licence ${i}`,
      service_code: `PLS_RENEW_${i}`,
      lifecycle_stage: 'renewal',
      decision_type: 'approval',
      dimension: 'sla',
      disposition: 'REQUIRED',
    })),
    {
      service_id: 'svc-0',
      service_name: 'Renew Licence 0',
      service_code: 'PLS_RENEW_0',
      lifecycle_stage: 'renewal',
      decision_type: 'approval',
      dimension: 'fee',
      disposition: 'REQUIRED',
    },
  ],
};

const expectations = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `exp-sla-${i}`,
    service_id: `svc-${i}`,
    lifecycle_stage: 'renewal',
    decision_type: 'approval',
    dimension: 'sla',
    disposition: 'REQUIRED' as const,
    justification: 'Renewal service standard is a regulator policy decision — BUSINESS_CONFIGURATION_REQUIRED',
    is_active: true,
    effective_from: '2026-08-01',
    effective_to: null,
  })),
  {
    id: 'exp-fee-0',
    service_id: 'svc-0',
    lifecycle_stage: 'renewal',
    decision_type: 'approval',
    dimension: 'fee',
    disposition: 'REQUIRED' as const,
    justification: 'Renewal fee is a regulator policy decision — BUSINESS_CONFIGURATION_REQUIRED',
    is_active: true,
    effective_from: '2026-08-01',
    effective_to: null,
  },
];

vi.mock('@/hooks/useServiceCompleteness', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useServiceCompletenessReport: () => ({ data: report, isLoading: false, error: null }),
    useServiceExpectations: () => ({ data: expectations }),
  };
});

import DecisionAuthorityManager from '@/pages/admin/DecisionAuthorityManager';
import ServiceCompletenessReport from '@/pages/admin/ServiceCompletenessReport';
import { configRetire, configSave, toConfigWriteError } from '@/lib/configWriter';
import {
  countBusinessConfigurationRequired,
  isBusinessConfigurationRequired,
} from '@/hooks/useServiceCompleteness';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  rpc.mockReset();
  save.mutateAsync.mockClear();
  setStatus.mutateAsync.mockClear();
  permissions = [['role_management', 'manage_config'], ['settings', 'edit']];
});

// ------------------------------------------------- Decision Authority screen

describe('Decision Authority operator screen', () => {
  it('renders the configured ruleset with its enforcement mode', () => {
    wrap(<DecisionAuthorityManager />);
    expect(screen.getByText('application.approve')).toBeInTheDocument();
    expect(screen.getAllByText('OBSERVE ONLY').length).toBeGreaterThan(0);
  });

  it('exposes write actions to an operator holding role_management.manage_config', () => {
    wrap(<DecisionAuthorityManager />);
    expect(screen.getByRole('button', { name: /new rule/i })).toBeInTheDocument();
  });

  it('hides write actions from an operator without the configuration permission', () => {
    permissions = [];
    wrap(<DecisionAuthorityManager />);
    expect(screen.queryByRole('button', { name: /new rule/i })).toBeNull();
  });
});

// ---------------------------------------------- Service Completeness screen

describe('Service Completeness screen', () => {
  it('renders dimension coverage and the missing-required total', () => {
    wrap(<ServiceCompletenessReport />);
    expect(screen.getByText('Service Configuration Completeness')).toBeInTheDocument();
    expect(screen.getByText('Service standard (SLA)')).toBeInTheDocument();
    expect(screen.getByText('Missing required')).toBeInTheDocument();
    expect(screen.getAllByText('9').length).toBeGreaterThan(0);
  });

  it('reports the BUSINESS_CONFIGURATION_REQUIRED items on the gaps tab', async () => {
    wrap(<ServiceCompletenessReport />);
    fireEvent.click(screen.getByRole('tab', { name: /missing configuration/i }));
    await waitFor(() => {
      const description = screen
        .getAllByText((_, node) => !!node?.textContent?.match(/9 of these are recorded as BUSINESS_CONFIGURATION_REQUIRED/i));
      expect(description.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('BUSINESS_CONFIGURATION_REQUIRED').length).toBe(9);
  });
});

describe('BUSINESS_CONFIGURATION_REQUIRED classification', () => {
  it('counts 9 items — 8 renewal service standards plus 1 renewal fee', () => {
    expect(countBusinessConfigurationRequired(report.incomplete, expectations)).toBe(9);
    expect(report.incomplete.filter((r) => r.dimension === 'sla')).toHaveLength(8);
    expect(report.incomplete.filter((r) => r.dimension === 'fee')).toHaveLength(1);
  });

  it('does not classify a gap without a policy justification', () => {
    expect(
      isBusinessConfigurationRequired({ service_id: 'svc-x', dimension: 'sla' }, expectations),
    ).toBe(false);
  });
});

// ------------------------------------------- governed configuration mutation

describe('governed configuration write path', () => {
  it('routes a create through config_save with the governed table name', async () => {
    rpc.mockResolvedValue({ data: { id: 'reg-1' }, error: null });
    await configSave('regulators', { name: 'FSC', code: 'FSC' }, { reason: 'new division' });
    expect(rpc).toHaveBeenCalledWith('config_save', {
      _table_name: 'regulators',
      _payload: { name: 'FSC', code: 'FSC' },
      _id: null,
      _reason: 'new division',
    });
  });

  it('routes a retire through config_retire rather than a hard delete', async () => {
    rpc.mockResolvedValue({ data: { id: 'reg-1' }, error: null });
    await configRetire('regulators', 'reg-1', { reason: 'merged' });
    expect(rpc).toHaveBeenCalledWith('config_retire', {
      _table_name: 'regulators',
      _id: 'reg-1',
      _reason: 'merged',
      _reactivate: false,
    });
  });

  it('surfaces an unauthorized mutation as a permission error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not_authorised' } });
    await expect(
      configSave('regulators', { name: 'FSC' }, { entityLabel: 'regulator' }),
    ).rejects.toThrow(/do not have permission to change regulator/i);
  });

  it('keeps hard delete refusals operator-readable', () => {
    const err = toConfigWriteError({ message: 'config_hard_delete_forbidden' }, 'regulator');
    expect(err.message).toMatch(/must be retired rather than deleted/i);
  });
});
