import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type LegalRecommendation =
  | 'no_objection'
  | 'approve_with_conditions'
  | 'request_more_information'
  | 'escalate'
  | 'reject';

export type LegalSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface LegalNote {
  id: string;
  application_id: string;
  workflow_instance_id: string | null;
  step_id: string | null;
  actor_id: string;
  note_text: string;
  has_legal_concern: boolean;
  concern_severity: LegalSeverity | null;
  recommended_conditions: string | null;
  recommendation: LegalRecommendation;
  restricted: boolean;
  created_at: string;
  updated_at: string;
}

export function useLegalNotesAccess(applicationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['legal_notes_access', applicationId],
    enabled: !!applicationId && enabled,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('request_legal_notes_access' as any, {
        _application_id: applicationId!,
      });
      if (error) return false;
      return !!(data as any)?.allowed;
    },
    staleTime: 60_000,
  });
}

export function useLegalNotes(applicationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['application_legal_notes', applicationId],
    enabled: !!applicationId && enabled,
    queryFn: async (): Promise<LegalNote[]> => {
      const { data, error } = await supabase
        .from('application_legal_notes' as any)
        .select('*')
        .eq('application_id', applicationId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as LegalNote[]) || [];
    },
    staleTime: 30_000,
  });
}

export function useCreateLegalNote(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workflow_instance_id: string | null;
      step_id: string;
      note_text: string;
      has_legal_concern: boolean;
      concern_severity: LegalSeverity | null;
      recommended_conditions: string | null;
      recommendation: LegalRecommendation;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('application_legal_notes' as any)
        .insert({
          application_id: applicationId,
          actor_id: user.id,
          restricted: true,
          ...input,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application_legal_notes', applicationId] });
    },
  });
}
