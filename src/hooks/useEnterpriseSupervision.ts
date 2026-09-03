import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * EPIC 4 / W5 — enterprise dashboard, portfolio and sector supervision.
 *
 * Three governed read models, one per question:
 *   - `enterprise_supervisory_overview` → the enterprise supervisory position
 *     (risk, concern, programme, findings, attention, work, payment systems).
 *   - `supervisory_portfolio`           → one row per entity, one block per domain.
 *   - `supervisory_sector_overview`     → perimeter-aware sector supervision.
 *
 * Every figure below is produced server-side from the canonical supervisory
 * spine and is returned with its source object. Nothing is counted, averaged or
 * re-derived in the browser, so a dashboard figure can never disagree with the
 * portfolio, the sector view or the case file it points at.
 */

export type SupervisoryDomainCode =
  | 'PRUDENTIAL' | 'AML_CFT' | 'MARKET_CONDUCT'
  | 'OPERATIONAL_RESILIENCE' | 'GOVERNANCE' | 'CROSS_DOMAIN';

export interface PortfolioNextAction {
  work_key: string;
  work_type: string;
  work_type_label: string;
  title: string | null;
  reference: string | null;
  priority: string | null;
  work_state: string | null;
  due_date: string | null;
  is_overdue: boolean;
  is_unassigned: boolean;
  owner_id: string | null;
  team_id: string | null;
  source_object: string | null;
  source_id: string | null;
  route: string;
  reason: string;
}

export interface PortfolioDomainBlock {
  domain_code: SupervisoryDomainCode;
  is_applicable: boolean;
  is_assessed: boolean;
  is_concern: boolean;
  residual_rating: string | null;
  inherent_rating: string | null;
  control_rating: string | null;
  previous_rating: string | null;
  trend: string | null;
  last_review_date: string | null;
  next_review_date: string | null;
  assessment_overdue: boolean;
  driving_assessment_id: string | null;
  open_findings: number;
  high_findings: number;
  critical_findings: number;
  overdue_remediation: number;
  validation_pending: number;
  open_attention: number;
  attention_priority: string | null;
  active_examination: { id: string; reference: string | null; title: string | null; stage: string | null; engagement_type: string | null; route: string } | null;
  current_plan: { id: string; reference: string | null; title: string | null; status: string | null; target_completion: string | null; route: string } | null;
  active_intervention: { id: string; reference: string | null; title: string | null; intervention_type: string | null; status: string | null; route: string } | null;
  reassessment_required: boolean;
  active_enforcement: number;
  open_work_items: number;
  overdue_work_items: number;
  lead_team_id: string | null;
  next_action: PortfolioNextAction | null;
}

export interface PortfolioRow {
  entity_id: string;
  entity_name: string;
  status: string | null;
  systemic_importance: string | null;
  sector_id: string | null;
  sector_name: string | null;
  sector_code: string | null;
  assigned_supervisor_id: string | null;
  lead_team_id: string | null;
  highest_residual_rating: string | null;
  concern_domains: SupervisoryDomainCode[];
  multi_domain_concern: boolean;
  applicable_domains: number;
  assessed_domains: number;
  open_findings: number;
  critical_findings: number;
  overdue_remediation: number;
  open_attention: number;
  active_enforcement: number;
  open_work_items: number;
  overdue_work_items: number;
  reassessment_required: boolean;
  assessment_overdue: boolean;
  restricted_matter_present: boolean;
  next_action: PortfolioNextAction | null;
  route: string;
  domains: PortfolioDomainBlock[];
}

export interface PortfolioSummary {
  entities: number;
  entities_of_concern: number;
  multi_domain_concern: number;
  unassessed_entities: number;
  assessment_overdue: number;
  reassessment_required: number;
  open_findings: number;
  critical_findings: number;
  overdue_remediation: number;
  open_attention: number;
  active_enforcement: number;
  open_work_items: number;
  overdue_work_items: number;
}

export interface PortfolioResult {
  generated_at: string;
  authorised_domains: SupervisoryDomainCode[];
  total: number;
  limit: number;
  offset: number;
  summary: PortfolioSummary;
  rows: PortfolioRow[];
  sources: Record<string, string>;
}

export interface PortfolioFilters {
  domain?: SupervisoryDomainCode | null;
  sectorId?: string | null;
  rating?: string | null;
  priority?: string | null;
  teamId?: string | null;
  concernOnly?: boolean;
  multiDomainOnly?: boolean;
  overdueRemediationOnly?: boolean;
  reassessmentDueOnly?: boolean;
  assessmentOverdueOnly?: boolean;
  unassessedOnly?: boolean;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export function useSupervisoryPortfolio(filters: PortfolioFilters = {}) {
  return useQuery({
    queryKey: ['supervisory-portfolio', filters],
    staleTime: 30_000,
    queryFn: async (): Promise<PortfolioResult> => {
      const { data, error } = await (supabase.rpc as any)('supervisory_portfolio', {
        _domain: filters.domain ?? null,
        _sector_id: filters.sectorId ?? null,
        _rating: filters.rating ?? null,
        _priority: filters.priority ?? null,
        _team_id: filters.teamId ?? null,
        _concern_only: filters.concernOnly ?? false,
        _multi_domain_only: filters.multiDomainOnly ?? false,
        _overdue_remediation_only: filters.overdueRemediationOnly ?? false,
        _reassessment_due_only: filters.reassessmentDueOnly ?? false,
        _assessment_overdue_only: filters.assessmentOverdueOnly ?? false,
        _unassessed_only: filters.unassessedOnly ?? false,
        _search: filters.search ?? null,
        _limit: filters.limit ?? 100,
        _offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return data as PortfolioResult;
    },
  });
}

export interface SectorRow {
  sector_id: string;
  sector_name: string | null;
  sector_code: string | null;
  domain_code: SupervisoryDomainCode;
  entities: number;
  in_perimeter: number;
  outside_perimeter: number;
  assessed: number;
  unassessed: number;
  assessment_overdue: number;
  rating_distribution: Record<string, number>;
  open_findings: number;
  critical_findings: number;
  overdue_remediation: number;
  open_attention: number;
  active_examinations: number;
  active_interventions: number;
  active_enforcement: number;
}

export interface SectorOverviewResult {
  generated_at: string;
  authorised_domains: SupervisoryDomainCode[];
  rows: SectorRow[];
  sources?: Record<string, string>;
}

export function useSupervisorySectorOverview(domain?: SupervisoryDomainCode | null) {
  return useQuery({
    queryKey: ['supervisory-sector-overview', domain ?? 'all'],
    staleTime: 30_000,
    queryFn: async (): Promise<SectorOverviewResult> => {
      const { data, error } = await (supabase.rpc as any)('supervisory_sector_overview', {
        _domain: domain ?? null,
      });
      if (error) throw error;
      return data as SectorOverviewResult;
    },
  });
}

export interface EnterpriseRiskDomain {
  domain_code: SupervisoryDomainCode;
  in_perimeter: number;
  outside_perimeter: number;
  assessed: number;
  unassessed: number;
  review_overdue: number;
  rating_distribution: Record<string, number>;
  movements_in_window: number;
  deteriorations_in_window: number;
}

export interface EnterpriseOverview {
  generated_at: string;
  available: boolean;
  authorised_domains: SupervisoryDomainCode[];
  filters?: { sector_id: string | null; window_days: number };
  window?: { days: number; since: string; until: string };
  risk: EnterpriseRiskDomain[];
  concern: {
    entities_in_scope: number;
    entities_of_concern: number;
    multi_domain_concern: number;
    concern_by_domain: Record<string, number>;
  };
  programme: Record<string, number | Record<string, number>>;
  findings: Record<string, number | Record<string, number>>;
  attention: Record<string, number | Record<string, number>>;
  work: {
    open: number; overdue: number; due_soon: number; unassigned: number;
    decision_points: number; by_work_type: Record<string, number>;
  };
  payment_systems: Record<string, number | boolean>;
  sources: Record<string, string>;
}

export function useEnterpriseSupervisoryOverview(sectorId?: string | null, windowDays = 30) {
  return useQuery({
    queryKey: ['enterprise-supervisory-overview', sectorId ?? 'all', windowDays],
    staleTime: 30_000,
    queryFn: async (): Promise<EnterpriseOverview> => {
      const { data, error } = await (supabase.rpc as any)('enterprise_supervisory_overview', {
        _sector_id: sectorId ?? null,
        _window_days: windowDays,
      });
      if (error) throw error;
      return data as EnterpriseOverview;
    },
  });
}

export const RATING_ORDER = ['CRITICAL', 'SEVERE', 'HIGH', 'MEDIUM_HIGH', 'MODERATE', 'MEDIUM', 'LOW', 'UNRATED'] as const;

export function ratingTone(rating?: string | null): 'danger' | 'warning' | 'default' | 'success' {
  switch ((rating ?? '').toUpperCase()) {
    case 'CRITICAL':
    case 'SEVERE':
      return 'danger';
    case 'HIGH':
    case 'MEDIUM_HIGH':
      return 'warning';
    case 'LOW':
      return 'success';
    default:
      return 'default';
  }
}
