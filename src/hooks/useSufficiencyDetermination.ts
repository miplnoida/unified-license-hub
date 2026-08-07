/**
 * Sufficiency reviewer determination (FRD 6.2).
 *
 * The decision is recorded exclusively through `record_sufficiency_determination`,
 * which re-computes unresolved blockers and open RFIs server-side. A "sufficient"
 * outcome is refused while blocking conditions remain, so the checklist is
 * evidence of reviewer diligence — never the authority for the decision.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SufficiencyDecision = 'sufficient' | 'insufficient' | 'deferred';

export interface SufficiencyChecklistAnswer {
  key: string;
  label: string;
  checked: boolean;
  comment?: string | null;
}

export interface SufficiencyDetermination {
  id: string;
  application_id: string;
  evaluation_id: string | null;
  decision: SufficiencyDecision;
  reason: string;
  checklist: SufficiencyChecklistAnswer[];
  unresolved_blocker_count: number;
  open_rfi_count: number;
  gate_snapshot: Record<string, unknown>;
  determined_by: string;
  determined_at: string;
}

export const SUFFICIENCY_CHECKLIST: Array<{ key: string; label: string }> = [
  { key: 'forms_complete', label: 'All mandatory forms are complete and internally consistent' },
  { key: 'documents_present', label: 'All required supporting documents are present and legible' },
  { key: 'identity_verified', label: 'Applicant / entity identity and authorised signatory verified' },
  { key: 'fees_settled', label: 'Applicable fees are settled or formally waived' },
  { key: 'rfis_closed', label: 'All requests for information have been closed out' },
  { key: 'blockers_resolved', label: 'Rule blockers are resolved or formally overridden with reasons' },
];

export function useSufficiencyDeterminations(applicationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['sufficiency_determinations', applicationId],
    enabled: !!applicationId && enabled,
    staleTime: 20_000,
    queryFn: async (): Promise<SufficiencyDetermination[]> => {
      const { data, error } = await supabase
        .from('sufficiency_determinations' as any)
        .select('*')
        .eq('application_id', applicationId!)
        .order('determined_at', { ascending: false });
      if (error) throw error;
      return ((data as unknown as SufficiencyDetermination[]) || []);
    },
  });
}

export function useRecordSufficiencyDetermination(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      decision: SufficiencyDecision;
      reason: string;
      checklist: SufficiencyChecklistAnswer[];
    }) => {
      const { data, error } = await supabase.rpc('record_sufficiency_determination' as any, {
        _application_id: applicationId,
        _decision: input.decision,
        _reason: input.reason,
        _checklist: input.checklist as unknown as any,
      });
      if (error) throw new Error(error.message);
      const res = (data || {}) as Record<string, unknown>;
      if (res.error) {
        const err = new Error(String(res.error)) as Error & { code?: string; details?: Record<string, unknown> };
        err.code = res.code as string | undefined;
        err.details = res;
        throw err;
      }
      return res.determination as SufficiencyDetermination;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sufficiency_determinations', applicationId] });
      qc.invalidateQueries({ queryKey: ['sufficiency_latest', applicationId] });
    },
  });
}
