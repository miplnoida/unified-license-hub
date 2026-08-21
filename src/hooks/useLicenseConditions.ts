/**
 * P04 A.7 / A.8 — licence conditions as monitored obligations.
 *
 * Evidence submission (`license_condition_submit_evidence`) never satisfies a
 * condition; only the governed regulator review (`license_condition_review`)
 * concludes it, and a breach applies the configured consequence server-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ConditionStatus =
  | 'open' | 'in_progress' | 'evidence_due' | 'under_review'
  | 'satisfied' | 'waived' | 'varied' | 'breached' | 'closed';

export interface LicenseCondition {
  id: string;
  license_id: string;
  application_id: string | null;
  condition_reference: string | null;
  source_decision: string | null;
  source_matter_id: string | null;
  requirement_ref: string | null;
  category: string | null;
  description: string | null;
  effective_date: string | null;
  due_date: string | null;
  owner_user_id: string | null;
  owner_team: string | null;
  monitoring_owner: string | null;
  evidence_required: boolean;
  status: ConditionStatus;
  review_state: 'not_submitted' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'waived';
  last_evidence_at: string | null;
  satisfied_at: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
  varied_at: string | null;
  variation_reason: string | null;
  breached_at: string | null;
  breach_reason: string | null;
  breach_consequence: string | null;
  breach_matter_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseConditionEvidence {
  id: string;
  condition_id: string;
  license_id: string;
  submitted_by: string | null;
  submitted_at: string;
  summary: string | null;
  document_ids: unknown[];
  file_paths: unknown[];
  review_state: 'submitted' | 'under_review' | 'accepted' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export type ConditionDecision = 'SATISFY' | 'WAIVE' | 'VARY' | 'BREACH' | 'RETURN_FOR_EVIDENCE';

export function useLicenseConditions(licenseId: string | null | undefined) {
  return useQuery({
    enabled: !!licenseId,
    queryKey: ['license_conditions', licenseId],
    queryFn: async (): Promise<LicenseCondition[]> => {
      const { data, error } = await (supabase as any)
        .from('license_conditions')
        .select('*')
        .eq('license_id', licenseId!)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LicenseCondition[];
    },
    staleTime: 15_000,
  });
}

export function useLicenseConditionEvidence(licenseId: string | null | undefined) {
  return useQuery({
    enabled: !!licenseId,
    queryKey: ['license_condition_evidence', licenseId],
    queryFn: async (): Promise<LicenseConditionEvidence[]> => {
      const { data, error } = await (supabase as any)
        .from('license_condition_evidence')
        .select('*')
        .eq('license_id', licenseId!)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LicenseConditionEvidence[];
    },
    staleTime: 15_000,
  });
}

function useConditionInvalidation(licenseId: string | null | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['license_conditions', licenseId] });
    qc.invalidateQueries({ queryKey: ['license_condition_evidence', licenseId] });
    qc.invalidateQueries({ queryKey: ['license_case', licenseId] });
    qc.invalidateQueries({ queryKey: ['license_lifecycle_work_queue'] });
  };
}

export function useSubmitConditionEvidence(licenseId: string | null | undefined) {
  const invalidate = useConditionInvalidation(licenseId);
  return useMutation({
    mutationFn: async (vars: { conditionId: string; summary: string; documentIds?: string[]; filePaths?: string[] }) => {
      const { data, error } = await (supabase as any).rpc('license_condition_submit_evidence', {
        _condition_id: vars.conditionId,
        _payload: {
          summary: vars.summary,
          document_ids: vars.documentIds ?? [],
          file_paths: vars.filePaths ?? [],
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useReviewCondition(licenseId: string | null | undefined) {
  const invalidate = useConditionInvalidation(licenseId);
  return useMutation({
    mutationFn: async (vars: {
      conditionId: string;
      decision: ConditionDecision;
      reason?: string;
      payload?: Record<string, unknown>;
    }) => {
      const { data, error } = await (supabase as any).rpc('license_condition_review', {
        _condition_id: vars.conditionId,
        _decision: vars.decision,
        _reason: vars.reason ?? null,
        _payload: vars.payload ?? {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}
