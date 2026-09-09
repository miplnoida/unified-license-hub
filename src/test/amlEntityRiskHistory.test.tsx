/**
 * UI-RISK-01…10 — AML-07 entity AML/CFT risk-of-record history.
 *
 * Payloads mirror `supervisory_entity_risk_history`. The gates prove the current
 * badge is the published risk-of-record, history is immutable and legacy records
 * are shown honestly rather than dressed up with invented lineage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const ENTITY = 'e7700000-0000-4000-8000-000000000001';
const ASSESSMENT = 'a7700000-0000-4000-8000-000000000002';

type Mode = 'published' | 'none' | 'legacy' | 'override';
let mode: Mode = 'published';
const calls: Array<{ fn: string; args: any }> = [];

const DECISION = {
  final_rating: 'MEDIUM_HIGH',
  final_rating_source: 'COMPUTED',
  override_rating: null as string | null,
  calculation_run_seq: 4,
  methodology_version: 'AML/CFT-RBA v1.0',
  programme_version: '2',
};

const PUBLICATION = {
  published_by: 'reviewer-9',
  published_at: '2026-03-05T10:00:05Z',
  approval_decision_id: 'ad770000-0000-4000-8000-000000000001',
  reason: 'Approved annual AML/CFT assessment.',
  effective_from: '2026-03-05',
};

function payload() {
  switch (mode) {
    case 'none':
      return { current: null, movements: [] };
    case 'legacy':
      return {
        current: {
          residual_rating: 'MEDIUM', inherent_rating: 'MEDIUM_HIGH', control_rating: 'SATISFACTORY',
          effective_from: '2024-06-01T00:00:00Z', last_review_date: '2024-06-01', next_review_date: '2025-06-01',
          driving_assessment_id: ASSESSMENT, publication: null,
        },
        movements: [{
          id: 'mv-legacy-1', previous_rating: 'LOW', new_rating: 'MEDIUM', trend: 'INCREASING',
          created_at: '2024-06-01T00:00:00Z', new_assessment_id: ASSESSMENT,
          reason: 'Legacy approved assessment.', approved_by: 'officer-legacy', approved_at: '2024-06-01T00:00:00Z',
          decision: null, publication: null,
        }],
      };
    case 'override':
      return {
        current: {
          residual_rating: 'HIGH', inherent_rating: 'HIGH', control_rating: 'WEAK',
          effective_from: '2026-03-05T00:00:00Z', last_review_date: '2026-03-05', next_review_date: '2027-03-05',
          driving_assessment_id: ASSESSMENT, publication: PUBLICATION,
        },
        movements: [{
          id: 'mv-2', previous_rating: 'MEDIUM_HIGH', new_rating: 'HIGH', trend: 'INCREASING',
          created_at: '2026-03-05T10:00:05Z', new_assessment_id: ASSESSMENT,
          reason: 'Approved supervisory override of the calculated rating.',
          approved_by: 'reviewer-9', approved_at: '2026-03-05T10:00:00Z',
          decision: { ...DECISION, final_rating: 'HIGH', final_rating_source: 'APPROVED_OVERRIDE', override_rating: 'HIGH' },
          publication: PUBLICATION,
        }],
      };
    default:
      return {
        current: {
          residual_rating: 'MEDIUM_HIGH', inherent_rating: 'MEDIUM_HIGH', control_rating: 'WEAK',
          effective_from: '2026-03-05T00:00:00Z', last_review_date: '2026-03-05', next_review_date: '2027-03-05',
          driving_assessment_id: ASSESSMENT, publication: PUBLICATION,
        },
        movements: [
          {
            id: 'mv-2', previous_rating: 'MEDIUM', new_rating: 'MEDIUM_HIGH', trend: 'INCREASING',
            created_at: '2026-03-05T10:00:05Z', new_assessment_id: ASSESSMENT,
            reason: 'Approved annual AML/CFT assessment.', approved_by: 'reviewer-9',
            approved_at: '2026-03-05T10:00:00Z', decision: DECISION, publication: PUBLICATION,
          },
          {
            id: 'mv-1', previous_rating: 'LOW', new_rating: 'MEDIUM', trend: 'INCREASING',
            created_at: '2025-03-05T10:00:05Z', new_assessment_id: 'a7700000-0000-4000-8000-000000000003',
            reason: 'Previous annual assessment.', approved_by: 'reviewer-3',
            approved_at: '2025-03-05T10:00:00Z', decision: null, publication: null,
          },
        ],
      };
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn !== 'supervisory_entity_risk_history') {
        throw new Error(`UI-RISK: unexpected operation ${fn}`);
      }
      return { data: payload(), error: null };
    },
    from: (table: string) => {
      throw new Error(`UI-RISK: the risk history surface must not read ${table} directly`);
    },
  },
}));

import { AmlEntityRiskHistory } from '@/components/supervision/aml/AmlEntityRiskHistory';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AmlEntityRiskHistory entityId={ENTITY} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mode = 'published';
  calls.length = 0;
  cleanup();
});

describe('AML-07 entity AML/CFT risk history', () => {
  it('UI-RISK-01: reads the current risk only from the governed risk-history contract', async () => {
    renderPanel();
    await screen.findByText(/Current published risk: MEDIUM_HIGH/);
    expect(calls.map((c) => c.fn)).toEqual(['supervisory_entity_risk_history']);
    expect(calls[0].args._domain_code).toBe('AML_CFT');
  });

  it('UI-RISK-02: shows the effective date and review dates of the published record', async () => {
    renderPanel();
    await screen.findByText(/Current published risk/);
    expect(screen.getByText('Effective / as-of')).toBeInTheDocument();
    expect(screen.getByText('Last review / next review')).toBeInTheDocument();
  });

  it('UI-RISK-03: links the published risk to its source assessment', async () => {
    renderPanel();
    await screen.findByText(/Current published risk/);
    const link = screen.getByRole('link', { name: ASSESSMENT });
    expect(link).toHaveAttribute('href', `/supervision/aml/assessments/${ASSESSMENT}`);
  });

  it('UI-RISK-04: shows the publication actor, time, approval decision and reason', async () => {
    renderPanel();
    await screen.findByText(/Current published risk/);
    expect(screen.getAllByText(/reviewer-9/).length).toBeGreaterThan(0);
    expect(screen.getByText(PUBLICATION.approval_decision_id)).toBeInTheDocument();
    expect(screen.getAllByText(/Approved annual AML\/CFT assessment/).length).toBeGreaterThan(0);
  });

  it('UI-RISK-05: lists superseded ratings with their previous and new rating', async () => {
    renderPanel();
    await screen.findByText('Superseded ratings');
    expect(screen.getByText(/MEDIUM → MEDIUM_HIGH/)).toBeInTheDocument();
    expect(screen.getByText(/LOW → MEDIUM/)).toBeInTheDocument();
  });

  it('UI-RISK-06: shows the calculation run and methodology/programme versions behind a movement', async () => {
    renderPanel();
    await screen.findByText('Superseded ratings');
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText(/AML\/CFT-RBA v1\.0 \/ 2/)).toBeInTheDocument();
  });

  it('UI-RISK-07: labels the approved result source and any approved override', async () => {
    mode = 'override';
    renderPanel();
    await screen.findByText(/Current published risk: HIGH/);
    expect(screen.getByText('Approved supervisory override')).toBeInTheDocument();
    expect(screen.getByText('override HIGH')).toBeInTheDocument();
  });

  it('UI-RISK-08: states honestly when no risk-of-record has been published', async () => {
    mode = 'none';
    renderPanel();
    expect(await screen.findByText('No published AML/CFT risk-of-record')).toBeInTheDocument();
    expect(screen.getByText(/No risk movement has been recorded/)).toBeInTheDocument();
  });

  it('UI-RISK-09: marks a legacy record instead of inventing a calculation run', async () => {
    mode = 'legacy';
    renderPanel();
    await screen.findByText(/Current published risk: MEDIUM/);
    expect(screen.getByText(/Legacy publication — no governed publication record/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy — no AML-06 run/)).toBeInTheDocument();
    expect(screen.getByText('Legacy movement')).toBeInTheDocument();
  });

  it('UI-RISK-10: never derives current risk from a movement or a calculated result', async () => {
    mode = 'none';
    renderPanel();
    await screen.findByText('No published AML/CFT risk-of-record');
    expect(screen.queryByText(/Current published risk/)).not.toBeInTheDocument();
  });
});
