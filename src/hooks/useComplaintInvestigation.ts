/**
 * MC-03 — Complaint investigation workspace read model + governed mutations.
 *
 * `get_complaint_investigation_workspace` is the single source of truth for the
 * investigation surface: the MC-02 gate, the current plan and its history, the
 * allegation register, the evidence register with its allegation links,
 * information requests, representations, work items, outcome readiness and the
 * caller's capabilities. Nothing on the client re-derives any of it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as ops from '@/lib/complaintInvestigationOps';

const sb = supabase as any;

/* --------------------------------------------------------------------- types */

export interface InvestigationGate {
  ok: boolean;
  blockers: string[];
  investigation_scope?: string | null;
}

export interface InvestigationReadiness {
  readiness: 'READY_FOR_OUTCOME_REVIEW' | 'NOT_READY';
  blockers: string[];
  allegations_in_scope?: number;
  allegations_awaiting_assessment?: number;
  open_information_requests?: number;
  open_representation_windows?: number;
  incomplete_mandatory_tasks?: number;

}

export interface InvestigationPlan {
  id: string;
  version: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SUPERSEDED';
  objective: string | null;
  in_scope_summary: string | null;
  out_of_scope_summary: string | null;
  approach: string | null;
  evidence_required: string | null;
  information_sources: string | null;
  parties_to_contact: string | null;
  milestones: unknown;
  planned_completion_date: string | null;
  dependencies: string | null;
  risks_constraints: string | null;
  lead_investigator_id: string | null;
  review_officer_id: string | null;
  policy_reference: string | null;
  revision_reason: string | null;
  approved_at: string | null;
  row_version: number;
  is_current: boolean;
}

export interface InvestigationPlanHistoryRow {
  id: string;
  version: number;
  status: string;
  revision_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface Allegation {
  id: string;
  allegation_number: number;
  title: string;
  statement: string | null;
  respondent_id: string | null;
  respondent_name: string | null;
  issue_category_label: string | null;
  product_service: string | null;
  incident_from: string | null;
  incident_to: string | null;
  financial_amount: number | null;
  currency: string | null;
  affected_party: string | null;
  jurisdiction_scope: 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'UNDETERMINED';
  jurisdiction_rationale: string | null;
  investigation_status: 'UNASSESSED' | 'EVIDENCE_GATHERING' | 'ASSESSMENT_IN_PROGRESS' | 'ASSESSED' | 'REOPENED';
  assessment_outcome: 'SUBSTANTIATED' | 'PARTIALLY_SUBSTANTIATED' | 'NOT_SUBSTANTIATED' | 'UNABLE_TO_DETERMINE' | null;
  assessment_rationale: string | null;
  officer_analysis: string | null;
  row_version: number;
  evidence_count: number;
  supporting_count: number;
  contradicting_count: number;
}

export interface EvidenceLink {
  allegation_id: string;
  allegation_number: number | null;
  relationship_type: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT' | 'UNDETERMINED';
  relevance_note: string | null;
}

export interface EvidenceItem {
  id: string;
  evidence_reference: string;
  label: string | null;
  description: string | null;
  source_type: string | null;
  source_party: string | null;
  received_at: string | null;
  document_type: string | null;
  confidentiality: 'PUBLIC' | 'ENTITY_SHAREABLE' | 'INTERNAL' | 'RESTRICTED';
  privileged: boolean;
  reliability: 'NOT_ASSESSED' | 'LOW' | 'MODERATE' | 'HIGH';
  relevance: 'NOT_ASSESSED' | 'CONTEXTUAL' | 'RELEVANT' | 'MATERIAL';
  assessment_rationale: string | null;
  custody_state: 'HELD' | 'SUPERSEDED' | 'WITHDRAWN' | 'RELEASED';
  version: number;
  content_hash: string | null;
  supersedes_evidence_id: string | null;
  superseded_by_evidence_id: string | null;
  file_upload_id: string | null;
  row_version: number;
  links: EvidenceLink[];
}

export interface InvestigationRfi {
  id: string;
  summary: string | null;
  status: string;
  approval_state: string | null;
  due_at: string | null;
  raised_at: string | null;
  dispatched_at: string | null;
  purpose: string | null;
  evidence_requirement: string | null;
  evidence_finalized_at: string | null;
  investigator_disposition: string | null;
  item_count: number;
  allegation_numbers: number[];
}

export interface Representation {
  id: string;
  invitation_reference: string | null;
  representing_party: string | null;
  representation_type: string | null;
  status: string;
  invited_at: string | null;
  due_at: string | null;
  extended_due_at: string | null;
  extension_reason: string | null;
  submitted_at: string | null;
  is_late: boolean;
  late_decision: string | null;
  accepted_for_consideration: boolean | null;
  narrative: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  row_version: number;
  allegation_numbers: number[];
}

export interface InvestigationTask {
  id: string;
  title: string;
  description: string | null;
  /** Canonical states: NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED | CANCELLED. */
  status: string;

  due_date: string | null;
  owner_id: string | null;
  priority: string | null;
  is_mandatory: boolean;
  task_kind: string | null;
  allegation_id: string | null;
  blocked_reason: string | null;
  completion_note: string | null;
  row_version: number;
}

export interface InvestigationCapabilities {
  can_start_investigation: boolean;
  can_edit_plan: boolean;
  can_approve_plan: boolean;
  can_manage_allegations: boolean;
  can_manage_evidence: boolean;
  can_issue_rfi: boolean;
  can_approve_rfi: boolean;
  can_open_representation: boolean;
  can_review_representation: boolean;
  can_decide_late_representation: boolean;
  can_manage_tasks: boolean;
  can_add_note: boolean;
  sees_restricted_evidence: boolean;
}

export interface InvestigationWorkspace {
  complaint: {
    id: string;
    complaint_number: string;
    subject: string | null;
    status: string;
    investigator_id: string | null;
    licensee_id: string | null;
    priority: string | null;
    consumer_harm: string | null;
    conduct_risk_level: string | null;
    systemic_potential: string | null;
    triage_confirmation_status: string | null;
    updated_at: string | null;
  };
  gate: InvestigationGate;
  plan: InvestigationPlan | null;
  plan_history: InvestigationPlanHistoryRow[];
  allegations: Allegation[];
  evidence: EvidenceItem[];
  information_requests: InvestigationRfi[];
  representations: Representation[];
  tasks: InvestigationTask[];
  readiness: InvestigationReadiness;
  capabilities: InvestigationCapabilities;
}

/* ---------------------------------------------------------------------- keys */

export const investigationKeys = {
  workspace: (complaintId: string) => ['complaint_investigation_workspace', complaintId] as const,
  timeline: (complaintId: string) => ['complaint_investigation_timeline', complaintId] as const,
};

/* --------------------------------------------------------------------- reads */

export function useInvestigationWorkspace(complaintId?: string) {
  return useQuery({
    queryKey: investigationKeys.workspace(complaintId ?? ''),
    enabled: Boolean(complaintId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('get_complaint_investigation_workspace', {
        _complaint_id: complaintId,
      });
      if (error) throw new Error(error.message);
      return data as InvestigationWorkspace;
    },
  });
}

export interface TimelineEvent {
  at: string;
  source: string;
  label: string;
  detail: string | null;
}

export function useInvestigationTimeline(complaintId?: string, limit = 100) {
  return useQuery({
    queryKey: investigationKeys.timeline(complaintId ?? ''),
    enabled: Boolean(complaintId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('complaint_investigation_timeline', {
        _complaint_id: complaintId,
        _limit: limit,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as TimelineEvent[];
    },
  });
}

/* ----------------------------------------------------------------- mutations */

/**
 * Single mutation surface for the investigation workspace. Every operation is a
 * governed RPC; on success the workspace, timeline and complaint caches are
 * invalidated so the server-computed gate/readiness/phase are re-read rather
 * than guessed locally.
 */
export function useInvestigationMutation<TArgs>(
  complaintId: string,
  fn: (args: TArgs) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: investigationKeys.workspace(complaintId) });
      qc.invalidateQueries({ queryKey: investigationKeys.timeline(complaintId) });
      qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_workflow_state', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_tracking', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_rfis', complaintId] });
    },
  });
}

export { ops as investigationOps };
