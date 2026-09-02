import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * EPIC 4 / W2 — one enterprise supervisory timeline.
 *
 * Every entry is read from the canonical supervisory records and their event
 * tables through `supervisory_timeline`. Nothing is derived or recomputed in
 * the browser, so the timeline can be relied on as the supervisory record.
 */
export type SupervisoryTimelineEvent = {
  entity_id: string | null;
  domain_code: string | null;
  occurred_at: string;
  event_category: string;
  event_type: string;
  title: string | null;
  reference: string | null;
  detail: string | null;
  rationale: string | null;
  actor_id: string | null;
  is_decision: boolean | null;
  source_object: string | null;
  source_id: string | null;
};

export type SupervisoryTimeline = {
  entity_id: string | null;
  generated_at: string;
  counts: Record<string, number>;
  events: SupervisoryTimelineEvent[];
};

export const TIMELINE_CATEGORY_LABELS: Record<string, string> = {
  ASSESSMENT: 'Risk assessment',
  RISK_STATE: 'Risk state',
  ATTENTION: 'Supervisory attention',
  PLAN: 'Supervisory plan',
  INTERVENTION: 'Intervention',
  EXAMINATION: 'Examination',
  FINDING: 'Finding',
  REMEDIATION: 'Remediation',
  ESCALATION: 'Escalation',
  ENFORCEMENT: 'Enforcement',
};

export function useSupervisoryTimeline(params: {
  entityId?: string | null;
  domain?: string | null;
  category?: string | null;
  limit?: number;
  enabled?: boolean;
}) {
  const { entityId = null, domain = null, category = null, limit = 200, enabled = true } = params;

  return useQuery({
    queryKey: ['supervisory-timeline', entityId, domain, category, limit],
    enabled: enabled && Boolean(entityId ?? domain ?? category ?? true),
    queryFn: async (): Promise<SupervisoryTimeline> => {
      const { data, error } = await supabase.rpc('supervisory_timeline', {
        _entity_id: entityId,
        _domain: domain,
        _category: category,
        _from: null,
        _to: null,
        _limit: limit,
      });
      if (error) throw error;
      const payload = (data ?? {}) as Partial<SupervisoryTimeline>;
      return {
        entity_id: payload.entity_id ?? entityId,
        generated_at: payload.generated_at ?? new Date().toISOString(),
        counts: payload.counts ?? {},
        events: payload.events ?? [],
      };
    },
  });
}
