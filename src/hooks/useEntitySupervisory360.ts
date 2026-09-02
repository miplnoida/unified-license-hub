import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * EPIC 4 / W3 — the enterprise Entity 360 supervisory state.
 *
 * Everything here is read from `entity_supervisory_360`, which reads only the
 * authoritative supervisory records. No rating is derived, averaged or
 * recomputed in the browser.
 */
export type Entity360DomainState = {
  domain_code: string;
  is_assessed: boolean;
  residual_rating: string | null;
  inherent_rating: string | null;
  control_rating: string | null;
  prior_rating: string | null;
  trend: string | null;
  last_review_date: string | null;
  next_review_date: string | null;
  assessment_overdue: boolean;
  driving_assessment: {
    id: string;
    reference: string | null;
    assessment_type: string | null;
    trigger_type: string | null;
    assessment_date: string | null;
    period_start: string | null;
    period_end: string | null;
    residual_rating: string | null;
    inherent_rating: string | null;
    control_rating: string | null;
    approved_at: string | null;
    summary: string | null;
    is_driving_risk_state: boolean;
    methodology: { code: string | null; version: string | null; name: string | null } | null;
    methodology_version: string | null;
    route: string;
  } | null;
  material_dimensions: Array<{
    code: string | null;
    group: string | null;
    inherent: string | null;
    control: string | null;
    residual: string | null;
    trend: string | null;
    rationale: string | null;
    overridden: boolean | null;
  }>;
  open_attention: Array<{
    id: string; reference: string | null; title: string | null; priority: string | null;
    status: string | null; target_review_date: string | null; route: string;
  }>;
  current_plan: { id: string; reference: string | null; title: string | null; status: string | null; target_completion: string | null; route: string } | null;
  active_intervention: { id: string; reference: string | null; title: string | null; intervention_type: string | null; status: string | null; route: string } | null;
  active_examination: { id: string; reference: string | null; title: string | null; engagement_type: string | null; stage: string | null; route: string } | null;
  open_findings: number;
  high_findings: number;
  critical_findings: number;
  findings: Array<{ id: string; reference: string | null; title: string | null; severity: string | null; status: string | null; due_date: string | null; route: string }>;
  overdue_remediation: number;
  overdue_remediation_items: Array<{ id: string; reference: string | null; status: string | null; target_date: string | null; route: string }>;
  validation_pending: number;
  ineffective_remediation: number;
  active_enforcement: Array<{ id: string; case_number: string | null; enforcement_type: string | null; stage: string | null; status: string | null; route: string }>;
  reassessment: Array<{
    id: string; trigger_kind: string | null; trigger_rationale: string | null;
    requested_type: string | null; status: string | null; due_date: string | null;
    fulfilled_assessment_id: string | null; fulfilled_at: string | null;
  }>;
  reassessment_required: boolean;
  lead_officer_id: string | null;
  lead_team_id: string | null;
  next_action: Entity360NextAction | null;
};

export type Entity360NextAction = {
  work_key: string;
  work_type: string;
  work_type_label: string;
  domain_code?: string | null;
  title: string | null;
  reference: string | null;
  priority: string | null;
  work_state: string | null;
  due_date: string | null;
  is_overdue: boolean;
  owner_id: string | null;
  team_id: string | null;
  is_unassigned?: boolean;
  source_object: string | null;
  source_id: string | null;
  route: string;
  reason: string;
};

export type Entity360State = {
  found: boolean;
  generated_at: string;
  entity: {
    entity_id: string;
    name: string | null;
    status: string | null;
    systemic_importance: string | null;
    sector: string | null;
    sub_sector: string | null;
    assigned_supervisor_id: string | null;
    licences: Array<{
      id: string; license_number: string | null; license_type: string | null;
      status: string | null; valid_from: string | null; valid_until: string | null;
      is_primary: boolean | null;
    }>;
    group_memberships: Array<{
      group_id: string; group_name: string | null; member_role: string | null;
      consolidation_treatment: string | null; ownership_percentage: number | null;
    }>;
  } | null;
  summary: {
    domains_assessed: number;
    domains_of_concern: string[];
    highest_material_risk: string | null;
    cross_domain_concern_present: boolean;
    open_findings: number;
    critical_findings: number;
    overdue_remediation: number;
    reassessment_required: boolean | null;
    active_enforcement: number;
    open_work_items: number;
    overdue_work_items: number;
    supervisory_priority: string | null;
    lead_team_id: string | null;
    restricted_matter_present: boolean;
  } | null;
  domains: Entity360DomainState[];
  next_action: Entity360NextAction | null;
};

export const DOMAIN_LABELS: Record<string, string> = {
  PRUDENTIAL: 'Prudential',
  AML_CFT: 'AML/CFT',
  MARKET_CONDUCT: 'Market conduct',
  OPERATIONAL_RESILIENCE: 'Operational resilience',
  GOVERNANCE: 'Governance',
  CROSS_DOMAIN: 'Cross-domain',
};

export function useEntitySupervisory360(entityId?: string | null) {
  return useQuery({
    queryKey: ['entity-supervisory-360', entityId],
    enabled: Boolean(entityId),
    queryFn: async (): Promise<Entity360State> => {
      const { data, error } = await supabase.rpc('entity_supervisory_360', {
        _entity_id: entityId,
      });
      if (error) throw error;
      const payload = (data ?? {}) as Partial<Entity360State>;
      return {
        found: payload.found ?? false,
        generated_at: payload.generated_at ?? new Date().toISOString(),
        entity: payload.entity ?? null,
        summary: payload.summary ?? null,
        domains: payload.domains ?? [],
        next_action: payload.next_action ?? null,
      };
    },
  });
}
