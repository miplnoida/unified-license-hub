/**
 * EPR-04 — Fit & Proper process read models.
 *
 * The canonical F&P case is an ASSESSMENT, not a person. Everything
 * process-shaped for a case (stage, status, SLA, owner, waiting-on, blockers,
 * next action, permitted governed actions) comes from
 * `public.fp_assessment_case(_assessment_id)`. The browser only formats it and
 * never resolves a case from "the individual's latest assessment".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface FpCaseAction {
  code: string;
  label: string;
  to_status: string;
  requires_reason: boolean;
  permission: string | null;
  enabled: boolean;
}

export interface FpAssessmentCase {
  found: boolean;
  allowed: boolean;
  generated_at?: string;
  can_act?: boolean;
  assessment_id?: string;
  header?: {
    reference: string;
    subject: string;
    subject_href: string;
    individual_id: string;
    role_id: string | null;
    role_label: string | null;
    role_type: string | null;
    licensee_id: string | null;
    licensee_name: string | null;
    entity_href: string | null;
    regulator_id: string | null;
    regulator_name: string | null;
    assessment_type: string | null;
    stage: string;
    stage_label: string;
    status: string;
    status_label: string;
    owner_user_id: string | null;
    team: string | null;
    priority: string;
    sla_due_at: string | null;
    sla_state: 'on_track' | 'due_soon' | 'breached' | 'paused';
    waiting_on: string | null;
    created_at: string;
    last_activity_at: string | null;
  };
  blockers?: Array<{ code: string; label: string; href?: string }>;
  available_actions?: FpCaseAction[];
  next_action?: { code: string; label: string } | null;
  declaration?: {
    pq_state: string | null;
    pq_amendment_reason: string | null;
    submitted_at: string | null;
    submitted_by: string | null;
    form_template_id: string | null;
    form_version_id: string | null;
    form_response_id: string | null;
    has_data: boolean;
    invitation: {
      id: string; status: string | null; channel: string | null;
      recipient_email: string | null; sent_at: string | null;
      opened_at: string | null; submitted_at: string | null; expires_at: string | null;
    } | null;
  } | null;
  screening?: {
    runs: Array<{
      id: string; run_type: string | null; status: string | null;
      started_at: string | null; completed_at: string | null;
      total_checks: number | null; total_hits: number | null; error: string | null;
    }>;
    open_findings: number;
    high_findings: number;
  };
  findings?: Array<{
    id: string; run_id: string | null; check_type: string | null; severity: string | null;
    title: string | null; summary: string | null; is_false_positive: boolean | null;
    resolution_status: string | null; assigned_to: string | null; created_at: string; href: string;
  }>;
  committee?: {
    committee: {
      id: string; name: string; quorum: number | null; approval_threshold_pct: number | null;
      is_active: boolean | null; member_count: number; my_membership_id: string | null;
    } | null;
    votes: Array<{
      id: string; member_id: string | null; vote: string | null;
      justification: string | null; voted_at: string | null; weight: number | null;
    }>;
  };
  determination?: {
    id: string; outcome: string | null; rationale: string | null;
    determined_at: string | null; determined_by: string | null;
    effective_from: string | null; effective_to: string | null;
    is_current: boolean | null; is_committee_override: boolean | null; override_reason: string | null;
  } | null;
  conditions?: Array<{
    id: string; category: string | null; description: string | null; due_date: string | null;
    status: string | null; monitoring_owner: string | null; evidence_type: string | null;
    satisfied_at: string | null;
  }>;
  monitoring?: Array<{
    id: string; event_type: string | null; severity: string | null; summary: string | null;
    raised_at: string | null; acknowledged_at: string | null;
  }>;
  appeals?: Array<{
    id: string; status: string | null; grounds: string | null; filed_at: string | null;
    decision: string | null; decision_rationale: string | null; decided_at: string | null;
  }>;
  related_cases?: Array<{ kind: string; label: string; detail: string | null; href: string }>;
  history?: Array<{
    at: string; action: string; object_type: string | null;
    user_id: string | null; justification: string | null;
  }>;
}

export function useFpAssessmentCase(assessmentId?: string) {
  return useQuery({
    queryKey: ['fp_assessment_case', assessmentId],
    queryFn: () => rpc<FpAssessmentCase>('fp_assessment_case', { _assessment_id: assessmentId }),
    enabled: !!assessmentId,
    staleTime: 15_000,
  });
}
