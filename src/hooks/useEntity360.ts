/**
 * RDM-ENTITY-001 Wave D — data hooks for the Enterprise Entity 360 view.
 *
 * All reads go through the governed `entity360_*` SECURITY DEFINER RPCs, which
 * enforce internal-only access and per-section permission gating. The hooks
 * never touch the underlying supervisory tables directly.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type E360SectionKey =
  | 'identity' | 'licences' | 'ownership' | 'relationships' | 'governance'
  | 'fit_and_proper' | 'business_profile' | 'prudential' | 'returns' | 'risk'
  | 'supervision' | 'market_conduct' | 'aml' | 'aml_confidential' | 'resilience'
  | 'examinations' | 'enforcement' | 'regulatory_requests' | 'documents'
  | 'correspondence' | 'timeline' | 'provenance';

export interface Entity360Overview {
  found: boolean;
  entity?: {
    id: string; name: string; status: string | null; public_slug: string | null;
    systemic_importance: string | null; sector: string | null; sub_sector: string | null;
    category: string | null; identity_status: string | null; lifecycle_stage: string | null;
    party_id: string | null; merged_into_entity_id: string | null; structure_version: number | null;
  };
  sections?: Partial<Record<E360SectionKey, boolean>>;
  licences?: Array<Record<string, unknown>>;
  ownership_summary?: { current_holders: number; controllers: number; ubos: number } | null;
  governance_summary?: { current_appointments: number; awaiting_approval: number } | null;
  fp_summary?: { total: number; open: number; determined: number } | null;
  returns_summary?: { obligations: number; filings: number; accepted: number; awaiting_review: number; overdue: number } | null;
  risk?: { overall_rating: string | null; risk_score: number | null; assessment_date: string | null; risk_factors: Record<string, unknown> | null } | null;
  risk_score_current?: { score: number | null; band: string | null; period_key: string | null; computed_at: string | null } | null;
  supervision?: {
    assignment: { supervisor_name: string | null; team: string | null; supervisory_cycle: string | null; cycle_start: string | null; cycle_end: string | null } | null;
    plans: number; open_actions: number;
  } | null;
  prudential?: { assessments: number; latest_rating: string | null; metrics_reported: number } | null;
  market_conduct?: { complaints: number; open_complaints: number; alerts_open: number } | null;
  aml?: { latest: Record<string, unknown> | null; open_findings: number } | null;
  resilience?: { arrangements: number; critical_providers: number; open_incidents: number } | null;
  examinations?: { total: number; in_progress: number; open_findings: number } | null;
  enforcement?: { total: number; open: number } | null;
  regulatory_requests?: { total: number; open: number; change_sets_pending: number } | null;
}

export interface Entity360SectionResult {
  section: string;
  allowed: boolean;
  as_of: string | null;
  limit: number;
  offset: number;
  rows: Array<Record<string, any>>;
}

export interface Entity360TimelineEvent {
  occurred_at: string;
  domain: string;
  event_type: string;
  title: string | null;
  detail: string | null;
  source_table: string | null;
  source_id: string | null;
}

export interface Entity360Timeline {
  total: number;
  limit: number;
  offset: number;
  events: Entity360TimelineEvent[];
}

export function useEntity360Overview(entityId?: string) {
  return useQuery({
    queryKey: ['entity360', 'overview', entityId],
    queryFn: () => rpc<Entity360Overview>('entity360_overview', { _entity_id: entityId }),
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

export function useEntity360Section(
  entityId?: string,
  section?: E360SectionKey,
  asOf?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['entity360', 'section', entityId, section, asOf ?? null],
    queryFn: () => rpc<Entity360SectionResult>('entity360_section', {
      _entity_id: entityId,
      _section: section,
      _as_of: asOf ?? null,
      _limit: 200,
      _offset: 0,
    }),
    enabled: !!entityId && !!section && enabled,
    staleTime: 30_000,
  });
}

export function useEntity360Timeline(
  entityId?: string,
  domains?: string[] | null,
  from?: string | null,
  to?: string | null,
) {
  return useQuery({
    queryKey: ['entity360', 'timeline', entityId, domains ?? null, from ?? null, to ?? null],
    queryFn: () => rpc<Entity360Timeline>('entity360_timeline', {
      _entity_id: entityId,
      _domains: domains && domains.length ? domains : null,
      _from: from ?? null,
      _to: to ?? null,
      _limit: 200,
      _offset: 0,
    }),
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

export function useEntity360AsOf(entityId?: string, asOf?: string | null) {
  return useQuery({
    queryKey: ['entity360', 'as-of', entityId, asOf ?? null],
    queryFn: () => rpc<Record<string, any>>('entity360_as_of', {
      _entity_id: entityId,
      _as_of: asOf,
    }),
    enabled: !!entityId && !!asOf,
    staleTime: 30_000,
  });
}
