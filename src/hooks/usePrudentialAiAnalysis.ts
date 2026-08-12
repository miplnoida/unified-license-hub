/**
 * Advisory AI analysis for prudential risk modules.
 *
 * Reads the last stored advisory analysis for a scope and lets a supervisor
 * generate a fresh one on demand. Generation is always explicit (a button) so
 * dashboards never wait on the AI, and the deterministic data on screen keeps
 * rendering whether AI succeeds, fails or is unavailable.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  fingerprintFacts,
  type AdvisoryAnalysisType,
  type AdvisoryInsight,
  type AdvisoryPayload,
} from '@/lib/prudential/advisoryAi';

const sb = supabase as any;

interface Options {
  analysisType: AdvisoryAnalysisType;
  scope?: 'entity' | 'portfolio';
  scopeId?: string | null;
  periodKey?: string | null;
  /** Deterministic, platform-calculated facts. Never raw records. */
  facts: unknown;
  label?: string;
  enabled?: boolean;
}

export function usePrudentialAiAnalysis({
  analysisType,
  scope = 'entity',
  scopeId = null,
  periodKey = null,
  facts,
  label,
  enabled = true,
}: Options) {
  const qc = useQueryClient();
  const fingerprint = fingerprintFacts(facts ?? null);
  const key = ['prudential_ai_insight', analysisType, scope, scopeId ?? 'all'];

  const stored = useQuery({
    queryKey: key,
    enabled: enabled && (scope === 'portfolio' || !!scopeId),
    queryFn: async (): Promise<AdvisoryInsight | null> => {
      let q = sb
        .from('ai_insights')
        .select('id, analysis_type, payload, provider_state, model, period_key, input_fingerprint, generated_at, feedback')
        .eq('module', 'prudential')
        .eq('analysis_type', analysisType)
        .eq('scope', scope)
        .order('generated_at', { ascending: false })
        .limit(1);
      q = scopeId ? q.eq('scope_id', scopeId) : q.is('scope_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return { ...row, payload: (row.payload ?? {}) as AdvisoryPayload } as AdvisoryInsight;
    },
  });

  const generate = useMutation({
    mutationFn: async (opts?: { force?: boolean }) => {
      const { data, error } = await sb.functions.invoke('generate-prudential-ai-analysis', {
        body: {
          analysis_type: analysisType,
          scope,
          scope_id: scopeId,
          period_key: periodKey,
          fingerprint,
          facts,
          label,
          force: opts?.force ?? false,
        },
      });
      if (error) throw error;
      if (data && data.ok === false) {
        const err = new Error(data.error || 'AI analysis failed') as Error & { providerState?: string };
        err.providerState = data.provider_state;
        throw err;
      }
      return data?.insight as AdvisoryInsight;
    },
    onSuccess: (insight) => {
      if (insight?.id) qc.setQueryData(key, insight);
      else qc.setQueryData(key, insight ?? null);
    },
    onError: (e: any) => toast.error(e?.message || 'AI-assisted analysis is unavailable right now'),
  });

  const feedback = useMutation({
    mutationFn: async (value: 'helpful' | 'not_helpful') => {
      const id = stored.data?.id;
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
      qc.setQueryData(key, (prev: AdvisoryInsight | null) => (prev ? { ...prev, feedback: value } : prev));
      toast.success('Thanks — your feedback was recorded');
    },
    onError: (e: any) => toast.error(e?.message || 'Could not record feedback'),
  });

  const insight: AdvisoryInsight | null = generate.data ?? stored.data ?? null;
  const isStale = !!insight && !!insight.input_fingerprint && insight.input_fingerprint !== fingerprint;

  return {
    insight: insight ?? null,
    fingerprint,
    isStale,
    isLoading: stored.isLoading,
    isError: stored.isError,
    generate,
    feedback,
  };
}
