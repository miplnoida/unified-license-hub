/**
 * OS-02G1 — Portfolio, Thematic & Systemic Supervisory Intelligence.
 *
 * Pure read layer. Every number comes from the governed `supervisory_portfolio_*`
 * read models, which are scoped server-side by the certified supervisory scope
 * contract. The client never aggregates supervisory truth, never derives a risk
 * rating and never writes: governed action stays in the canonical spine.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface PortfolioOverview {
  generated_at: string;
  domain: string | null;
  window: { days: number; from: string; to: string };
  population: {
    definition: string;
    source_objects: string[];
    authorised_entities: number;
    authorised_entity_domains: number;
    entities_in_groups: number;
  };
  conditions: {
    material_open_conditions: number;
    affected_entities: number;
    unreviewed_material_conditions: number;
    unreviewed_material_entities: number;
    material_open_occurrences: number;
    recurring_conditions: number;
    recurrence_after_response: number;
    resolved_conditions: number;
    observed_in_window: number;
  };
  responses: {
    open_actions: number;
    overdue_responses: number;
    material_open_without_action: number;
  };
  themes: {
    themes_present: number;
    themes_across_multiple_entities: number;
    themes_across_multiple_groups: number;
    recurring_themes: number;
  };
  cross_domain: { entities_with_multiple_affected_domains: number; note: string };
  count_definitions: Record<string, string>;
  provenance: Record<string, string>;
}

export interface PortfolioTheme {
  theme_key: string;
  theme_kind: string;
  theme_label: string;
  theme_family: string | null;
  theme_source_object: string | null;
  domain_code: string;
  condition_count: number;
  open_condition_count: number;
  material_open_count: number;
  affected_entity_count: number;
  material_entity_count: number;
  affected_group_count: number;
  affected_sector_count: number;
  occurrence_count: number;
  reviewed_count: number;
  unreviewed_count: number;
  unreviewed_material_count: number;
  no_action_required_count: number;
  recurrence_count: number;
  resolved_count: number;
  reobserved_after_review_count: number;
  reobserved_after_response_count: number;
  persists_after_response_count: number;
  open_action_count: number;
  overdue_response_count: number;
  material_without_action_count: number;
  weak_traceability_count: number;
  unowned_count: number;
  severity_distribution: Record<string, number>;
  first_observed: string | null;
  last_observed: string | null;
  current_window_entities: number;
  comparison_window_entities: number;
  current_window_occurrences: number;
  comparison_window_occurrences: number;
  detection_assessable: boolean;
  trend_direction: string;
  response_effectiveness_indicators: string[];
  provenance: Record<string, unknown>;
}

export interface PortfolioThemeRegister {
  generated_at: string;
  domain: string | null;
  window: { days: number; current_from: string; comparison_from: string; to: string };
  theme_identity: Record<string, string>;
  themes: PortfolioTheme[];
}

export interface PortfolioChangeRow {
  theme_key: string;
  theme_label: string;
  domain_code: string;
  change_state: string;
  current_window_entities: number;
  comparison_window_entities: number;
  current_window_occurrences: number;
  comparison_window_occurrences: number;
  new_conditions_in_window: number;
  resolved_conditions_in_window: number;
  material_open: number;
  high_severity_open: number;
  overdue_responses: number;
  detection_assessable: boolean;
}

export interface PortfolioChangeLens {
  generated_at: string;
  window: { current_from: string; to: string; comparison_from: string };
  method: string;
  guard: string;
  summary: Record<string, number> | null;
  rows: PortfolioChangeRow[];
}

export interface PortfolioGroup {
  group_id: string;
  group_code: string | null;
  group_name: string;
  holding_entity_id: string | null;
  status: string | null;
  canonical_member_count: number;
  visible_member_count: number;
  members_with_material_open: number;
  material_open_conditions: number;
  affected_domains: number;
  overdue_responses: number;
  unreviewed_material: number;
  shared_themes: Array<{ theme_key: string; theme_label: string; domain_code: string; member_count: number; condition_count: number }>;
  visible_members: Array<{ entity_id: string; entity_name: string }>;
}

export interface PortfolioGroupIntelligence {
  generated_at: string;
  model: string;
  groups: PortfolioGroup[];
  provenance: Record<string, string>;
}

export interface PortfolioCrossDomainEntity {
  entity_id: string;
  entity_name: string;
  affected_domain_count: number;
  domains: string[];
  material_open_conditions: number;
  theme_count: number;
  group_id: string | null;
  approved_risk_state: Array<{ domain_code: string; residual_rating: string | null; effective_from: string | null }>;
  href: string;
}

export interface PortfolioCrossDomain {
  generated_at: string;
  statement: string;
  entities: PortfolioCrossDomainEntity[];
}

export interface PortfolioThemeDetail {
  generated_at: string;
  theme_key: string;
  theme_label: string | null;
  headline: {
    condition_count: number;
    material_open_count: number;
    affected_entity_count: number;
    occurrence_count: number;
  };
  entity_ids: string[];
  signal_ids: string[];
  action_ids: string[];
  conditions: Array<{
    signal_id: string;
    entity_id: string;
    entity_name: string | null;
    domain_code: string;
    severity: string | null;
    is_material: boolean;
    condition_state: string;
    first_observed: string | null;
    last_observed: string | null;
    occurrence_count: number;
    occurrence_days: number;
    is_reviewed: boolean;
    reviewed_at: string | null;
    disposition: string | null;
    action_type: string | null;
    action_record_id: string | null;
    action_reference: string | null;
    action_status: string | null;
    action_is_open: boolean | null;
    response_overdue: boolean;
    assurance_conditions: string[];
    group_id: string | null;
    group_name: string | null;
    entity_residual_rating: string | null;
    source: { table: string | null; id: string | null; reference: string | null };
  }>;
}

export interface PortfolioPeerView {
  generated_at: string;
  engine: string;
  minimum_peers: number;
  period_end: string;
  ratio_key: string;
  sector_id: string | null;
  entity_id: string | null;
  snapshot: Record<string, unknown>;
  state: 'OK' | 'INSUFFICIENT_PEER_DATA';
  note: string;
}

export function usePortfolioOverview(domain: string | null, days: number) {
  return useQuery({
    queryKey: ['supervisory_portfolio_overview', domain, days],
    queryFn: () => rpc<PortfolioOverview>('supervisory_portfolio_intelligence_overview', { _domain: domain, _days: days }),
    staleTime: 60_000,
  });
}

export function usePortfolioThemes(domain: string | null, days: number, limit = 100) {
  return useQuery({
    queryKey: ['supervisory_portfolio_themes', domain, days, limit],
    queryFn: () => rpc<PortfolioThemeRegister>('supervisory_portfolio_theme_register', { _domain: domain, _days: days, _limit: limit }),
    staleTime: 60_000,
  });
}

export function usePortfolioChangeLens(domain: string | null, days: number) {
  return useQuery({
    queryKey: ['supervisory_portfolio_change_lens', domain, days],
    queryFn: () => rpc<PortfolioChangeLens>('supervisory_portfolio_change_lens', { _domain: domain, _days: days }),
    staleTime: 60_000,
  });
}

export function usePortfolioGroups(domain: string | null) {
  return useQuery({
    queryKey: ['supervisory_portfolio_groups', domain],
    queryFn: () => rpc<PortfolioGroupIntelligence>('supervisory_portfolio_group_intelligence', { _domain: domain }),
    staleTime: 60_000,
  });
}

export function usePortfolioCrossDomain(limit = 100) {
  return useQuery({
    queryKey: ['supervisory_portfolio_cross_domain', limit],
    queryFn: () => rpc<PortfolioCrossDomain>('supervisory_portfolio_cross_domain', { _limit: limit }),
    staleTime: 60_000,
  });
}

export function usePortfolioThemeDetail(themeKey: string | null, domain: string | null) {
  return useQuery({
    queryKey: ['supervisory_portfolio_theme_detail', themeKey, domain],
    queryFn: () => rpc<PortfolioThemeDetail>('supervisory_portfolio_theme_detail', { _theme_key: themeKey, _domain: domain }),
    enabled: !!themeKey,
    staleTime: 60_000,
  });
}

export function formatPortfolioDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const CHANGE_STATE_LABELS: Record<string, string> = {
  EMERGED: 'Newly emerged',
  WORSENING: 'Worsening',
  PERSISTENT: 'Persistent',
  IMPROVING: 'Improving / resolved',
  NOT_ASSESSABLE: 'Not assessable (detector did not complete)',
  NOT_OBSERVED_IN_WINDOW: 'Not observed in window',
};

export const EFFECTIVENESS_LABELS: Record<string, string> = {
  CONDITION_REOBSERVED_AFTER_RESPONSE: 'Condition re-observed after response',
  CONDITION_PERSISTS_AFTER_RESPONSE: 'Condition persists after response closed',
  RESPONSE_OVERDUE: 'Response overdue',
  MATERIAL_CONDITION_WITHOUT_RESPONSE: 'Material condition without response',
  REOBSERVED_AFTER_REVIEW: 'Re-observed after supervisory review',
};
