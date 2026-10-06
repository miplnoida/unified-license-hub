/**
 * PCOMP-R2D — supervisory SLA policy (runtime).
 *
 * The browser is a reader. The server decides, from the SLA policy pinned to
 * the assessment's immutable policy basis, when a recorded supervisory response
 * is due, whether its clock may be held and for which reasons, and whether the
 * work finished on time or late. Every deadline, hold, breach and escalation is
 * calculated and recorded by the platform SLA stage engine.
 *
 * There is deliberately NO deadline arithmetic, no working-day calculation, no
 * breach rule and no on-time judgement in TypeScript. The only local vocabulary
 * is display labelling for canonical codes the server returns.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const SLA_BASIS_LABEL: Record<string, string> = {
  EVALUATED: 'Governed by an SLA policy',
  NOT_GOVERNED: 'No SLA policy governs the timing of this response',
  UNAVAILABLE: 'The pinned SLA policy cannot be read',
};

export const SLA_REASON_LABEL: Record<string, string> = {
  NO_ASSESSMENT_SOURCE: 'There is no authoritative assessment source for this supervisory response.',
  NO_POLICY_BASIS: 'This assessment carries no policy basis, so no SLA policy applies to it.',
  SLA_POLICY_NOT_BOUND: 'The governing policy profile binds no SLA policy.',
  NO_MATCHING_SLA_RULE: 'The bound SLA policy states no deadline for this response at this risk rating.',
  PINNED_POLICY_MISSING: 'The exact SLA policy version recorded in the policy basis can no longer be read.',
};

export const SLA_CALENDAR_LABEL: Record<string, string> = {
  CALENDAR_DAYS: 'calendar days',
  BUSINESS_DAYS: 'business days',
};

export const SLA_OUTCOME_LABEL: Record<string, string> = {
  PENDING: 'Open',
  ON_TIME: 'Completed on time',
  LATE: 'Completed late',
  NOT_APPLICABLE: 'No longer applicable',
};

export const SLA_STATE_LABEL: Record<string, string> = {
  active: 'Running',
  paused: 'On hold',
  breached: 'Overdue',
  completed: 'Closed',
};

export interface SlaExpectation {
  action: string;
  label: string | null;
  status: string;
  governed: boolean;
  reason_code: string | null;
  reason: string | null;
  rule_code: string | null;
  stage: string | null;
  duration_days: number | null;
  calendar_mode: string | null;
  pause_permitted: boolean;
  pause_reasons: string[];
  warning_percentage: number | null;
  escalation_tier_profile: string | null;
  breach_severity: string | null;
  policy_note: string | null;
  policy: {
    component_id: string; code: string; component_version: string;
    name: string; origin: string; status: string; content_hash: string | null;
  } | null;
  policy_profile: { profile_id: string; code: string; version: string; origin: string } | null;
}

export interface SlaStageSnapshot {
  stage_instance_id: string;
  state: string;
  started_at: string | null;
  due_at: string | null;
  paused_at: string | null;
  pause_seconds: number | null;
  breached_at: string | null;
  completed_at: string | null;
  sla_hours: number | null;
  sla_source: string | null;
  first_breach_notified_at: string | null;
}

export interface SlaObligation {
  obligation_id: string;
  decision_id: string;
  action_type: string;
  stage_name: string | null;
  sla_policy_basis_status: string;
  sla_policy_reason_code: string | null;
  sla_policy_code: string | null;
  sla_policy_version: string | null;
  sla_policy_rule_code: string | null;
  sla_duration_days: number | null;
  sla_calendar_mode: string | null;
  calendar_resolution: string | null;
  pause_permitted: boolean;
  pause_reasons: string[];
  breach_severity: string | null;
  escalation_tier_profile: string | null;
  due_at: string | null;
  outcome: string;
  closed_at: string | null;
  recorded_at: string;
  stage: SlaStageSnapshot | null;
  escalations: Array<{ tier: number; dispatched_at: string; recipients: string | null }>;
}

export interface SlaPolicyView {
  entity_id: string;
  domain_code: string;
  assessment_id: string | null;
  source_rating: string | null;
  expectations: SlaExpectation[];
  obligations: SlaObligation[];
  timing_authority: string;
  engine: string;
  automation: string;
}

export function useSupervisoryResponseSla(
  entityId?: string,
  domainCode: string = 'AML_CFT',
  assessmentId?: string | null,
) {
  return useQuery({
    queryKey: ['aml-response-sla', entityId, domainCode, assessmentId ?? null],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db().rpc('supervisory_response_sla_view', {
        _entity_id: entityId,
        _domain_code: domainCode,
        _assessment_id: assessmentId ?? null,
      });
      if (error) throw new Error(error.message);
      return data as SlaPolicyView;
    },
  });
}

/** Holding or releasing a deadline is a server decision: the policy must permit it. */
export function useSupervisoryResponseSlaHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { obligationId: string; reason: string; rationale: string; resume?: boolean }) => {
      const { data, error } = await db().rpc('supervisory_response_sla_pause', {
        _obligation_id: input.obligationId,
        _reason: input.reason,
        _resume: input.resume ?? false,
        _rationale: input.rationale,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['aml-response-sla'] }); },
  });
}

/** The server decides ON_TIME or LATE from the recorded deadline. */
export function useSupervisoryResponseSlaComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { obligationId: string; reason: string }) => {
      const { data, error } = await db().rpc('supervisory_response_sla_complete', {
        _obligation_id: input.obligationId,
        _reason: input.reason,
      });
      if (error) throw new Error(error.message);
      return data as { obligation_id: string; outcome: string; due_at: string | null };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['aml-response-sla'] }); },
  });
}
