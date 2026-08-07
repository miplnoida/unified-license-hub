/**
 * Legal / specialist referral lifecycle (FRD 6.3).
 *
 * Referrals are their own record: referred -> in_review -> returned/completed
 * (or cancelled). Opinions are written as append-only legal notes linked to the
 * referral, so referral history is preserved rather than overwritten.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReferralSpecialism = 'legal' | 'compliance' | 'aml' | 'actuarial' | 'it_risk' | 'other';
export type ReferralStatus = 'referred' | 'in_review' | 'returned' | 'completed' | 'cancelled';

export interface LegalReferral {
  id: string;
  application_id: string;
  workflow_instance_id: string | null;
  step_id: string | null;
  specialism: ReferralSpecialism;
  referral_reason: string;
  referred_by: string;
  referred_to: string | null;
  requested_at: string;
  due_at: string | null;
  evidence: Array<Record<string, unknown>>;
  status: ReferralStatus;
  returned_at: string | null;
  returned_by: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useLegalReferrals(applicationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['application_legal_referrals', applicationId],
    enabled: !!applicationId && enabled,
    staleTime: 20_000,
    queryFn: async (): Promise<LegalReferral[]> => {
      const { data, error } = await supabase
        .from('application_legal_referrals' as any)
        .select('*')
        .eq('application_id', applicationId!)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return ((data as unknown as LegalReferral[]) || []);
    },
  });
}

export function useCreateLegalReferral(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      specialism: ReferralSpecialism;
      referral_reason: string;
      referred_to: string | null;
      due_at: string | null;
      workflow_instance_id: string | null;
      step_id: string | null;
      evidence?: Array<Record<string, unknown>>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('application_legal_referrals' as any)
        .insert({
          application_id: applicationId,
          referred_by: user.id,
          evidence: input.evidence ?? [],
          ...input,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application_legal_referrals', applicationId] });
    },
  });
}

/** Status transitions only; the DB trigger enforces the legal transition map. */
export function useUpdateLegalReferral(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: ReferralStatus; completion_notes?: string | null }) => {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.completion_notes !== undefined) patch.completion_notes = input.completion_notes;
      const { data, error } = await supabase
        .from('application_legal_referrals' as any)
        .update(patch as any)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application_legal_referrals', applicationId] });
      qc.invalidateQueries({ queryKey: ['application_legal_notes', applicationId] });
    },
  });
}
