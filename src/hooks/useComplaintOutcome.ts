/**
 * MC-04 — Outcome, redress, closure & QA and reconsideration read model.
 *
 * Every authoritative write goes through the governed MC-04 functions. Nothing
 * here re-derives closure readiness, whether a quality review is required, or
 * the case's lifecycle step: the server returns all of it and this hook only
 * passes it through. Reads are plain scoped reads; there is no direct table
 * insert, update or delete anywhere in this file.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

/* ------------------------------------------------------------------- types */

export interface OutcomeGate {
  ok: boolean;
  route?: string | null;
  route_label?: string | null;
  blockers: string[];
}

export interface OutcomeRecord {
  id: string;
  version: number;
  status: 'DRAFT' | 'SUBMITTED' | 'SUPERSEDED';
  overall_outcome: string | null;
  outcome_rationale: string | null;
  consumer_harm_summary: string | null;
  harm_level: string | null;
  redress_required: boolean;
  redress_rationale: string | null;
  communication_required: boolean;
  communication_basis: string | null;
  recommended_closure_route: string | null;
  reviewer_id: string | null;
  submitted_at: string | null;
  allegation_outcome_snapshot: unknown;
  row_version: number;
  created_at: string;
}

export interface OutcomeAllegationRow {
  allegation_id: string;
  allegation_number: number;
  title: string;
  jurisdiction_scope: string | null;
  assessment_outcome: string | null;
  assessment_rationale: string | null;
  assessed_at: string | null;
}

export interface OutcomeHistoryRow {
  version: number;
  status: string;
  overall_outcome: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface OutcomeWorkspace {
  gate: OutcomeGate;
  outcome: OutcomeRecord | null;
  allegations: OutcomeAllegationRow[];
  history: OutcomeHistoryRow[];
}

export interface RedressTypeRow {
  id: string;
  code: string;
  label: string;
  category: 'MONETARY' | 'NON_MONETARY';
  description: string | null;
  requires_amount: boolean;
  requires_due_date: boolean;
  requires_evidence: boolean;
  sort_order: number;
}

export interface RedressRow {
  id: string;
  complaint_id: string;
  allegation_id: string | null;
  affected_party_label: string;
  redress_type_id: string | null;
  amount: number | null;
  currency: string | null;
  action_required: string;
  responsible_entity: string | null;
  due_date: string | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'CANCELLED';
  is_required: boolean;
  rationale: string | null;
  completion_note: string | null;
  completion_evidence_file_id: string | null;
  completed_at: string | null;
  verified_at: string | null;
  verification_note: string | null;
  cancelled_reason: string | null;
  row_version: number;
  complaint_redress_types?: { label: string; category: string; requires_amount: boolean } | null;
}

export interface QaRequirement {
  qa_required: boolean;
  policy_label?: string | null;
  policy_basis?: string | null;
  reviewer_role?: string | null;
  checklist?: Array<string | { label?: string; item?: string }>;
  total_redress?: number | null;
  latest_decision?: string | null;
  latest_decided_at?: string | null;
  qa_passed?: boolean;
}

export interface ClosureReadiness {
  readiness: 'READY_FOR_CLOSURE' | 'NOT_READY' | 'CLOSED';
  blockers: string[];
  outcome_recorded?: boolean;
  qa: QaRequirement;
}

export interface ClosureReviewRow {
  id: string;
  stage: string | null;
  decision: string | null;
  rationale: string | null;
  qa_findings: string | null;
  qa_required: boolean | null;
  qa_policy_basis: string | null;
  resolution_summary: string | null;
  outcome_category: string | null;
  decided_at: string | null;
}

export interface ReconsiderationRow {
  id: string;
  reference: string | null;
  received_at: string;
  requester_type: string;
  requester_name: string;
  requester_contact: string | null;
  grounds: string;
  status: string;
  admissibility_decision: string | null;
  admissibility_rationale: string | null;
  admissibility_at: string | null;
  reviewer_id: string | null;
  reviewer_assigned_at: string | null;
  decision: string | null;
  decision_rationale: string | null;
  decided_at: string | null;
}

/* -------------------------------------------------------------- read model */

export function useComplaintOutcome(complaintId: string | undefined) {
  const qc = useQueryClient();

  const outcomeQ = useQuery({
    queryKey: ['mc04_outcome', complaintId],
    enabled: !!complaintId,
    queryFn: async (): Promise<OutcomeWorkspace> => {
      const { data, error } = await sb.rpc('complaint_outcome_get', { _complaint_id: complaintId });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        gate: { ok: !!d?.gate?.ok, route: d?.gate?.route ?? null, route_label: d?.gate?.route_label ?? null, blockers: d?.gate?.blockers ?? [] },
        outcome: d?.outcome ?? null,
        allegations: d?.allegations ?? [],
        history: d?.history ?? [],
      };
    },
  });

  const redressTypesQ = useQuery({
    queryKey: ['mc04_redress_types'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RedressTypeRow[]> => {
      const { data, error } = await sb
        .from('complaint_redress_types')
        .select('id, code, label, category, description, requires_amount, requires_due_date, requires_evidence, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as RedressTypeRow[];
    },
  });

  const redressQ = useQuery({
    queryKey: ['mc04_redress', complaintId],
    enabled: !!complaintId,
    queryFn: async (): Promise<RedressRow[]> => {
      const { data, error } = await sb
        .from('complaint_redress')
        .select('*, complaint_redress_types(label, category, requires_amount)')
        .eq('complaint_id', complaintId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as RedressRow[];
    },
  });

  const closureReadinessQ = useQuery({
    queryKey: ['mc04_closure_readiness', complaintId],
    enabled: !!complaintId,
    queryFn: async (): Promise<ClosureReadiness> => {
      const { data, error } = await sb.rpc('complaint_closure_readiness', { _complaint_id: complaintId });
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        readiness: d?.readiness ?? 'NOT_READY',
        blockers: d?.blockers ?? [],
        outcome_recorded: !!d?.outcome_recorded,
        qa: (d?.qa ?? { qa_required: false }) as QaRequirement,
      };
    },
  });

  const closureReviewsQ = useQuery({
    queryKey: ['mc04_closure_reviews', complaintId],
    enabled: !!complaintId,
    queryFn: async (): Promise<ClosureReviewRow[]> => {
      const { data, error } = await sb
        .from('complaint_closure_reviews')
        .select('id, stage, decision, rationale, qa_findings, qa_required, qa_policy_basis, resolution_summary, outcome_category, decided_at')
        .eq('complaint_id', complaintId)
        .order('decided_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClosureReviewRow[];
    },
  });

  const reconsiderationsQ = useQuery({
    queryKey: ['mc04_reconsiderations', complaintId],
    enabled: !!complaintId,
    queryFn: async (): Promise<ReconsiderationRow[]> => {
      const { data, error } = await sb
        .from('complaint_reconsiderations')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('received_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReconsiderationRow[];
    },
  });

  const invalidate = () => {
    ['mc04_outcome', 'mc04_redress', 'mc04_closure_readiness', 'mc04_closure_reviews', 'mc04_reconsiderations'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k, complaintId] }),
    );
    qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint_workflow_state', complaintId] });
    qc.invalidateQueries({ queryKey: ['complaint_tracking', complaintId] });
  };

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  const saveOutcome = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      call('complaint_outcome_save', {
        _complaint_id: complaintId,
        _payload: payload,
        _expected_row_version: outcomeQ.data?.outcome?.row_version ?? null,
      }),
    onSuccess: invalidate,
  });

  const submitOutcome = useMutation({
    mutationFn: () =>
      call('complaint_outcome_submit', {
        _complaint_id: complaintId,
        _expected_row_version: outcomeQ.data?.outcome?.row_version ?? null,
      }),
    onSuccess: invalidate,
  });

  const saveRedress = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      call('complaint_redress_save', { _payload: { complaint_id: complaintId, ...payload } }),
    onSuccess: invalidate,
  });

  const completeRedress = useMutation({
    mutationFn: (v: { id: string; note: string; rowVersion?: number }) =>
      call('complaint_redress_complete', {
        _redress_id: v.id,
        _note: v.note,
        _evidence_file_id: null,
        _expected_row_version: v.rowVersion ?? null,
      }),
    onSuccess: invalidate,
  });

  const verifyRedress = useMutation({
    mutationFn: (v: { id: string; note: string; rowVersion?: number }) =>
      call('complaint_redress_verify', { _redress_id: v.id, _note: v.note, _expected_row_version: v.rowVersion ?? null }),
    onSuccess: invalidate,
  });

  const cancelRedress = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      call('complaint_redress_cancel', { _redress_id: v.id, _reason: v.reason }),
    onSuccess: invalidate,
  });

  const submitForQa = useMutation({
    mutationFn: (v: { note?: string; reviewerId?: string | null }) =>
      call('complaint_qa_submit_for_review', {
        _complaint_id: complaintId,
        _reviewer_id: v.reviewerId ?? null,
        _note: v.note ?? null,
      }),
    onSuccess: invalidate,
  });

  const recordQa = useMutation({
    mutationFn: (v: { decision: 'qa_approved' | 'qa_returned'; findings: string; rationale: string }) =>
      call('complaint_qa_record', {
        _complaint_id: complaintId,
        _decision: v.decision,
        _findings: v.findings,
        _rationale: v.rationale,
        _checklist: null,
      }),
    onSuccess: invalidate,
  });

  const closeComplaint = useMutation({
    mutationFn: (v: { rationale: string; resolutionSummary?: string; expectedUpdatedAt?: string | null }) =>
      call('complaint_close', {
        _complaint_id: complaintId,
        _payload: { rationale: v.rationale, resolution_summary: v.resolutionSummary ?? null },
        _expected_updated_at: v.expectedUpdatedAt ?? null,
      }),
    onSuccess: invalidate,
  });

  const requestReconsideration = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      call('complaint_reconsideration_request', { _complaint_id: complaintId, _payload: payload }),
    onSuccess: invalidate,
  });

  const decideAdmissibility = useMutation({
    mutationFn: (v: { id: string; decision: 'ADMISSIBLE' | 'NOT_ADMISSIBLE'; rationale: string }) =>
      call('complaint_reconsideration_decide_admissibility', {
        _reconsideration_id: v.id,
        _decision: v.decision,
        _rationale: v.rationale,
      }),
    onSuccess: invalidate,
  });

  const assignReviewer = useMutation({
    mutationFn: (v: { id: string; reviewerId: string }) =>
      call('complaint_reconsideration_assign_reviewer', { _reconsideration_id: v.id, _reviewer_id: v.reviewerId }),
    onSuccess: invalidate,
  });

  const decideReconsideration = useMutation({
    mutationFn: (v: { id: string; decision: 'UPHELD' | 'VARIED' | 'REOPENED'; rationale: string }) =>
      call('complaint_reconsideration_decide', { _reconsideration_id: v.id, _decision: v.decision, _rationale: v.rationale }),
    onSuccess: invalidate,
  });

  const issueOutcomeLetter = useMutation({
    mutationFn: (v: { subject?: string; body: string }) =>
      call('complaint_outcome_letter_issue', {
        _complaint_id: complaintId,
        _subject: v.subject ?? null,
        _body: v.body,
      }),
    onSuccess: invalidate,
  });


  return {
    outcomeQ,
    redressQ,
    redressTypesQ,
    closureReadinessQ,
    closureReviewsQ,
    reconsiderationsQ,
    invalidate,
    saveOutcome,
    submitOutcome,
    saveRedress,
    completeRedress,
    verifyRedress,
    cancelRedress,
    submitForQa,
    recordQa,
    closeComplaint,
    requestReconsideration,
    decideAdmissibility,
    assignReviewer,
    decideReconsideration,
  };
}

/* ------------------------------------------------------- business wording */

export const OVERALL_OUTCOME_OPTIONS = [
  { value: 'UPHELD', label: 'Upheld' },
  { value: 'PARTLY_UPHELD', label: 'Partly upheld' },
  { value: 'NOT_UPHELD', label: 'Not upheld' },
  { value: 'RESOLVED_BY_FIRM', label: 'Resolved by the firm' },
  { value: 'WITHDRAWN', label: 'Withdrawn by the consumer' },
  { value: 'OUTSIDE_REMIT', label: 'Outside our remit' },
  { value: 'REFERRED', label: 'Referred to another body' },
];

export const HARM_LEVEL_OPTIONS = [
  { value: 'NONE', label: 'No consumer harm identified' },
  { value: 'MINOR', label: 'Minor harm' },
  { value: 'MODERATE', label: 'Moderate harm' },
  { value: 'SIGNIFICANT', label: 'Significant harm' },
  { value: 'SEVERE', label: 'Severe harm' },
];

export const CLOSURE_ROUTE_OPTIONS = [
  { value: 'STANDARD_CLOSURE', label: 'Standard closure' },
  { value: 'CLOSURE_AFTER_QUALITY_REVIEW', label: 'Closure after quality review' },
  { value: 'CLOSURE_WITHOUT_INVESTIGATION', label: 'Closure without investigation' },
];

const REDRESS_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed — awaiting verification',
  VERIFIED: 'Completed and verified',
  CANCELLED: 'Cancelled',
};

const RECONSIDERATION_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Request received',
  ADMISSIBILITY_REVIEW: 'Admissibility under review',
  NOT_ADMISSIBLE: 'Not admissible',
  ACCEPTED: 'Accepted — reviewer to be assigned',
  UNDER_REVIEW: 'Under independent review',
  DECIDED: 'Decided',
  WITHDRAWN: 'Withdrawn',
};

const RECONSIDERATION_DECISION_LABELS: Record<string, string> = {
  UPHELD: 'Original outcome upheld',
  VARIED: 'Original outcome varied',
  REOPENED: 'Complaint reopened',
};

const QA_DECISION_LABELS: Record<string, string> = {
  qa_submitted: 'Submitted for quality review',
  qa_approved: 'Quality review passed',
  qa_returned: 'Returned for correction',
  closed: 'Complaint closed',
};

const humanise = (v?: string | null) =>
  !v ? '—' : v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, ' ');

export const labelOf = (options: Array<{ value: string; label: string }>, value?: string | null) =>
  options.find((o) => o.value === value)?.label ?? humanise(value);

export const redressStatusLabel = (s?: string | null) => REDRESS_STATUS_LABELS[s ?? ''] ?? humanise(s);
export const reconsiderationStatusLabel = (s?: string | null) => RECONSIDERATION_STATUS_LABELS[s ?? ''] ?? humanise(s);
export const reconsiderationDecisionLabel = (s?: string | null) => RECONSIDERATION_DECISION_LABELS[s ?? ''] ?? humanise(s);
export const qaDecisionLabel = (s?: string | null) => QA_DECISION_LABELS[s ?? ''] ?? humanise(s);
export const outcomeLabel = (s?: string | null) => labelOf(OVERALL_OUTCOME_OPTIONS, s);
export const harmLabel = (s?: string | null) => labelOf(HARM_LEVEL_OPTIONS, s);
export const closureRouteLabel = (s?: string | null) => labelOf(CLOSURE_ROUTE_OPTIONS, s);
export const allegationOutcomeLabel = (s?: string | null) => humanise(s);

export const redressStatusVariant = (s?: string | null): 'default' | 'secondary' | 'outline' | 'destructive' =>
  s === 'VERIFIED' ? 'secondary' : s === 'CANCELLED' ? 'destructive' : s === 'COMPLETED' ? 'default' : 'outline';

export const formatMoney = (amount?: number | null, currency?: string | null) =>
  amount == null ? '—' : `${currency || ''} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

export default useComplaintOutcome;
