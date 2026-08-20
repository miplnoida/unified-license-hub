/**
 * Thematic review closure & follow-up.
 *
 * Every mutation goes through a SECURITY DEFINER RPC so that authorisation,
 * mandatory-reason rules, closure readiness gates, audit logging and
 * notification enqueueing are enforced server-side. The client never writes
 * closure state directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { thematicReviewLetterMarkDispatched } from '@/lib/supervisoryGovernedOps';

export type ThematicReportStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'published';
export type ThematicVerificationStatus = 'pending' | 'evidence_received' | 'verified' | 'not_satisfied';
export type ThematicClosureState = 'not_requested' | 'pending_approval' | 'approved' | 'rejected';

export interface ThematicReport {
  id: string;
  review_id: string;
  version: number;
  report_type: string;
  title: string;
  executive_summary: string | null;
  background: string | null;
  scope_methodology: string | null;
  key_findings: string | null;
  required_actions: string | null;
  regulatory_learning: string | null;
  status: ThematicReportStatus;
  prepared_by: string | null;
  prepared_at: string | null;
  submitted_at: string | null;
  approver_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThematicLetter {
  id: string;
  review_id: string;
  report_id: string | null;
  licensee_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  subject: string;
  body: string;
  status: 'pending' | 'dispatched' | 'failed';
  error_message: string | null;
  dispatched_at: string | null;
  created_at: string;
}

export interface ClosureReadiness {
  published_report_id: string | null;
  unverified_actions: number;
  open_findings: number;
  pending_letters: number;
}

const key = (reviewId: string) => ['thematic-closure', reviewId] as const;

export function useThematicReports(reviewId: string) {
  return useQuery({
    queryKey: [...key(reviewId), 'reports'],
    enabled: !!reviewId,
    queryFn: async (): Promise<ThematicReport[]> => {
      const { data, error } = await supabase
        .from('thematic_review_reports' as any)
        .select('*')
        .eq('review_id', reviewId)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data as any as ThematicReport[]) || [];
    },
  });
}

export function useThematicLetters(reviewId: string) {
  return useQuery({
    queryKey: [...key(reviewId), 'letters'],
    enabled: !!reviewId,
    queryFn: async (): Promise<ThematicLetter[]> => {
      const { data, error } = await supabase
        .from('thematic_review_letters' as any)
        .select('*')
        .eq('review_id', reviewId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any as ThematicLetter[]) || [];
    },
  });
}

export function useClosureReadiness(reviewId: string) {
  return useQuery({
    queryKey: [...key(reviewId), 'readiness'],
    enabled: !!reviewId,
    queryFn: async (): Promise<ClosureReadiness> => {
      const { data, error } = await supabase.rpc('thematic_review_closure_readiness' as any, {
        _review_id: reviewId,
      });
      if (error) throw error;
      return data as any as ClosureReadiness;
    },
  });
}

/** Reviews awaiting a closure decision, for the supervisor queue. */
export function useThematicClosureQueue() {
  return useQuery({
    queryKey: ['thematic-closure-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thematic_reviews' as any)
        .select('*')
        .in('closure_state', ['pending_approval', 'rejected'])
        .order('closure_requested_at', { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

/** Reports awaiting approval across all reviews. */
export function useThematicReportApprovalQueue() {
  return useQuery({
    queryKey: ['thematic-report-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thematic_review_reports' as any)
        .select('*, thematic_reviews(id,code,title,status)')
        .eq('status', 'in_review')
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

function useRpc<TVars extends Record<string, unknown>>(fn: string, reviewIdOf: (v: TVars) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const { data, error } = await supabase.rpc(fn as any, vars as any);
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      const reviewId = reviewIdOf(vars);
      if (reviewId) qc.invalidateQueries({ queryKey: key(reviewId) });
      qc.invalidateQueries({ queryKey: ['thematic-closure-queue'] });
      qc.invalidateQueries({ queryKey: ['thematic-report-queue'] });
    },
  });
}

export const useSaveThematicReportDraft = (reviewId: string) =>
  useRpc<{
    _review_id: string;
    _report_id?: string | null;
    _title?: string | null;
    _executive_summary?: string | null;
    _background?: string | null;
    _scope_methodology?: string | null;
    _key_findings?: string | null;
    _required_actions?: string | null;
    _regulatory_learning?: string | null;
    _report_type?: string;
  }>('thematic_report_upsert_draft', () => reviewId);

export const useSubmitThematicReport = (reviewId: string) =>
  useRpc<{ _report_id: string; _approver_id?: string | null }>('thematic_report_submit_for_approval', () => reviewId);

export const useApproveThematicReport = (reviewId: string) =>
  useRpc<{ _report_id: string }>('thematic_report_approve', () => reviewId);

export const useRejectThematicReport = (reviewId: string) =>
  useRpc<{ _report_id: string; _reason: string }>('thematic_report_reject', () => reviewId);

export const usePublishThematicReport = (reviewId: string) =>
  useRpc<{ _report_id: string }>('thematic_report_publish', () => reviewId);

export const useRequestThematicClosure = (reviewId: string) =>
  useRpc<{
    _review_id: string;
    _closure_summary: string;
    _regulatory_learning?: Record<string, unknown>;
    _approver_id?: string | null;
    _override_id?: string | null;
    _override_reason?: string | null;
  }>('thematic_review_request_closure', () => reviewId);

export const useApproveThematicClosure = (reviewId: string) =>
  useRpc<{ _review_id: string; _note?: string | null }>('thematic_review_approve_closure', () => reviewId);

export const useRejectThematicClosure = (reviewId: string) =>
  useRpc<{ _review_id: string; _reason: string }>('thematic_review_reject_closure', () => reviewId);

export const useRecordActionVerification = (reviewId: string) =>
  useRpc<{ _action_id: string; _verification_status: ThematicVerificationStatus; _notes?: string | null; _evidence?: string | null }>(
    'thematic_action_record_verification',
    () => reviewId,
  );

export const useExtendActionDueDate = (reviewId: string) =>
  useRpc<{ _action_id: string; _new_due_date: string; _reason: string }>('thematic_action_extend_due_date', () => reviewId);

export const useSetActionFollowUp = (reviewId: string) =>
  useRpc<{ _action_id: string; _follow_up_due_date?: string | null; _responsible_officer_id?: string | null; _entity_contact?: string | null }>(
    'thematic_action_set_follow_up',
    () => reviewId,
  );

/** Marks a staged supervisory letter as dispatched (audit trail kept in the row). */
export function useMarkLetterDispatched(reviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ letterId, email }: { letterId: string; email?: string | null }) => {
      await thematicReviewLetterMarkDispatched(letterId, email || null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(reviewId) }),
  });
}
