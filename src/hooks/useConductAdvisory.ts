/**
 * MC-07.5 — Governed AI advisory access for Conduct 360.
 *
 * The browser never writes an advisory table. It only:
 *   - reads the approved use cases and the recorded advisory items,
 *   - asks the governed generation service to prepare an advisory,
 *   - asks the governed review operation to record a human decision,
 *   - asks the server to re-check whether an advisory is still current.
 *
 * There is no autonomous behaviour here: nothing regenerates, accepts,
 * overwrites or escalates on its own.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveWindow, type Conduct360WindowChoice } from '@/hooks/useConduct360';
import type { AdvisoryUseCase, ReviewAction } from '@/lib/conductAdvisoryLabels';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
  functions: { invoke: (n: string, o: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
};

export interface AdvisorySectionText { heading?: string; body?: string; cited_references?: string[] }
export interface AdvisoryRecord { reference?: string; reason_to_review?: string }
export interface AdvisoryQuestion { question?: string; cited_references?: string[] }
export interface AdvisoryHypothesis {
  hypothesis?: string;
  supporting_observations?: string;
  what_would_disconfirm?: string;
  cited_references?: string[];
}

export interface AdvisoryOutput {
  advisory_text?: string;
  sections?: AdvisorySectionText[];
  records?: AdvisoryRecord[];
  questions?: AdvisoryQuestion[];
  hypotheses?: AdvisoryHypothesis[];
  cited_references?: string[];
  confidence?: number;
  uncertainty?: string;
  limitations?: string[];
}

export interface AdvisoryCitation { section?: string; reference?: string; href?: string | null }

export interface AdvisoryReviewEvent {
  id: string;
  action: string;
  rationale: string | null;
  from_state: string | null;
  to_state: string | null;
  human_output: AdvisoryOutput | null;
  actor_id: string | null;
  created_at: string;
}

export interface AdvisoryInsight {
  id: string;
  use_case_code: AdvisoryUseCase;
  window_start: string;
  window_end: string;
  generated_at: string;
  ai_output: AdvisoryOutput | null;
  human_output: AdvisoryOutput | null;
  human_rationale: string | null;
  source_references: AdvisoryCitation[];
  confidence: number | null;
  uncertainty: string | null;
  limitations: string[] | null;
  staleness_state: string | null;
  staleness_checked_at: string | null;
  review_state: string | null;
  reviewed_at: string | null;
  provider: string | null;
  model: string | null;
  prompt_template_code: string | null;
  prompt_template_version: string | null;
  snapshot_fingerprint: string | null;
  reviewEvents?: AdvisoryReviewEvent[];
}

export interface AdvisoryUseCaseConfig {
  code: AdvisoryUseCase;
  /** Canonical display label — `conduct_ai_use_cases.label`. */
  label: string | null;
  is_enabled: boolean;
}

const INSIGHT_COLUMNS =
  'id,use_case_code,window_start,window_end,generated_at,ai_output,human_output,human_rationale,' +
  'source_references,confidence,uncertainty,limitations,staleness_state,staleness_checked_at,' +
  'review_state,reviewed_at,provider,model,prompt_template_code,prompt_template_version,snapshot_fingerprint';

/** The approved advisory types, as configured by the regulator. */
export function useAdvisoryUseCases() {
  return useQuery({
    queryKey: ['conduct-advisory-use-cases'],
    queryFn: async (): Promise<AdvisoryUseCaseConfig[]> => {
      const { data, error } = await sb
        .from('conduct_ai_use_cases')
        .select('code,label,is_enabled')
        .order('code');
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as AdvisoryUseCaseConfig[];
    },
    staleTime: 300_000,
    retry: false,
  });
}

/** Recorded advisory items for one entity and window, newest first, with review history. */
export function useAdvisoryInsights(entityId: string | undefined, choice: Conduct360WindowChoice) {
  const { start, end } = resolveWindow(choice);
  return useQuery({
    queryKey: ['conduct-advisory-insights', entityId, start, end],
    enabled: Boolean(entityId),
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<AdvisoryInsight[]> => {
      const { data, error } = await sb
        .from('conduct_ai_insights')
        .select(INSIGHT_COLUMNS)
        .eq('entity_id', entityId)
        .eq('window_start', start)
        .eq('window_end', end)
        .order('generated_at', { ascending: false });
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

export interface GenerationFailure {
  state: 'AI_ASSISTANCE_UNAVAILABLE' | 'DENIED' | 'NOT_APPROVED';
  message: string;
}

const DENIED = /(out of scope|outside your supervisory remit|not_authori|permission|42501|forbidden)/i;

/**
 * Asks the governed generation service for one advisory.
 * Failure is returned as a safe state — it never throws the fact view away.
 */
export function useGenerateAdvisory(entityId: string | undefined, choice: Conduct360WindowChoice) {
  const qc = useQueryClient();
  const { start, end } = resolveWindow(choice);

  return useMutation({
    mutationFn: async (useCaseCode: AdvisoryUseCase) => {
      const { data, error } = await sb.functions.invoke('conduct-360-ai-advise', {
        body: { entity_id: entityId, use_case_code: useCaseCode, window_start: start, window_end: end },
      });

      const payload = (data ?? {}) as Record<string, unknown>;
      if (error && !payload.state) {
        const msg = String((error as { message?: string }).message ?? '');
        return {
          ok: false,
          state: DENIED.test(msg) ? 'DENIED' : 'AI_ASSISTANCE_UNAVAILABLE',
          message: DENIED.test(msg)
            ? 'You are not permitted to prepare AI assistance for this entity.'
            : 'AI assistance is currently unavailable. The Conduct 360 facts below remain fully available.',
        } as const;
      }
      if (payload.ok !== true) {
        const message = String(payload.error ?? payload.message ?? '');
        return {
          ok: false,
          state: DENIED.test(message) ? 'DENIED' : 'AI_ASSISTANCE_UNAVAILABLE',
          message:
            message ||
            'AI assistance is currently unavailable. The Conduct 360 facts below remain fully available.',
        } as const;
      }
      return { ok: true, insightId: String(payload.conduct_ai_insight_id ?? '') } as const;
    },
    onSuccess: (result) => {
      if (result.ok) {
        void qc.invalidateQueries({ queryKey: ['conduct-advisory-insights', entityId, start, end] });
      }
    },
  });
}

export interface ReviewInput {
  insightId: string;
  action: ReviewAction;
  rationale?: string;
  humanText?: string;
}

/** Records a human decision through the governed review operation only. */
export function useReviewAdvisory(entityId: string | undefined, choice: Conduct360WindowChoice) {
  const qc = useQueryClient();
  const { start, end } = resolveWindow(choice);

  return useMutation({
    mutationFn: async ({ insightId, action, rationale, humanText }: ReviewInput) => {
      const { data, error } = await sb.rpc('conduct_ai_insight_review', {
        _insight_id: insightId,
        _action: action,
        _rationale: rationale?.trim() ? rationale.trim() : null,
        _human_output: action === 'modify' && humanText?.trim()
          ? { advisory_text: humanText.trim() }
          : null,
      });
      if (error) throw new Error(reviewErrorMessage(error.message));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-advisory-insights', entityId, start, end] });
    },
  });
}

/** Re-checks, on the server, whether an advisory still matches the current facts. */
export function useRefreshAdvisoryFreshness(entityId: string | undefined, choice: Conduct360WindowChoice) {
  const qc = useQueryClient();
  const { start, end } = resolveWindow(choice);

  return useMutation({
    mutationFn: async (insightId: string) => {
      const { data, error } = await sb.rpc('conduct_ai_insight_refresh_staleness', { _insight_id: insightId });
      if (error) throw new Error('The freshness of this advisory could not be checked.');
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conduct-advisory-insights', entityId, start, end] });
    },
  });
}

/** Turns a governed refusal into supervisor-facing language. */
export function reviewErrorMessage(raw: string): string {
  const m = raw ?? '';
  if (/rationale_required/.test(m)) return 'A written rationale is required for this decision.';
  if (/human_output_required/.test(m)) return 'Your revised wording is required when modifying an advisory.';
  if (/insight_superseded/.test(m)) return 'This advisory has been superseded and can no longer be reviewed.';
  if (/insight_not_found/.test(m)) return 'This advisory could not be found.';
  if (DENIED.test(m)) return 'You are not permitted to record a review decision on this advisory.';
  return 'This decision could not be recorded. Please try again.';
}
