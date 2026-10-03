/**
 * AML-CLOSE-02 — the governing-configuration panel only displays the server's
 * decision about sector overlay, fact configuration and source binding.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const hookState: { data: any; isLoading: boolean; error: any } = { data: null, isLoading: false, error: null };
vi.mock('@/hooks/useAssessmentConfigurationAuthority', () => ({
  useAssessmentConfigurationAuthority: () => ({ ...hookState, refetch: vi.fn() }),
}));

import { AmlConfigurationAuthorityPanel } from '@/components/supervision/aml/AmlConfigurationAuthorityPanel';

const governed = (extra: Record<string, unknown> = {}) => ({
  assessment_id: 'a-1',
  generated_at: '2026-10-03T00:00:00Z',
  methodology_fact_count: 2,
  sector_overlay: {
    component_type: 'SECTOR_OVERLAY', status: 'GOVERNED', reason_code: 'GOVERNED', code: 'OV', component_version: '1.0',
    applies: true, applicability: 'APPLICABLE', sector_code: 'CREDIT_UNIONS',
    policy_profile_code: 'FSRA-AML-CFT-POLICY', policy_profile_version: '1.1',
  },
  fact_config: { component_type: 'FACT_CONFIG', status: 'GOVERNED', reason_code: 'GOVERNED', code: 'FC', component_version: '1.0',
    policy_profile_code: 'FSRA-AML-CFT-POLICY', policy_profile_version: '1.1' },
  source_binding: { component_type: 'SOURCE_BINDING', status: 'GOVERNED', reason_code: 'GOVERNED', code: 'SB', component_version: '1.0' },
  facts: [
    { fact_code: 'STR_COUNT', label: 'STRs filed', data_type: 'numeric', permitted: true, required: true, sector_codes: ['CREDIT_UNIONS'],
      allowed_sources: [{ source_kind: 'RETURN', source_reference: 'AML-RET-Q' }], recorded: false, source_type: null },
    { fact_code: 'UNLISTED', label: 'Not configured', data_type: 'text', permitted: false, required: false, sector_codes: null,
      allowed_sources: null, recorded: false, source_type: null },
  ],
  ...extra,
});

afterEach(() => { cleanup(); hookState.data = null; hookState.error = null; });

describe('AmlConfigurationAuthorityPanel', () => {
  it('shows pinned versions, permitted/mandatory facts and bound sources from the server', () => {
    hookState.data = governed();
    render(<AmlConfigurationAuthorityPanel assessmentId="a-1" />);
    expect(screen.getByText('OV v1.0')).toBeTruthy();
    expect(screen.getByText('FC v1.0')).toBeTruthy();
    expect(screen.getByText(/RETURN · AML-RET-Q/)).toBeTruthy();
    expect(screen.getByTestId('config-fact-STR_COUNT').textContent).toContain('Missing');
    expect(screen.getByTestId('config-fact-UNLISTED').textContent).toContain('No');
  });

  it('warns when the overlay excludes the entity sector', () => {
    hookState.data = governed({
      sector_overlay: { component_type: 'SECTOR_OVERLAY', status: 'GOVERNED', reason_code: 'SECTOR_NOT_IN_OVERLAY', code: 'OV',
        component_version: '1.0', applies: false, applicability: null, sector_code: 'MONEY_SERVICES_BUSINESS',
        reason: 'Sector MONEY_SERVICES_BUSINESS is not covered by sector overlay OV 1.0.' },
    });
    render(<AmlConfigurationAuthorityPanel assessmentId="a-1" />);
    expect(screen.getByTestId('config-overlay-excludes').textContent).toContain('not covered');
  });

  it('states plainly when the families are not part of the assessment policy', () => {
    const ng = { status: 'NOT_GOVERNED', reason_code: 'X_NOT_BOUND', reason: 'The policy package pinned by this assessment binds no component of this family.' };
    hookState.data = governed({
      methodology_fact_count: 0,
      sector_overlay: { component_type: 'SECTOR_OVERLAY', ...ng, applies: true, applicability: null, sector_code: 'CREDIT_UNIONS' },
      fact_config: { component_type: 'FACT_CONFIG', ...ng },
      source_binding: { component_type: 'SOURCE_BINDING', ...ng },
      facts: [],
    });
    render(<AmlConfigurationAuthorityPanel assessmentId="a-1" />);
    expect(screen.getAllByText(/Not part of this assessment/).length).toBe(3);
    expect(screen.getByTestId('config-no-facts')).toBeTruthy();
  });

  it('surfaces a read failure instead of guessing', () => {
    hookState.error = new Error('not_authorized: assessment outside your supervisory authority');
    render(<AmlConfigurationAuthorityPanel assessmentId="a-1" />);
    expect(screen.getByTestId('config-authority-unavailable').textContent).toContain('not_authorized');
  });

  it('decides nothing in the browser', () => {
    const src = readFileSync('src/components/supervision/aml/AmlConfigurationAuthorityPanel.tsx', 'utf8');
    expect(src).not.toMatch(/supabase\.(from|rpc)/);
    expect(src).not.toMatch(/CREDIT_UNIONS|NOT_APPLICABLE'|'RETURN'/);
  });
});
