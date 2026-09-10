/**
 * AML-10 — server-authoritative AML/CFT portfolio risk and management reporting.
 *
 * The browser is a reader. The server decides, and this file never re-decides:
 *   • which entities are visible (regulator, domain, supervisory perimeter),
 *   • the current risk-of-record and its provenance bucket,
 *   • every summary total, distribution and bucket count,
 *   • the review/monitoring state and next review date (AML-09),
 *   • open reassessment and open supervisory-consequence counts (AML-08),
 *   • movement direction and the trend period,
 *   • filter results, and the values that are exported.
 *
 * There is deliberately no aggregation, banding, threshold, ordering rule or
 * risk classification in TypeScript. The only local vocabulary is display
 * labelling for canonical server codes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { exportToCsv, sanitizeFilename } from '@/pages/reports/services/exportService';

const PORTFOLIO_KEY = ['aml-portfolio-report'] as const;

/* ------------------------------------------------------------------ labels -- */

export const PROVENANCE_BUCKET_LABEL: Record<string, string> = {
  CALCULATED: 'Calculated rating',
  APPROVED_OVERRIDE: 'Approved override',
  LEGACY: 'Legacy risk record',
  NOT_CALCULABLE: 'Not calculated',
  NO_RISK: 'No risk-of-record',
};

export const PROVENANCE_BUCKET_DETAIL: Record<string, string> = {
  CALCULATED: 'Published from an approved calculation outcome.',
  APPROVED_OVERRIDE: 'Published from an approved supervisory override of the calculated outcome.',
  LEGACY: 'Predates governed publication. This is not a calculated rating.',
  NOT_CALCULABLE: 'No approved calculation outcome is available. This is not a calculated rating.',
  NO_RISK: 'No AML/CFT risk-of-record exists. No rating or band is inferred.',
};

export const PORTFOLIO_REVIEW_LABEL: Record<string, string> = {
  CURRENT: 'Review current',
  DUE: 'Review due',
  OVERDUE: 'Review overdue',
  EVENT_TRIGGERED: 'Event requires consideration',
  UNSCHEDULED: 'No review scheduled',
  BLOCKED: 'Cannot be scheduled',
  LEGACY: 'Legacy risk record',
};

export const MOVEMENT_DIRECTION_LABEL: Record<string, string> = {
  UPWARD: 'Risk increased',
  DOWNWARD: 'Risk decreased',
  UNCHANGED: 'Unchanged',
  UNCLASSIFIED: 'Direction not recorded',
};

export const PORTFOLIO_REASON_LABEL: Record<string, string> = {
  NO_RISK_OF_RECORD: 'No AML/CFT risk-of-record exists',
  LEGACY_RISK_RECORD: 'The risk-of-record predates governed publication',
  NOT_CALCULABLE: 'No approved calculation policy is in force',
  NO_RUN: 'No calculation run has been recorded',
  UNAVAILABLE: 'No calculation outcome is available',
  RESTRICTED_SOURCE_WITHHELD: 'A restricted supervisory matter is withheld',
};

export function portfolioErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'The server refused the request.');
  if (/not_authorized/.test(raw)) return `You are not authorised for this report: ${raw}`;
  if (/invalid_period/.test(raw)) return 'The reporting period is invalid: the start date is after the end date.';
  return raw;
}

/* ------------------------------------------------------------------- types -- */

export interface PortfolioFilters {
  domain_code?: string;
  as_of?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  regulator_id?: string | null;
  sector_id?: string | null;
  risk_code?: string | null;
  provenance?: string | null;
  monitoring_state?: string | null;
  assessment_status?: string | null;
  programme_id?: string | null;
  consequence_action_type?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  review_from?: string | null;
  review_to?: string | null;
  limit?: number | null;
}

export interface PortfolioSummary {
  as_of: string;
  domain_code: string;
  regulator_id: string | null;
  visible_entity_total: number;
  entity_total: number;
  entities_with_current_risk: number;
  entities_without_risk: number;
  calculated_risk_total: number;
  approved_override_total: number;
  legacy_risk_total: number;
  not_calculable_total: number;
  no_risk_total: number;
  review_current_total: number;
  review_due_total: number;
  review_overdue_total: number;
  review_event_triggered_total: number;
  review_unscheduled_total: number;
  review_blocked_total: number;
  review_legacy_total: number;
  entities_with_open_reassessment: number;
  entities_with_open_consequence: number;
  open_findings_total: number;
  open_examinations_total: number;
  open_interventions_total: number;
  open_enforcement_total: number;
}

export interface PortfolioDistributionRow {
  risk_code: string;
  provenance_bucket: string;
  entities: number;
}

export interface PortfolioReviewDistributionRow {
  monitoring_state: string;
  entities: number;
}

export interface PortfolioMovement {
  movement_id: string;
  entity_id: string;
  entity_name: string | null;
  previous_rating: string | null;
  new_rating: string | null;
  trend: string | null;
  direction: string;
  reason: string | null;
  trigger_kind: string | null;
  previous_assessment_id: string | null;
  new_assessment_id: string | null;
  legacy_movement: boolean;
  source_publication_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  occurred_on: string | null;
  lineage: Record<string, unknown>;
}

export interface PortfolioTrends {
  period_from: string;
  period_to: string;
  source: string;
  opening: Record<string, number>;
  closing: Record<string, number>;
  upward_movements: number;
  downward_movements: number;
  unchanged_movements: number;
  unclassified_movements: number;
  movements: PortfolioMovement[];
}

export interface PortfolioEntityRow {
  entity_id: string;
  entity_name: string | null;
  entity_status: string | null;
  regulator_id: string | null;
  sector_id: string | null;
  domain_code: string;
  current_risk: string | null;
  inherent_rating: string | null;
  control_rating: string | null;
  provenance_bucket: string;
  rating_provenance: string | null;
  calculation_availability: string | null;
  effective_from: string | null;
  risk_age_days: number | null;
  source_kind: string | null;
  publication_id: string | null;
  assessment_id: string | null;
  assessment_reference: string | null;
  assessment_status: string | null;
  assessment_programme_id: string | null;
  assessment_programme_code: string | null;
  monitoring_state: string;
  monitoring_reason_code: string | null;
  next_review_date: string | null;
  due_date_basis: string | null;
  open_reassessment_id: string | null;
  open_consequence_count: number;
  open_findings: number;
  open_examinations: number;
  open_interventions: number;
  open_enforcement: number;
  restricted_matter_present: boolean;
  reason_codes: Array<{ field: string; code: string; detail: string }>;
  routes: { entity: string; assessment: string | null; findings: string; examinations: string };
}

/** AML-11 factual outcome counts. Every value is computed by the server. */
export interface PortfolioOutcomeSummary {
  source: string;
  linked_actions_total: number;
  completed_actions_total: number;
  open_actions_total: number;
  cancelled_actions_total: number;
  evaluations_pending_total: number;
  evaluations_awaiting_review_total: number;
  effective_total: number;
  partially_effective_total: number;
  ineffective_total: number;
  inconclusive_total: number;
  not_assessed_total: number;
  unevaluated_actions_total: number;
  legacy_lineage_actions_total: number;
  evaluated_total: number;
  note: string;
}

export interface PortfolioReport {
  generated_at: string;
  as_of: string;
  domain_code: string;
  source: string;
  filters: Record<string, unknown>;
  summary: PortfolioSummary;
  risk_distribution: PortfolioDistributionRow[];
  review_distribution: PortfolioReviewDistributionRow[];
  trends: PortfolioTrends;
  outcome_summary: PortfolioOutcomeSummary;
  entities: PortfolioEntityRow[];
  row_count: number;
  truncated: boolean;
  notes: string[];
}

export interface PortfolioExport extends PortfolioReport {
  report_title: string;
  regulator_id: string | null;
  generated_by: string;
  generated_by_id: string;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* -------------------------------------------------------------- read model -- */

export function useAmlPortfolioReport(filters: PortfolioFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [...PORTFOLIO_KEY, filters],
    enabled,
    queryFn: () => rpc<PortfolioReport>('supervisory_portfolio_report', { _payload: filters }),
  });
}

/* ------------------------------------------------------------------ export -- */

/**
 * The export is generated by the server from the same read model as the screen,
 * so the exported totals cannot diverge from the displayed totals. The browser
 * only writes the returned values to a file.
 */
export function useAmlPortfolioExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filters: PortfolioFilters = {}) => {
      const report = await rpc<PortfolioExport>('supervisory_portfolio_export', { _payload: filters });
      const provenance = {
        reportName: report.report_title,
        category: 'AML/CFT supervision',
        source: report.source ?? 'SERVER_READ_MODEL',
        asOfPeriod: String(report.as_of ?? ''),
        entity: 'Portfolio',
        regulator: String(report.regulator_id ?? 'All within scope'),
        filters: Object.entries(report.filters ?? {}).map(
          ([k, v]) => [k, String(v)] as [string, string],
        ),
        generatedBy: report.generated_by,
        generatedAt: report.generated_at,
        rowCount: Number(report.row_count ?? 0),
      };
      exportToCsv(
        report.entities as unknown as Record<string, unknown>[],
        sanitizeFilename(`aml-portfolio-${report.as_of}`),
        undefined,
        provenance,
      );
      return report;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}
