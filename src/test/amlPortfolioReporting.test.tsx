/**
 * UI-PORT-01…24 — AML-10 server-authoritative AML/CFT portfolio risk and
 * management reporting.
 *
 * Payload shapes mirror `supervisory_portfolio_report` /
 * `supervisory_portfolio_export` exactly as the rolled-back AML10CERT fixture in
 * `scripts/verify-aml-portfolio-reporting.sql` exercises them.
 *
 * Every gate proves the screen prints the server's portfolio contract. No gate
 * expects the browser to decide visibility, a risk classification, a provenance
 * bucket, a total, a review state, a movement direction, a filter result or an
 * exported value.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const E1 = 'e1000000-0000-4000-8000-000000000001';
const E2 = 'e1000000-0000-4000-8000-000000000002';
const E3 = 'e1000000-0000-4000-8000-000000000003';
const MV = 'mv100000-0000-4000-8000-000000000001';

type Mode = 'full' | 'empty' | 'refused' | 'truncated' | 'no_movements' | 'export_refused';
let mode: Mode = 'full';
const calls: Array<{ fn: string; args: any }> = [];

const summary = () => ({
  as_of: '2026-09-10',
  domain_code: 'AML_CFT',
  regulator_id: 'r1000000-0000-4000-8000-000000000001',
  visible_entity_total: 9,
  entity_total: 3,
  entities_with_current_risk: 2,
  entities_without_risk: 1,
  calculated_risk_total: 1,
  approved_override_total: 1,
  legacy_risk_total: 1,
  not_calculable_total: 2,
  no_risk_total: 1,
  review_current_total: 1,
  review_due_total: 1,
  review_overdue_total: 4,
  review_event_triggered_total: 1,
  review_unscheduled_total: 2,
  review_blocked_total: 1,
  review_legacy_total: 1,
  entities_with_open_reassessment: 1,
  entities_with_open_consequence: 2,
  open_findings_total: 5,
  open_examinations_total: 3,
  open_interventions_total: 2,
  open_enforcement_total: 1,
});

const entity = (over: Record<string, unknown> = {}) => ({
  entity_id: E1,
  entity_name: 'Castries Trust Company Ltd',
  entity_status: 'ACTIVE',
  regulator_id: 'r1000000-0000-4000-8000-000000000001',
  sector_id: null,
  domain_code: 'AML_CFT',
  current_risk: 'HIGH',
  inherent_rating: 'HIGH',
  control_rating: 'ADEQUATE',
  provenance_bucket: 'CALCULATED',
  rating_provenance: 'CALCULATED',
  calculation_availability: 'AVAILABLE',
  effective_from: '2026-04-02',
  risk_age_days: 161,
  source_kind: 'PUBLICATION',
  publication_id: 'pb100000',
  assessment_id: 'as100000',
  assessment_reference: 'AML-2026-0011',
  assessment_status: 'APPROVED',
  assessment_programme_id: 'pg100000',
  assessment_programme_code: 'AML-PERIODIC',
  monitoring_state: 'OVERDUE',
  monitoring_reason_code: 'REVIEW_DATE_PASSED',
  next_review_date: '2026-08-31',
  due_date_basis: 'PROGRAMME_CYCLE',
  open_reassessment_id: 'rq100000',
  open_consequence_count: 2,
  open_findings: 3,
  open_examinations: 1,
  open_interventions: 1,
  open_enforcement: 0,
  restricted_matter_present: false,
  reason_codes: [],
  routes: {
    entity: `/supervision/aml/entities/${E1}`,
    assessment: '/supervision/aml/assessments/as100000',
    findings: '/supervision/aml/findings',
    examinations: '/supervision/aml/examinations',
  },
  ...over,
});

const movement = () => ({
  movement_id: MV,
  entity_id: E1,
  entity_name: 'Castries Trust Company Ltd',
  previous_rating: 'MEDIUM',
  new_rating: 'HIGH',
  trend: 'WORSENING',
  direction: 'UPWARD',
  reason: 'Approved periodic assessment raised the risk-of-record.',
  trigger_kind: 'ASSESSMENT_APPROVED',
  previous_assessment_id: 'as100009',
  new_assessment_id: 'as100000',
  legacy_movement: false,
  source_publication_id: 'pb100000',
  approved_by: 'u100000',
  approved_at: '2026-04-02T10:00:00Z',
  occurred_on: '2026-04-02',
  lineage: { publication_id: 'pb100000' },
});

function report() {
  const base = {
    generated_at: '2026-09-10T09:00:00Z',
    as_of: '2026-09-10',
    domain_code: 'AML_CFT',
    source: 'CANONICAL_SUPERVISORY_RECORDS',
    filters: { domain_code: 'AML_CFT' },
    summary: summary(),
    risk_distribution: [
      { risk_code: 'HIGH', provenance_bucket: 'CALCULATED', entities: 1 },
      { risk_code: 'MEDIUM', provenance_bucket: 'APPROVED_OVERRIDE', entities: 1 },
      { risk_code: 'LOW', provenance_bucket: 'LEGACY', entities: 1 },
    ],
    review_distribution: [
      { monitoring_state: 'OVERDUE', entities: 4 },
      { monitoring_state: 'CURRENT', entities: 1 },
    ],
    trends: {
      period_from: '2026-03-01',
      period_to: '2026-09-10',
      source: 'entity_risk_state_movement',
      opening: { HIGH: 0, MEDIUM: 1 },
      closing: { HIGH: 1, MEDIUM: 0 },
      upward_movements: 1,
      downward_movements: 0,
      unchanged_movements: 0,
      unclassified_movements: 0,
      movements: [movement()],
    },
    entities: [
      entity(),
      entity({
        entity_id: E2,
        entity_name: 'Soufriere Money Services Ltd',
        current_risk: 'LOW',
        provenance_bucket: 'LEGACY',
        rating_provenance: 'LEGACY',
        calculation_availability: 'UNAVAILABLE',
        monitoring_state: 'LEGACY',
        monitoring_reason_code: 'LEGACY_RISK_RECORD',
        next_review_date: null,
        open_reassessment_id: null,
        open_consequence_count: 0,
        restricted_matter_present: true,
        reason_codes: [{
          field: 'current_risk',
          code: 'LEGACY_RISK_RECORD',
          detail: 'The risk-of-record predates governed publication.',
        }],
        routes: {
          entity: `/supervision/aml/entities/${E2}`,
          assessment: null,
          findings: '/supervision/aml/findings',
          examinations: '/supervision/aml/examinations',
        },
      }),
      entity({
        entity_id: E3,
        entity_name: 'Vieux Fort Insurance Agency Ltd',
        current_risk: null,
        provenance_bucket: 'NO_RISK',
        rating_provenance: 'UNAVAILABLE',
        calculation_availability: 'UNAVAILABLE',
        effective_from: null,
        risk_age_days: null,
        assessment_id: null,
        assessment_reference: null,
        assessment_status: null,
        monitoring_state: 'BLOCKED',
        monitoring_reason_code: 'NO_RISK_OF_RECORD',
        next_review_date: null,
        open_reassessment_id: null,
        open_consequence_count: 0,
        open_findings: 0,
        open_examinations: 0,
        open_interventions: 0,
        open_enforcement: 0,
        reason_codes: [{
          field: 'current_risk',
          code: 'NO_RISK_OF_RECORD',
          detail: 'No AML/CFT risk-of-record exists for this entity.',
        }],
        routes: {
          entity: `/supervision/aml/entities/${E3}`,
          assessment: null,
          findings: '/supervision/aml/findings',
          examinations: '/supervision/aml/examinations',
        },
      }),
    ],
    row_count: 3,
    truncated: false,
    notes: [
      'Legacy and not-calculated risk records are reported separately and are never counted as calculated ratings.',
      'Restricted supervisory matters are reported as presence only.',
    ],
  };

  if (mode === 'empty') {
    return {
      ...base,
      summary: { ...summary(), entity_total: 0 },
      risk_distribution: [],
      entities: [],
      row_count: 0,
      trends: { ...base.trends, movements: [], upward_movements: 0 },
    };
  }
  if (mode === 'truncated') return { ...base, truncated: true, row_count: 2 };
  if (mode === 'no_movements') {
    return { ...base, trends: { ...base.trends, movements: [], upward_movements: 0, downward_movements: 0, unchanged_movements: 0 } };
  }
  return base;
}

const exportCalls: Array<{ rows: unknown[]; name: string; provenance: any }> = [];
vi.mock('@/pages/reports/services/exportService', () => ({
  exportToCsv: (rows: unknown[], name: string, _labels: unknown, provenance: unknown) => {
    exportCalls.push({ rows, name, provenance });
  },
  sanitizeFilename: (n: string) => n,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === 'supervisory_portfolio_report' && mode === 'refused') {
        return Promise.resolve({
          data: null,
          error: { message: 'not_authorized: aml_supervision.view is required for the AML/CFT portfolio report.' },
        });
      }
      if (fn === 'supervisory_portfolio_export') {
        if (mode === 'export_refused') {
          return Promise.resolve({ data: null, error: { message: 'not_authorized: the export was refused.' } });
        }
        return Promise.resolve({
          data: {
            ...report(),
            report_title: 'AML/CFT portfolio risk and management report',
            regulator_id: 'r1000000-0000-4000-8000-000000000001',
            generated_by: 'supervisor@fsra.example',
            generated_by_id: 'u100000',
          },
          error: null,
        });
      }
      return Promise.resolve({ data: report(), error: null });
    },
  },
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { AmlPortfolioReport } from '@/components/supervision/aml/AmlPortfolioReport';
import AmlPortfolio from '@/pages/supervision/aml/AmlPortfolio';

function renderReport() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AmlPortfolioReport /></MemoryRouter>
    </QueryClientProvider>,
  );
}

// jsdom lacks the pointer-capture APIs the Radix select primitive calls.
beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture = () => false;
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  proto.scrollIntoView = () => {};
  cleanup();
  mode = 'full';
  calls.length = 0;
  exportCalls.length = 0;
});

describe('AML-10 portfolio reporting — server-authoritative reading', () => {
  it('UI-PORT-01 reads the governed portfolio read model', async () => {
    renderReport();
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_portfolio_report')).toBe(true));
  });

  it('UI-PORT-02 prints the server visible-entity total, not a row count', async () => {
    renderReport();
    await waitFor(() => {
      expect(within(screen.getByTestId('port-card-visible')).getByText('9')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('port-card-reported')).getByText('3')).toBeInTheDocument();
  });

  it('UI-PORT-03 shows entities with and without a risk-of-record from the server', async () => {
    renderReport();
    await waitFor(() => {
      expect(within(screen.getByTestId('port-card-with-risk')).getByText('2')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('port-card-without-risk')).getByText('1')).toBeInTheDocument();
  });

  it('UI-PORT-04 reports each canonical provenance bucket separately', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-bucket-CALCULATED')).toBeInTheDocument());
    for (const b of ['CALCULATED', 'APPROVED_OVERRIDE', 'LEGACY', 'NOT_CALCULABLE', 'NO_RISK']) {
      expect(screen.getByTestId(`port-bucket-${b}`)).toBeInTheDocument();
    }
  });

  it('UI-PORT-05 never counts a legacy record as a calculated rating', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-bucket-LEGACY')).toBeInTheDocument());
    expect(within(screen.getByTestId('port-bucket-LEGACY')).getByText(/not a calculated rating/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('port-bucket-NOT_CALCULABLE')).getByText(/not a calculated rating/i)).toBeInTheDocument();
  });

  it('UI-PORT-06 states that no rating is inferred where there is no risk-of-record', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-bucket-NO_RISK')).toBeInTheDocument());
    expect(within(screen.getByTestId('port-bucket-NO_RISK')).getByText(/no rating or band is inferred/i)).toBeInTheDocument();
  });

  it('UI-PORT-07 prints the server risk distribution rows', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-dist-CALCULATED-HIGH')).toBeInTheDocument());
    expect(screen.getByTestId('port-dist-LEGACY-LOW')).toBeInTheDocument();
  });

  it('UI-PORT-08 prints every canonical review state count from the server summary', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-review-OVERDUE')).toBeInTheDocument());
    expect(within(screen.getByTestId('port-review-OVERDUE')).getByText('4')).toBeInTheDocument();
    for (const s of ['CURRENT', 'DUE', 'EVENT_TRIGGERED', 'UNSCHEDULED', 'BLOCKED', 'LEGACY']) {
      expect(screen.getByTestId(`port-review-${s}`)).toBeInTheDocument();
    }
  });

  it('UI-PORT-09 states that a due or overdue review is not a new risk rating', async () => {
    renderReport();
    await waitFor(() => expect(
      screen.getByText(/workflow condition, not a new risk rating/i),
    ).toBeInTheDocument());
  });

  it('UI-PORT-10 shows open supervisory exposure counts from the server', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-exposure-findings')).toBeInTheDocument());
    expect(within(screen.getByTestId('port-exposure-findings')).getByText('5')).toBeInTheDocument();
    expect(within(screen.getByTestId('port-exposure-examinations')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('port-exposure-interventions')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('port-exposure-enforcement')).getByText('1')).toBeInTheDocument();
  });

  it('UI-PORT-11 shows open consequence and reassessment linkage per entity', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId(`port-entity-${E1}`)).toBeInTheDocument());
    expect(screen.getByTestId(`port-reassessment-${E1}`)).toBeInTheDocument();
    expect(within(screen.getByTestId('port-card-consequence')).getByText('2')).toBeInTheDocument();
  });

  it('UI-PORT-12 reports movement direction from the server field only', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId(`port-movement-${MV}`)).toBeInTheDocument());
    expect(within(screen.getByTestId(`port-movement-${MV}`)).getByText('Risk increased')).toBeInTheDocument();
    expect(within(screen.getByTestId('port-trend-upward')).getByText('1')).toBeInTheDocument();
  });

  it('UI-PORT-13 states the immutable movement history as the trend source period', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-trends')).toBeInTheDocument());
    expect(within(screen.getByTestId('port-trends')).getByText(/immutable risk movement history/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('port-trends')).getByText(/2026-03-01/)).toBeInTheDocument();
  });

  it('UI-PORT-14 shows an explicit empty trend statement rather than inventing history', async () => {
    mode = 'no_movements';
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-trends-empty')).toBeInTheDocument());
  });

  it('UI-PORT-15 displays the server as-of date and generation time', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-as-of-label')).toHaveTextContent('2026-09-10'));
  });

  it('UI-PORT-16 discloses the entity risk age published by the server', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId(`port-entity-${E1}`)).toBeInTheDocument());
    expect(within(screen.getByTestId(`port-entity-${E1}`)).getByText(/161 days old/)).toBeInTheDocument();
  });

  it('UI-PORT-17 renders the server reason code where a rating is absent', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId(`port-entity-${E3}`)).toBeInTheDocument());
    expect(within(screen.getByTestId(`port-entity-${E3}`))
      .getByText(/No AML\/CFT risk-of-record exists/i)).toBeInTheDocument();
  });

  it('UI-PORT-18 shows a restricted matter as presence only', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId(`port-restricted-${E2}`)).toBeInTheDocument());
    expect(screen.getByTestId(`port-restricted-${E2}`)).toHaveTextContent(/Restricted matter withheld/i);
  });

  it('UI-PORT-19 sends every filter change to the server', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-summary')).toBeInTheDocument());
    calls.length = 0;
    await userEvent.click(screen.getByLabelText('Review status'));
    await userEvent.click(await screen.findByText('Review overdue'));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_portfolio_report'
        && c.args._payload.monitoring_state === 'OVERDUE'),
    ).toBe(true));
  });

  it('UI-PORT-20 sends the as-of date to the server rather than filtering locally', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-summary')).toBeInTheDocument());
    calls.length = 0;
    await userEvent.type(screen.getByLabelText('As-of date'), '2026-06-30');
    await waitFor(() => expect(
      calls.some((c) => c.args?._payload?.as_of === '2026-06-30'),
    ).toBe(true));
  });

  it('UI-PORT-21 exports the server payload with server provenance', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-summary')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('port-export'));
    await waitFor(() => expect(exportCalls.length).toBe(1));
    expect(calls.some((c) => c.fn === 'supervisory_portfolio_export')).toBe(true);
    expect(exportCalls[0].rows).toHaveLength(3);
    expect(exportCalls[0].provenance.rowCount).toBe(3);
    expect(exportCalls[0].provenance.generatedBy).toBe('supervisor@fsra.example');
    expect(exportCalls[0].provenance.asOfPeriod).toBe('2026-09-10');
  });

  it('UI-PORT-22 surfaces a refused export with the server reason', async () => {
    mode = 'export_refused';
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-summary')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('port-export'));
    await waitFor(() => expect(screen.getByTestId('port-export-error')).toHaveTextContent(/not authorised/i));
    expect(exportCalls.length).toBe(0);
  });

  it('UI-PORT-23 surfaces a refused report without inventing a portfolio', async () => {
    mode = 'refused';
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-error')).toHaveTextContent(/not authorised/i));
    expect(screen.queryByTestId('port-summary')).not.toBeInTheDocument();
  });

  it('UI-PORT-24 states an empty portfolio instead of showing zeros as findings', async () => {
    mode = 'empty';
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-entities-empty')).toBeInTheDocument());
    expect(screen.getByTestId('port-distribution-empty')).toBeInTheDocument();
  });

  it('UI-PORT-25 discloses server truncation of the row set', async () => {
    mode = 'truncated';
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-truncated')).toBeInTheDocument());
  });

  it('UI-PORT-26 mounts the report on its own AML portfolio page', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><AmlPortfolio /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('AML/CFT portfolio risk report')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('aml-portfolio-report')).toBeInTheDocument());
  });

  it('UI-PORT-27 publishes the server notes verbatim', async () => {
    renderReport();
    await waitFor(() => expect(screen.getByTestId('port-notes')).toBeInTheDocument());
    expect(screen.getByTestId('port-notes')).toHaveTextContent(/reported separately/i);
  });
});
