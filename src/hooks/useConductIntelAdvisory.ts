/**
 * MC-09 — Governed AI advisory access for cross-entity supervisory
 * intelligence and emerging conduct risks.
 *
 * The browser never writes an advisory record. It reads what has been recorded,
 * asks the governed generation service to prepare an advisory, and records a
 * human decision through the governed review operation. Nothing regenerates,
 * accepts or escalates on its own.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdvisoryInsight, AdvisoryReviewEvent } from '@/hooks/useConductAdvisory';
import { reviewErrorMessage } from '@/hooks/useConductAdvisory';
import type { AdvisoryUseCase, ReviewAction } from '@/lib/conductAdvisoryLabels';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
  functions: { invoke: (n: string, o: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
};

export type IntelSubject =
  | { kind: 'sector_theme'; theme: string; sectorId: string | null; windowDays: number }
  | { kind: 'emerging_risk'; riskId: string; windowDays: number };

const INSIGHT_COLUMNS =
  'id,use_case_code,subject_type,subject_key,emerging_risk_id,window_start,window_end,generated_at,' +
  'ai_output,human_output,human_rationale,source_references,confidence,uncertainty,limitations,' +
  'staleness_state,staleness_checked_at,review_state,reviewed_at,provider,model,model_version,' +
  'technical_provenance_available,governance_service_label,governance_model_label,governance_version_label,' +
  'prompt_template_code,prompt_template_version,snapshot_fingerprint,subject_population';

function subjectKey(subject: IntelSubject): unknown[] {
  return subject.kind === 'sector_theme'
    ? ['sector_theme', subject.theme, subject.sectorId]
    : ['emerging_risk', subject.riskId];
}

/** Recorded advisory items for a theme or an emerging risk, newest first. */
export function useIntelAdvisoryInsights(subject: IntelSubject | null) {
  return useQuery({
    queryKey: ['conduct-intel-advisory', ...(subject ? subjectKey(subject) : ['none'])],
    enabled: Boolean(subject && (subject.kind === 'emerging_risk' || subject.theme.trim())),
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<AdvisoryInsight[]> => {
      let query = sb.from('conduct_ai_insights_presentation_v').select(INSIGHT_COLUMNS);
      if (subject!.kind === 'emerging_risk') {
        query = query.eq('subject_type', 'emerging_risk').eq('emerging_risk_id', subject!.riskId);
      } else {
        query = query.eq('subject_type', 'sector_theme').eq('subject_key', subject!.theme);
      }
      const { data, error } = await query.order('generated_at', { ascending: false }).limit(50);
      if (error) throw new Error((error as { message: string }).message);

      const insights = ((data ?? []) as AdvisoryInsight[]).map((row) => ({
        ...row,
        source_references: Array.isArray(row.source_references) ? row.source_references : [],
      }));
      if (insights.length === 0) return insights;

      const { data: events } = await sb
        .from('conduct_ai_review_events')
        .select('id,conduct_ai_insight_id,action,rationale,from_state,to_state,human_output,actor_id,created_at')
        .in('conduct_ai_insight_id', insights.map((i) => i.id))
        .order('created_at', { ascending: true });

      const byInsight = new Map<string, AdvisoryReviewEvent[]>();
      for (const e of ((events ?? []) as Array<AdvisoryReviewEvent & { conduct_ai_insight_id: string }>)) {
        const list = byInsight.get(e.conduct_ai_insight_id) ?? [];
        list.push(e);
        byInsight.set(e.conduct_ai_insight_id, list);
      }
      return insights.map((i) => ({ ...i, reviewEvents: byInsight.get(i.id) ?? [] }));
    },
  });
}

const DENIED = /(out of scope|outside your supervisory remit|not_authori|permission|42501|forbidden)/i;
const FALLBACK =
  'AI assistance is currently unavailable. The recorded supervisory intelligence remains fully available.';

/**
 * Asks the governed generation service for one advisory. A refusal or failure is
 * returned as a safe state, never thrown over the fact view.
 */
export function useGenerateIntelAdvisory(subject: IntelSubject | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (useCaseCode: AdvisoryUseCase) => {
      if (!subject) return { ok: false, state: 'AI_ASSISTANCE_UNAVAILABLE', message: FALLBACK } as const;

      const body = subject.kind === 'emerging_risk'
        ? {
            use_case_code: useCaseCode,
            subject_type: 'emerging_risk',
            emerging_risk_id: subject.riskId,
            window_days: subject.windowDays,
          }
        : {
            use_case_code: useCaseCode,
            subject_type: 'sector_theme',
            subject_key: subject.theme,
            sector_id: subject.sectorId,
            window_days: subject.windowDays,
          };

      const { data, error } = await sb.functions.invoke('conduct-intel-ai-advise', { body });
      const payload = (data ?? {}) as Record<string, unknown>;

      if (error && !payload.state) {
        const msg = String((error as { message?: string }).message ?? '');
        return {
          ok: false,
          state: DENIED.test(msg) ? 'DENIED' : 'AI_ASSISTANCE_UNAVAILABLE',
          message: DENIED.test(msg)
            ? 'You are not permitted to prepare AI assistance for this sector or risk.'
            : FALLBACK,
        } as const;
      }
      if (payload.ok !== true) {
        const message = String(payload.message ?? payload.error ?? '');
        return {
          ok: false,
          state: DENIED.test(message) ? 'DENIED' : String(payload.state ?? 'AI_ASSISTANCE_UNAVAILABLE'),
          message: message || FALLBACK,
        } as const;
      }
      return { ok: true, insightId: String(payload.conduct_ai_insight_id ?? '') } as const;
    },
    onSuccess: (result) => {
      if (result.ok && subject) {
        void qc.invalidateQueries({ queryKey: ['conduct-intel-advisory', ...subjectKey(subject)] });
      }
    },
  });
}

/** Records a human decision through the governed review operation only. */
export function useReviewIntelAdvisory(subject: IntelSubject | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { insightId: string; action: ReviewAction; rationale?: string; humanText?: string }) => {
      const { data, error } = await sb.rpc('conduct_ai_insight_review', {
        _insight_id: input.insightId,
        _action: input.action,
        _rationale: input.rationale?.trim() ? input.rationale.trim() : null,
        _human_output: input.action === 'modify' && input.humanText?.trim()
          ? { advisory_text: input.humanText.trim() }
          : null,
      });
      if (error) throw new Error(reviewErrorMessage(error.message));
      return data;
    },
    onSuccess: () => {
      if (subject) void qc.invalidateQueries({ queryKey: ['conduct-intel-advisory', ...subjectKey(subject)] });
    },
  });
}

/** Re-checks, on the server, whether an advisory still matches the current facts. */
export function useRefreshIntelAdvisoryFreshness(subject: IntelSubject | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insightId: string) => {
      const { data, error } = await sb.rpc('conduct_intel_ai_refresh_staleness', { _insight_id: insightId });
      if (error) throw new Error('The freshness of this advisory could not be checked.');
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      if (subject) void qc.invalidateQueries({ queryKey: ['conduct-intel-advisory', ...subjectKey(subject)] });
    },
  });
}
