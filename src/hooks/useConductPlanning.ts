/**
 * MC-10 — Supervisory planning, prioritisation and intervention management.
 *
 * The browser reads registers and asks the server to compute a prioritisation
 * run. Every change of state — proposing an intervention, endorsing or
 * rejecting it, activating, completing or cancelling it — goes through a
 * governed operation that derives the acting officer server-side, enforces the
 * supervisory remit, keeps the proposer and the decider apart, and writes the
 * audit trail. Nothing is decided, ranked or escalated in the client.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ types */

export interface PriorityEntry {
  score_id: string;
  rank: number;
  licensee_id: string | null;
  licensee_name: string | null;
  sector_id: string | null;
  complaint_count: number;
  signal_count: number;
  pattern_count: number;
  emerging_risk_count: number;
  score: number;
  drivers: Record<string, { count: number; weight: number }>;
}

export interface PriorityRegister {
  run: {
    id: string;
    computed_at: string;
    window: { from: string; to: string; days: number };
    entity_count: number;
    method: string;
  } | null;
  scope?: { sectors_in_view: string[] | 'all' };
  entries: PriorityEntry[];
  method?: string;
}

export type InterventionStatus =
  | 'PROPOSED' | 'ENDORSED' | 'REJECTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type InterventionType =
  | 'SUPERVISORY_ENGAGEMENT' | 'INFORMATION_REQUEST' | 'ENHANCED_MONITORING'
  | 'THEMATIC_REVIEW' | 'ONSITE_EXAMINATION' | 'FORMAL_INVESTIGATION' | 'ENFORCEMENT_REFERRAL';

export interface InterventionRow {
  id: string;
  reference: string;
  sector_id: string | null;
  licensee_id: string | null;
  theme: string | null;
  emerging_risk_id: string | null;
  intervention_type: InterventionType;
  title: string;
  basis: string;
  expected_outcome: string | null;
  planned_start: string | null;
  planned_end: string | null;
  status: InterventionStatus;
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_rationale: string | null;
  activated_at: string | null;
  completed_at: string | null;
  outcome_note: string | null;
}

export interface InterventionEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  rationale: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface InterventionCase {
  intervention: InterventionRow;
  licensee_name: string | null;
  emerging_risk_reference: string | null;
  proposed_by_name: string | null;
  decided_by_name: string | null;
  owner_name: string | null;
  events: InterventionEvent[];
}

/* ------------------------------------------------------------------ labels */

export const INTERVENTION_TYPE_LABEL: Record<InterventionType, string> = {
  SUPERVISORY_ENGAGEMENT: 'Supervisory engagement',
  INFORMATION_REQUEST: 'Information request',
  ENHANCED_MONITORING: 'Enhanced monitoring',
  THEMATIC_REVIEW: 'Thematic review',
  ONSITE_EXAMINATION: 'Onsite examination',
  FORMAL_INVESTIGATION: 'Formal investigation',
  ENFORCEMENT_REFERRAL: 'Enforcement referral',
};

export const INTERVENTION_STATUS_LABEL: Record<InterventionStatus, string> = {
  PROPOSED: 'Awaiting decision',
  ENDORSED: 'Endorsed',
  REJECTED: 'Not approved',
  ACTIVE: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const DRIVER_LABEL: Record<string, string> = {
  complaints: 'Recorded complaints',
  signals: 'Conduct signals',
  patterns: 'Detected patterns',
  sector_emerging_risks: 'Confirmed sector risks',
};

/** Plain-language message for a refused or failed planning operation. */
export function planningErrorMessage(raw: string): string {
  const m = String(raw || '');
  if (/unknown_sector/i.test(m)) return 'That sector is not recognised.';
  if (/not_authorized|permission denied|row-level security/i.test(m)) {
    if (/cannot decide their own/i.test(m)) {
      return 'The officer who proposed an intervention cannot decide it. A second officer with approval authority must review it.';
    }
    if (/out of regulatory scope/i.test(m)) {
      return 'This record sits outside the sectors you are authorised to supervise.';
    }
    if (/market_conduct\.approve/i.test(m)) return 'Deciding an intervention requires approval authority.';
    return 'You do not have the authority for this action.';
  }
  if (/transition_not_permitted/i.test(m)) return 'That change is not permitted from the current state.';
  if (/rationale of at least/i.test(m)) return 'Please record a rationale of at least 10 characters.';
  if (/basis of at least/i.test(m)) return 'Please record a supervisory basis of at least 20 characters.';
  if (/must name an entity/i.test(m)) return 'Name an entity, a theme or an emerging risk for this intervention.';
  if (/unsupported_window/i.test(m)) return 'Choose an observation window between 1 and 1095 days.';
  return 'The action could not be completed. Nothing has been changed.';
}

/* ------------------------------------------------------------------ queries */

export function usePriorityRegister(runId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['conduct-priority-register', runId, limit],
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<PriorityRegister>('conduct_priority_register', {
      _run_id: runId, _limit: limit,
    }),
  });
}

export function usePriorityCompute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { windowDays: number; sectorId?: string | null }) =>
      rpc<{ run_id: string; entity_count: number }>('conduct_priority_compute', {
        _window_days: args.windowDays,
        _sector_id: args.sectorId ?? null,
        _regulator_id: null,
        _config_code: 'MC_DEFAULT',
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-priority-register'] }); },
  });
}

export function useInterventions() {
  return useQuery({
    queryKey: ['conduct-interventions'],
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<InterventionRow[]> => {
      const { data, error } = await sb.from('conduct_interventions')
        .select('*').order('proposed_at', { ascending: false });
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as InterventionRow[];
    },
  });
}

export function useInterventionCase(id: string | undefined) {
  return useQuery({
    queryKey: ['conduct-intervention-case', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: () => rpc<InterventionCase>('conduct_intervention_case', { _id: id }),
  });
}

/* ---------------------------------------------------------------- mutations */

export interface ProposeInput {
  interventionType: InterventionType;
  title: string;
  basis: string;
  licenseeId?: string | null;
  theme?: string | null;
  emergingRiskId?: string | null;
  priorityScoreId?: string | null;
  expectedOutcome?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
}

export function useProposeIntervention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProposeInput) =>
      rpc<{ id: string; reference: string }>('conduct_intervention_propose', {
        _intervention_type: input.interventionType,
        _title: input.title,
        _basis: input.basis,
        _licensee_id: input.licenseeId ?? null,
        _theme: input.theme ?? null,
        _emerging_risk_id: input.emergingRiskId ?? null,
        _priority_score_id: input.priorityScoreId ?? null,
        _expected_outcome: input.expectedOutcome ?? null,
        _planned_start: input.plannedStart ?? null,
        _planned_end: input.plannedEnd ?? null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-interventions'] }); },
  });
}

export function useDecideIntervention(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { decision: 'endorse' | 'reject'; rationale: string }) =>
      rpc('conduct_intervention_decide', {
        _id: id, _decision: args.decision, _rationale: args.rationale,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conduct-intervention-case', id] });
      qc.invalidateQueries({ queryKey: ['conduct-interventions'] });
    },
  });
}

export function useTransitionIntervention(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { toStatus: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'; rationale: string }) =>
      rpc('conduct_intervention_transition', {
        _id: id, _to_status: args.toStatus, _rationale: args.rationale,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conduct-intervention-case', id] });
      qc.invalidateQueries({ queryKey: ['conduct-interventions'] });
    },
  });
}
