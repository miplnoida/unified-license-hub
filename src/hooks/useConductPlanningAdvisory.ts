/**
 * MC-10 — Governed AI assistance for supervisory planning.
 *
 * The browser never writes an advisory record and never asks the model directly.
 * It asks the governed service to prepare assistance for one attention item or
 * one plan, and records a human decision through the governed review operation.
 * A refusal, a stopped capability or an unavailable provider degrades to a safe
 * state: the recorded planning workflow above it stays fully usable.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { attentionKeys } from '@/hooks/useConductAttention';
import type { PlanningAdvisoryUseCase, ReviewAction } from '@/lib/conductAdvisoryLabels';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  functions: { invoke: (n: string, o: { body: unknown }) => Promise<{ data: unknown; error: unknown }> };
};

export type PlanningSubject =
  | { kind: 'attention'; id: string }
  | { kind: 'plan'; id: string };

const DENIED = /(out of scope|outside your supervisory remit|not_authori|permission|42501|forbidden)/i;
const FALLBACK =
  'AI assistance is currently unavailable. The recorded supervisory planning workflow remains fully available.';

function invalidateKey(subject: PlanningSubject) {
  return subject.kind === 'attention'
    ? attentionKeys.attentionCase(subject.id)
    : attentionKeys.planCase(subject.id);
}

/** Asks the governed planning service for one advisory item. */
export function useGeneratePlanningAdvisory(subject: PlanningSubject | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (useCaseCode: PlanningAdvisoryUseCase) => {
      if (!subject) return { ok: false, state: 'AI_ASSISTANCE_UNAVAILABLE', message: FALLBACK } as const;

      const body = subject.kind === 'attention'
        ? { use_case_code: useCaseCode, attention_id: subject.id }
        : { use_case_code: useCaseCode, plan_id: subject.id };

      const { data, error } = await sb.functions.invoke('conduct-planning-ai-advise', { body });
      const payload = (data ?? {}) as Record<string, unknown>;

      if (error && !payload.state && payload.ok !== true) {
        const msg = String((error as { message?: string }).message ?? '');
        return {
          ok: false,
          state: DENIED.test(msg) ? 'DENIED' : 'AI_ASSISTANCE_UNAVAILABLE',
          message: DENIED.test(msg)
            ? 'You are not permitted to prepare AI assistance for this record.'
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
      if (result.ok && subject) void qc.invalidateQueries({ queryKey: invalidateKey(subject) });
    },
  });
}

/** Records a human decision on an advisory item through the governed operation. */
export function useReviewPlanningAdvisory(subject: PlanningSubject | null) {
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
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      if (subject) void qc.invalidateQueries({ queryKey: invalidateKey(subject) });
    },
  });
}
