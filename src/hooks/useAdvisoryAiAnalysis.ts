/**
 * Advisory AI analysis for supervisory modules (examination, enforcement,
 * complaints/conduct, cross-module intelligence, executive workbenches).
 *
 * Generation is always explicit so no module ever waits on AI. The stored
 * analysis is read from `ai_insights`; the edge function assembles the
 * authoritative facts server-side under the caller's own permissions.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  fingerprintFacts,
  type AdvisoryModule,
  type SupervisoryAnalysisType,
  type SupervisoryInsight,
  type SupervisoryPayload,
} from '@/lib/ai/advisoryAi';

const sb = supabase as any;

interface Options {
  module: AdvisoryModule;
  analysisType: SupervisoryAnalysisType;
  /** Record the analysis is about (examination, case, complaint, entity…). */
  scopeId?: string | null;
  scope?: 'record' | 'entity' | 'portfolio';
  periodKey?: string | null;
  /**
   * Small deterministic marker of the data currently on screen (ids, counts,
   * updated_at values). Used only for the staleness fingerprint — the facts
   * sent to the model are assembled server-side.
   */
  stalenessFacts?: unknown;
  label?: string;
  enabled?: boolean;
}

export function useAdvisoryAiAnalysis({
  module,
  analysisType,
  scopeId = null,
  scope = 'record',
  periodKey = null,
  stalenessFacts,
  label,
  enabled = true,
}: Options) {
  const qc = useQueryClient();
  const fingerprint = fingerprintFacts(stalenessFacts ?? null);
  const key = ['supervisory_ai_insight', module, analysisType, scopeId ?? 'all'];

  const stored = useQuery({
    queryKey: key,
    enabled: enabled && (scope === 'portfolio' || !!scopeId),
    queryFn: async (): Promise<SupervisoryInsight | null> => {
      let q = sb
        .from('ai_insights')
        .select(
          'id, analysis_type, payload, provider_state, model, period_key, input_fingerprint, generated_at, feedback',
        )
        .eq('module', module)
        .eq('analysis_type', analysisType)
        .order('generated_at', { ascending: false })
        .limit(1);
      q = scopeId ? q.eq('scope_id', scopeId) : q.is('scope_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return { ...row, payload: (row.payload ?? {}) as SupervisoryPayload } as SupervisoryInsight;
    },
  });

  const generate = useMutation({
    mutationFn: async (opts?: { force?: boolean; question?: string; context?: unknown }) => {
      const { data, error } = await sb.functions.invoke('generate-supervisory-ai-analysis', {
        body: {
          module,
          analysis_type: analysisType,
          scope,
          scope_id: scopeId,
          period_key: periodKey,
          fingerprint,
          label,
          question: opts?.question ?? null,
          context: opts?.context ?? null,
          force: opts?.force ?? false,
        },
      });
      if (error) throw error;
      if (data && data.ok === false) {
        const err = new Error(data.error || 'AI analysis is temporarily unavailable') as Error & {
          providerState?: string;
        };
        err.providerState = data.provider_state;
        throw err;
      }
      return data?.insight as SupervisoryInsight;
    },
    onSuccess: (insight) => {
      qc.setQueryData(key, insight ?? null);
    },
    onError: (e: any) => toast.error(e?.message || 'AI analysis is temporarily unavailable'),
  });

  const feedback = useMutation({
    mutationFn: async (value: 'helpful' | 'not_helpful' | 'flagged') => {
      const id = stored.data?.id ?? generate.data?.id;
      if (!id) throw new Error('Nothing to rate yet');
      const user = (await sb.auth.getUser()).data.user;
      const { error } = await sb
        .from('ai_insights')
        .update({ feedback: value, feedback_by: user?.id ?? null, feedback_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(key, (prev: SupervisoryInsight | null) => (prev ? { ...prev, feedback: value } : prev));
      toast.success('Thanks — your feedback was recorded');
    },
    onError: (e: any) => toast.error(e?.message || 'Could not record feedback'),
  });

  const insight: SupervisoryInsight | null = generate.data ?? stored.data ?? null;
  const isStale = !!insight && !!insight.input_fingerprint && insight.input_fingerprint !== fingerprint;

  return {
    insight,
    fingerprint,
    isStale,
    isLoading: stored.isLoading,
    isError: stored.isError,
    generate,
    feedback,
  };
}
