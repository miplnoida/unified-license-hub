/**
 * PCOMP-R1C-C1..C10 — assessment Policy Basis panel.
 *
 * The panel must render the server-owned policy snapshot and nothing else: no
 * derivation, no reconciliation with a newer active profile, no writes, and a
 * safe state when the server refuses or fails.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const SNAPSHOT = {
  status: 'SNAPSHOTTED',
  assessment_id: 'a-1',
  snapshot_id: 's-1',
  policy_profile_id: 'p-1',
  policy_profile_code: 'AML-CFT-POLICY',
  policy_profile_version: '2.0',
  policy_profile_origin: 'REGULATOR_AUTHORED',
  regulator_id: 'r-1',
  regulator_code: 'FSRA',
  sector_id: null,
  resolved_as_of: '2026-09-01',
  resolved_at: '2026-09-01T10:00:00Z',
  methodology_id: 'm-1',
  methodology_code: 'AML-CFT-RBA',
  methodology_version: '1.0',
  programme_set_id: 'pr-1',
  programme_code: 'AML-ANNUAL',
  programme_version: '3.1',
  calculation_config_id: 'c-1',
  calculation_config_version: '1.4',
  components: [
    {
      component_type: 'RESPONSE_POLICY',
      label: 'Response policy',
      component_id: 'cp-1',
      code: 'AML-RESP',
      component_version: '1.2',
      status_at_binding: 'ACTIVE',
      content_hash: 'hash-resp',
      capability: { capability_state: 'BINDABLE', runtime_consumed: false },
    },
  ],
  content_hash: '22ef382593b79db559563072bd70fb90',
  resolution: { status: 'RESOLVED' },
};

const LEGACY = {
  status: 'NO_POLICY_BASIS',
  assessment_id: 'a-2',
  reason: 'This assessment was created before an active regulator-owned policy profile governed its domain.',
  methodology_id: 'm-1',
  assessment_programme_id: null,
  assessment_programme_code: 'AML-LEGACY',
  assessment_programme_version: '1.0',
  assessment_programme_provenance: 'METHODOLOGY_DEFAULT',
};

let basis: any = SNAPSHOT;
let fail: string | null = null;
const calls: Array<{ fn: string; args: any }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fail) return Promise.resolve({ data: null, error: { message: fail } });
      return Promise.resolve({ data: basis, error: null });
    },
    from: () => {
      throw new Error('PCOMP-R1C: the policy basis panel must not read policy tables directly');
    },
  },
}));

import { AmlPolicyBasisPanel } from '@/components/supervision/aml/AmlPolicyBasisPanel';

function wrap(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AmlPolicyBasisPanel assessmentId={id} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { basis = SNAPSHOT; fail = null; calls.length = 0; });
afterEach(() => cleanup());

const SOURCE = readFileSync('src/components/supervision/aml/AmlPolicyBasisPanel.tsx', 'utf8');

describe('PCOMP-R1C-C1 snapshot-backed assessment shows the exact profile version', () => {
  it('renders the recorded profile code and version', async () => {
    wrap('a-1');
    expect(await screen.findByTestId('policy-basis-status')).toHaveTextContent('POLICY BASIS RECORDED');
    expect(screen.getByTestId('policy-basis-profile-code')).toHaveTextContent('AML-CFT-POLICY');
    expect(screen.getByTestId('policy-basis-profile-version')).toHaveTextContent('v2.0');
    expect(screen.getByTestId('policy-basis-profile-origin')).toHaveTextContent('REGULATOR_AUTHORED');
  });
});

describe('PCOMP-R1C-C2 methodology, programme and calculation versions display', () => {
  it('renders every governing version from the snapshot', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-basis-status');
    expect(screen.getByTestId('policy-basis-methodology-code')).toHaveTextContent('AML-CFT-RBA');
    expect(screen.getByTestId('policy-basis-methodology-version')).toHaveTextContent('v1.0');
    expect(screen.getByTestId('policy-basis-programme-code')).toHaveTextContent('AML-ANNUAL');
    expect(screen.getByTestId('policy-basis-programme-version')).toHaveTextContent('v3.1');
    expect(screen.getByTestId('policy-basis-calculation-version')).toHaveTextContent('v1.4');
    expect(screen.getByTestId('policy-basis-fingerprint')).toHaveTextContent('22ef382593b79db559563072bd70fb90');
  });
});

describe('PCOMP-R1C-C3 bound component versions display', () => {
  it('renders each bound component with its recorded version', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-basis-components');
    expect(screen.getByTestId('policy-basis-component-version-RESPONSE_POLICY')).toHaveTextContent('v1.2');
  });
});

describe('PCOMP-R1C-C4 legacy assessment shows the no-snapshot state', () => {
  it('states the assessment predates policy profile binding and invents no profile', async () => {
    basis = LEGACY;
    wrap('a-2');
    expect(await screen.findByTestId('policy-basis-status'))
      .toHaveTextContent('LEGACY / NO POLICY PROFILE SNAPSHOT');
    expect(screen.getByTestId('policy-basis-legacy-note'))
      .toHaveTextContent('predates operational Policy Profile binding');
    expect(screen.queryByTestId('policy-basis-profile-code')).toBeNull();
    expect(screen.getByTestId('policy-basis-legacy-programme')).toHaveTextContent('AML-LEGACY');
  });
});

describe('PCOMP-R1C-C5 the browser never derives policy basis', () => {
  it('reads only the server policy basis function and computes nothing', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-basis-status');
    expect(calls.map((c) => c.fn)).toEqual(['supervisory_assessment_policy_basis']);
    expect(calls[0].args).toEqual({ _assessment_id: 'a-1' });
    expect(SOURCE).not.toMatch(/supervisory_policy_profile_(resolve|effective)/);
    expect(SOURCE).not.toMatch(/\.from\(/);
  });
});

describe('PCOMP-R1C-C6 the panel is read-only', () => {
  it('exposes no mutation, form control or action', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-basis-status');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(SOURCE).not.toMatch(/useMutation|rpc\(|insert|update\(/);
  });
});

describe('PCOMP-R1C-C7 an inaccessible assessment discloses nothing', () => {
  it('shows the safe state and no policy values when the server refuses', async () => {
    fail = 'not_authorized: assessment outside supervisory scope';
    wrap('a-1');
    expect(await screen.findByTestId('policy-basis-status')).toHaveTextContent('POLICY BASIS UNAVAILABLE');
    expect(screen.queryByTestId('policy-basis-profile-code')).toBeNull();
    expect(screen.queryByTestId('policy-basis-fingerprint')).toBeNull();
  });
});

describe('PCOMP-R1C-C8 a failed policy-basis call shows a safe error state', () => {
  it('explains nothing is shown rather than an assumed configuration', async () => {
    fail = 'internal_error';
    wrap('a-1');
    expect(await screen.findByTestId('policy-basis-error'))
      .toHaveTextContent('rather than an assumed');
  });
});

describe('PCOMP-R1C-C9 a later profile version does not replace the stored snapshot', () => {
  it('keeps rendering the snapshot version even when a newer profile is active', async () => {
    // The server keeps returning the recorded snapshot; a newer active profile
    // (v3.0) exists in the platform but the panel has no path to it.
    wrap('a-1');
    await screen.findByTestId('policy-basis-status');
    expect(screen.getByTestId('policy-basis-profile-version')).toHaveTextContent('v2.0');
    expect(screen.queryByText('v3.0')).toBeNull();
    expect(SOURCE).not.toMatch(/latest|newest|current_profile/i);
  });
});

describe('PCOMP-R1C-C10 capability states shown are server-supplied', () => {
  it('renders the capability state exactly as the snapshot reports it', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-basis-components');
    expect(screen.getByTestId('policy-basis-component-capability-RESPONSE_POLICY'))
      .toHaveTextContent('BINDABLE');
    expect(SOURCE).not.toMatch(/RUNTIME_CONSUMED'|CERTIFIED'/);
  });
});
