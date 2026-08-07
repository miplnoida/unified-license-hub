/**
 * AI Insights (Phase 5).
 *
 * Insights are never presented as decisions: each row carries its provider
 * state, confidence, explanation and source records, and can only progress
 * through the `ai_insight_review` RPC (accept / reject / escalate) with a
 * human justification.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AiInsight {
  id: string;
  title: string;
  module: string;
  entity_id: string | null;
  object_type: string | null;
  object_id: string | null;
  source_records: unknown;
  citations: unknown;
  provider: string | null;
  model: string | null;
  provider_state: string;
  confidence: number | null;
  explanation: string | null;
  recommendation: string | null;
  insight_kind: string | null;
  review_status: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  generated_at: string;
}

export function useAiInsights(filters?: { module?: string; status?: string }) {
  return useQuery({
    queryKey: ['ai_insights', filters?.module, filters?.status],
    queryFn: async () => {
      let q = supabase.from('ai_insights').select('*').order('generated_at', { ascending: false }).limit(200);
      if (filters?.module && filters.module !== 'all') q = q.eq('module', filters.module);
      if (filters?.status && filters.status !== 'all') q = q.eq('review_status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AiInsight[];
    },
  });
}

export function useAiInsightActions(insightId?: string) {
  return useQuery({
    queryKey: ['ai_insight_actions', insightId],
    enabled: !!insightId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_insight_actions')
        .select('*')
        .eq('insight_id', insightId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReviewAiInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      insightId: string;
      action: 'accept' | 'reject' | 'escalate' | 'note';
      justification?: string;
      followUpType?: string;
      followUpId?: string;
    }) => {
      const { data, error } = await supabase.rpc('ai_insight_review', {
        _insight_id: args.insightId,
        _action: args.action,
        _justification: args.justification,
        _follow_up_type: args.followUpType,
        _follow_up_id: args.followUpId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_insights'] });
      qc.invalidateQueries({ queryKey: ['ai_insight_actions', vars.insightId] });
    },
  });
}

/** True when the insight came from a real provider run, not a sandbox/mock. */
export function isLiveInsight(state: string): boolean {
  return state === 'live' || state === 'success';
}
