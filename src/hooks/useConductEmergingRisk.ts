/**
 * MC-09 — Cross-entity supervisory intelligence and the emerging conduct risk
 * register.
 *
 * The browser reads the register and asks the server for deterministic fact
 * packs. Every change of state — creating a risk, moving it through its
 * lifecycle, linking a record, recording an assessment or a follow-up — goes
 * through a governed operation that derives the acting officer server-side,
 * enforces supervisory scope and writes the audit trail. Nothing is decided,
 * rated or escalated in the client.
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

/* ---------------------------------------------------------------- fact packs */

export interface IntelFactItem {
  reference?: string | null;
  title?: string | null;
  status?: string | null;
  severity?: string | null;
  recorded_at?: string | null;
  licensee_name?: string | null;
  licensee_id?: string | null;
  complaint_count?: number | null;
  measure?: string | null;
  measured_value?: number | null;
  threshold?: number | null;
  entities_involved?: number | null;
  href?: string | null;
}

export interface ThemeSnapshot {
  generated_at: string;
  theme: string;
  window: { from: string; to: string; days: number };
  comparison_window: { from: string; to: string };
  scope: { sector_id: string | null; regulator_id: string | null };
  totals: { complaints: number; entities: number; signals: number; patterns: number };
  movement: {
    complaints_current: number;
    complaints_previous: number;
    complaints_change: number;
    entities_current: number;
    entities_previous: number;
    direction: 'increase' | 'decrease' | 'unchanged';
    method: string;
  };
  entities: { items: IntelFactItem[] };
  complaints: { items: IntelFactItem[] };
  signals: { items: IntelFactItem[] };
  patterns: { items: IntelFactItem[] };
  method: string;
  provenance: { source: string; content_class: string; ai_content: boolean };
}

export interface CrossEntityComparison {
  generated_at: string;
  window: { from: string; to: string; days: number };
  scope: { sector_id: string | null; regulator_id: string | null };
  sector_measures: {
    population: number;
    median_complaints: number;
    upper_quartile_complaints: number;
    highest_complaints: number;
  };
  entities: Array<{
    licensee_id: string;
    reference: string;
    complaints: number;
    signals: number;
    patterns: number;
    above_sector_median: boolean;
    above_upper_quartile: boolean;
    comparison_note: string;
    href: string;
  }>;
  method: string;
  provenance: { source: string; content_class: string; ai_content: boolean };
}

/** Themes available to choose from, taken from the recorded complaint categories. */
export function useConductThemes() {
  return useQuery({
    queryKey: ['conduct-intel-themes'],
    staleTime: 300_000,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb.from('complaint_types').select('name').order('name');
      if (error) throw new Error((error as { message: string }).message);
      const names = ((data ?? []) as Array<{ name: string | null }>)
        .map((r) => (r.name ?? '').trim())
        .filter(Boolean);
      return [...new Set(names)];
    },
  });
}

export function useThemeSnapshot(theme: string | null, sectorId: string | null, windowDays: number) {
  return useQuery({
    queryKey: ['conduct-intel-theme-snapshot', theme, sectorId, windowDays],
    enabled: Boolean(theme && theme.trim()),
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<ThemeSnapshot>('conduct_intel_theme_snapshot', {
      _theme: theme,
      _sector_id: sectorId,
      _window_days: windowDays,
      _regulator_id: null,
    }),
  });
}

export function useCrossEntityComparison(sectorId: string | null, windowDays: number, enabled = true) {
  return useQuery({
    queryKey: ['conduct-cross-entity-compare', sectorId, windowDays],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<CrossEntityComparison>('conduct_cross_entity_compare', {
      _sector_id: sectorId,
      _window_days: windowDays,
      _regulator_id: null,
    }),
  });
}

/* ------------------------------------------------------------------ register */

export type EmergingRiskStatus =
  'IDENTIFIED' | 'ASSESSING' | 'CONFIRMED' | 'MONITORING' | 'DISMISSED' | 'CLOSED';

export interface EmergingRisk {
  id: string;
  reference: string;
  regulator_id: string | null;
  sector_id: string | null;
  title: string;
  summary: string | null;
  thematic_scope: string;
  status: EmergingRiskStatus;
  severity: 'low' | 'medium' | 'high' | 'critical';
  systemic_potential: 'unassessed' | 'low' | 'moderate' | 'high';
  confidence: 'indicative' | 'probable' | 'established';
  entity_count: number;
  driver_metrics: Record<string, unknown>;
  fact_basis: Record<string, unknown>;
  window_start: string | null;
  window_end: string | null;
  basis: string;
  owner_id: string | null;
  closed_at: string | null;
  closure_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmergingRiskRecord {
  id: string;
  risk_id: string;
  record_type: 'signal' | 'complaint' | 'cluster' | 'conduct_alert' | 'complaint_outcome';
  record_id: string;
  record_reference: string | null;
  licensee_id: string | null;
  note: string | null;
  linked_at: string;
}

export interface EmergingRiskEvent {
  id: string;
  risk_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  rationale: string | null;
  metadata: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

export interface EmergingRiskAssessment {
  id: string;
  risk_id: string;
  version: number;
  severity: string;
  systemic_potential: string;
  confidence: string;
  judgement: string;
  actions_considered: string | null;
  next_review_date: string | null;
  fact_fingerprint: string | null;
  assessed_by: string | null;
  created_at: string;
}

const RISK_COLUMNS =
  'id,reference,regulator_id,sector_id,title,summary,thematic_scope,status,severity,' +
  'systemic_potential,confidence,entity_count,driver_metrics,fact_basis,window_start,window_end,' +
  'basis,owner_id,closed_at,closure_note,created_at,updated_at';

export function useEmergingRisks() {
  return useQuery({
    queryKey: ['conduct-emerging-risks'],
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<EmergingRisk[]> => {
      const { data, error } = await sb
        .from('conduct_emerging_risks')
        .select(RISK_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as EmergingRisk[];
    },
  });
}

export function useEmergingRisk(riskId: string | undefined) {
  return useQuery({
    queryKey: ['conduct-emerging-risk', riskId],
    enabled: Boolean(riskId),
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const [risk, records, events, assessments] = await Promise.all([
        sb.from('conduct_emerging_risks').select(RISK_COLUMNS).eq('id', riskId).maybeSingle(),
        sb.from('conduct_emerging_risk_records')
          .select('id,risk_id,record_type,record_id,record_reference,licensee_id,note,linked_at')
          .eq('risk_id', riskId).order('linked_at', { ascending: false }),
        sb.from('conduct_emerging_risk_events')
          .select('id,risk_id,event_type,from_status,to_status,rationale,metadata,actor_id,created_at')
          .eq('risk_id', riskId).order('created_at', { ascending: false }),
        sb.from('conduct_emerging_risk_assessments')
          .select('id,risk_id,version,severity,systemic_potential,confidence,judgement,' +
            'actions_considered,next_review_date,fact_fingerprint,assessed_by,created_at')
          .eq('risk_id', riskId).order('version', { ascending: false }),
      ]);
      if (risk.error) throw new Error(risk.error.message);
      return {
        risk: (risk.data ?? null) as EmergingRisk | null,
        records: ((records.data ?? []) as EmergingRiskRecord[]),
        events: ((events.data ?? []) as EmergingRiskEvent[]),
        assessments: ((assessments.data ?? []) as EmergingRiskAssessment[]),
      };
    },
  });
}

/* ------------------------------------------------------- governed operations */

function invalidate(qc: ReturnType<typeof useQueryClient>, riskId?: string) {
  void qc.invalidateQueries({ queryKey: ['conduct-emerging-risks'] });
  if (riskId) void qc.invalidateQueries({ queryKey: ['conduct-emerging-risk', riskId] });
}

export interface CreateRiskInput {
  title: string;
  basis: string;
  summary?: string;
  sector_id?: string | null;
  severity?: string;
  systemic_potential?: string;
  confidence?: string;
  window_start?: string | null;
  window_end?: string | null;
  entity_count?: number;
  driver_metrics?: Record<string, unknown>;
  fact_basis?: Record<string, unknown>;
}

export function useCreateEmergingRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRiskInput) =>
      rpc<{ id: string; reference: string }>('conduct_emerging_risk_create', { _payload: input }),
    onSuccess: () => invalidate(qc),
  });
}

export function useTransitionEmergingRisk(riskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, rationale }: { status: EmergingRiskStatus; rationale: string }) =>
      rpc('conduct_emerging_risk_transition', {
        _risk_id: riskId, _to_status: status, _rationale: rationale,
      }),
    onSuccess: () => invalidate(qc, riskId),
  });
}

export function useLinkEmergingRiskRecord(riskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { recordType: EmergingRiskRecord['record_type']; recordId: string; reference?: string; note?: string }) =>
      rpc<{ already_linked?: boolean }>('conduct_emerging_risk_link_record', {
        _risk_id: riskId,
        _record_type: input.recordType,
        _record_id: input.recordId,
        _record_reference: input.reference ?? null,
        _note: input.note ?? null,
      }),
    onSuccess: () => invalidate(qc, riskId),
  });
}

export interface AssessRiskInput {
  judgement: string;
  severity?: string;
  systemic_potential?: string;
  confidence?: string;
  actions_considered?: string;
  next_review_date?: string | null;
  fact_fingerprint?: string | null;
}

export function useAssessEmergingRisk(riskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssessRiskInput) =>
      rpc<{ version: number }>('conduct_emerging_risk_assess', { _risk_id: riskId, _payload: input }),
    onSuccess: () => invalidate(qc, riskId),
  });
}

export type FollowUpKind =
  'signal_raised' | 'alert_raised' | 'investigation' | 'thematic_review'
  | 'correspondence' | 'entity_engagement' | 'other';

export function useRecordEmergingRiskFollowUp(riskId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, reference, note }: { kind: FollowUpKind; reference?: string; note: string }) =>
      rpc('conduct_emerging_risk_followup', {
        _risk_id: riskId, _kind: kind, _reference: reference ?? null, _note: note,
      }),
    onSuccess: () => invalidate(qc, riskId),
  });
}

/* ------------------------------------------------------------------- labels */

export const RISK_STATUS_LABEL: Record<EmergingRiskStatus, string> = {
  IDENTIFIED: 'Identified',
  ASSESSING: 'Under assessment',
  CONFIRMED: 'Confirmed',
  MONITORING: 'Under monitoring',
  DISMISSED: 'Dismissed',
  CLOSED: 'Closed',
};

/** Transitions the register permits from each state, in business language. */
export const RISK_NEXT_STATES: Record<EmergingRiskStatus, EmergingRiskStatus[]> = {
  IDENTIFIED: ['ASSESSING', 'DISMISSED'],
  ASSESSING: ['CONFIRMED', 'DISMISSED'],
  CONFIRMED: ['MONITORING', 'CLOSED'],
  MONITORING: ['CONFIRMED', 'CLOSED'],
  DISMISSED: [],
  CLOSED: [],
};

export const SEVERITY_LABEL: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};
export const SYSTEMIC_LABEL: Record<string, string> = {
  unassessed: 'Not yet assessed', low: 'Low', moderate: 'Moderate', high: 'High',
};
export const CONFIDENCE_LABEL: Record<string, string> = {
  indicative: 'Indicative', probable: 'Probable', established: 'Established',
};
export const RECORD_TYPE_LABEL: Record<EmergingRiskRecord['record_type'], string> = {
  signal: 'Conduct signal',
  complaint: 'Complaint',
  cluster: 'Detected pattern',
  conduct_alert: 'Conduct alert',
  complaint_outcome: 'Complaint outcome',
};
export const FOLLOW_UP_LABEL: Record<FollowUpKind, string> = {
  signal_raised: 'Conduct signal raised',
  alert_raised: 'Conduct alert raised',
  investigation: 'Investigation opened',
  thematic_review: 'Thematic review',
  correspondence: 'Correspondence issued',
  entity_engagement: 'Entity engagement',
  other: 'Other supervisory follow-up',
};
export const EVENT_TYPE_LABEL: Record<string, string> = {
  CREATE: 'Risk recorded',
  STATUS_CHANGE: 'Status changed',
  RECORD_LINKED: 'Record linked',
  ASSESSMENT_RECORDED: 'Assessment recorded',
  FOLLOW_UP_RECORDED: 'Follow-up recorded',
};

/** Turns a governed refusal into supervisor-facing language. */
export function riskErrorMessage(raw: string): string {
  const m = raw ?? '';
  if (/not_authorized|42501|permission/i.test(m)) {
    return 'You are not permitted to do this for the sector concerned.';
  }
  if (/emerging_risk_closed/.test(m)) return 'This risk has been concluded and can no longer be amended.';
  if (/transition_not_permitted/.test(m)) return 'That change of status is not permitted from the current state.';
  if (/no_state_change/.test(m)) return 'The risk is already in that state.';
  if (/unsupported_window/.test(m)) return 'The observation window must be between 1 and 1095 days.';
  if (/theme_required/.test(m)) return 'A conduct theme must be chosen.';
  if (/at least \d+ characters/.test(m)) return m.replace(/^.*?:\s*/, '');
  return 'This action could not be completed. Please review your entry and try again.';
}
