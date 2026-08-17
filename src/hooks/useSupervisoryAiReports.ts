/**
 * Read layer for the Supervisory AI Reports hub.
 *
 * Reads only — nothing here generates AI analysis or writes to a supervisory
 * table. Every row comes from one permission-aware read index
 * (`supervisory_ai_reports_index`) that unions the three places the platform
 * already stores AI analyses:
 *
 *  - advisory `ai_insights` (per-module + contributing-source visibility rules)
 *  - licensing `application_ai_assessments` (application visibility rules)
 *  - Fit & Proper `fp_screening_runs` of type `ai_media` (F&P visibility rules)
 *
 * Using a single index is what makes cross-source chronology, totals and paging
 * correct: the newest 25 reports really are the newest 25 authorised reports.
 * Filter options, version history and report payloads are separate queries so a
 * failure in one of them never empties or blocks the list.
 */
import { useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import {
  hubModuleFromInsight,
  sourceRouteFor,
  analysisTypeLabel,
  type Freshness,
  type HubConfidence,
  type HubModule,
  type HubReportState,
  type HubSource,
  type SupervisoryAiReport,
} from '@/lib/ai/reportHub';

const sb = supabase as any;

export interface ReportFilters {
  modules: HubModule[];
  analysisTypes: string[];
  entityId: string | null;
  from: string | null;
  to: string | null;
  search: string;
  includeFailed: boolean;
  confidence: string | null;
  freshness: string | null;
  pageSize: number;
}

export const DEFAULT_FILTERS: ReportFilters = {
  modules: [],
  analysisTypes: [],
  entityId: null,
  from: null,
  to: null,
  search: '',
  includeFailed: false,
  confidence: null,
  freshness: null,
  pageSize: 25,
};

export interface HubCounts {
  total: number;
  recent: number;
  outdated: number;
  limited: number;
  byModule: Partial<Record<HubModule, number>>;
}

/** Maps one index row onto the presentation model. */
function toReport(row: any): SupervisoryAiReport {
  const module = hubModuleFromInsight(row.module);
  const { route, label } = sourceRouteFor({
    module,
    scope: row.entity_id ? 'entity' : 'portfolio',
    recordId: row.record_id ?? null,
  });
  return {
    id: row.id,
    source: row.source as HubSource,
    module,
    analysisType: row.analysis_type,
    title: row.title || analysisTypeLabel(row.analysis_type),
    summary: row.summary,
    entityId: row.entity_id ?? null,
    entityName: row.entity_name ?? null,
    recordId: row.record_id ?? null,
    recordReference: row.record_reference ?? null,
    subjectName: row.subject_name ?? null,
    periodKey: row.period_key ?? null,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by ?? null,
    confidence: (row.confidence as HubConfidence) ?? null,
    reportState: (row.report_state as HubReportState) ?? 'available',
    freshness: (row.freshness as Freshness) ?? 'unknown',
    limitedEvidence: !!row.limited_evidence,
    flagged: !!row.flagged,
    feedback: row.feedback ?? null,
    reviewStatus: row.review_status ?? null,
    versionKey: row.version_key,
    sourceRoute: route,
    sourceActionLabel: label,
  };
}

function rpcArgs(filters: ReportFilters) {
  return {
    _modules: filters.modules.length ? filters.modules : null,
    _analysis_types: filters.analysisTypes.length ? filters.analysisTypes : null,
    _entity_id: filters.entityId,
    _from: filters.from,
    _to: filters.to,
    _search: filters.search.trim() || null,
    _include_failed: filters.includeFailed,
    _confidence: filters.confidence,
    _freshness: filters.freshness,
  };
}

export function useSupervisoryAiReports(filters: ReportFilters) {
  const qc = useQueryClient();
  const { isLoading: permsLoading } = useUserDynamicPermissions();

  const args = rpcArgs(filters);
  const key = ['ai_report_hub', 'index', args, filters.pageSize];

  const list = useInfiniteQuery({
    queryKey: key,
    enabled: !permsLoading,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await sb.rpc('supervisory_ai_reports_index', {
        ...args,
        _limit: filters.pageSize,
        _offset: (pageParam as number) * filters.pageSize,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    // Pages accumulate: a further page appends older reports, never replaces.
    getNextPageParam: (lastPage, allPages) => {
      const total = lastPage?.[0]?.total_count ? Number(lastPage[0].total_count) : null;
      const loaded = allPages.reduce((n, p) => n + p.length, 0);
      if (total === null) return lastPage.length === filters.pageSize ? allPages.length : undefined;
      return loaded < total ? allPages.length : undefined;
    },
  });

  const rows = useMemo(() => (list.data?.pages ?? []).flat(), [list.data]);

  const reports = useMemo(() => {
    const seen = new Set<string>();
    const out: SupervisoryAiReport[] = [];
    for (const row of rows) {
      const dedupeKey = `${row.source}:${row.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(toReport(row));
    }
    return out;
  }, [rows]);

  /** Server-side totals for the whole filtered, authorised set. */
  const counts: HubCounts | null = useMemo(() => {
    const first = rows[0];
    if (!first) return list.isSuccess ? { total: 0, recent: 0, outdated: 0, limited: 0, byModule: {} } : null;
    const byModule: Partial<Record<HubModule, number>> = {};
    for (const [m, n] of Object.entries((first.module_counts ?? {}) as Record<string, number>)) {
      byModule[hubModuleFromInsight(m)] = Number(n);
    }
    return {
      total: Number(first.total_count ?? 0),
      recent: Number(first.recent_7d ?? 0),
      outdated: Number(first.outdated_count ?? 0),
      limited: Number(first.limited_count ?? 0),
      byModule,
    };
  }, [rows, list.isSuccess]);

  /** Latest version per logical analysis, from the reports loaded so far. */
  const latestByVersion = useMemo(() => {
    const seen = new Set<string>();
    return reports.filter((r) => (seen.has(r.versionKey) ? false : (seen.add(r.versionKey), true)));
  }, [reports]);

  return {
    reports,
    latestByVersion,
    counts,
    loadedCount: reports.length,
    isLoading: permsLoading || list.isLoading,
    isError: list.isError,
    isFetchingNextPage: list.isFetchingNextPage,
    hasMore: !!list.hasNextPage,
    loadMore: () => list.fetchNextPage(),
    retry: () => list.refetch(),
    invalidate: () => qc.invalidateQueries({ queryKey: ['ai_report_hub'] }),
  };
}

/**
 * Filter options built from the whole authorised, filtered set — never from the
 * page currently on screen.
 */
export function useSupervisoryAiReportFacets(filters: ReportFilters) {
  const query = useQuery({
    queryKey: [
      'ai_report_hub',
      'facets',
      filters.modules,
      filters.from,
      filters.to,
      filters.search.trim(),
      filters.includeFailed,
    ],
    queryFn: async () => {
      const { data, error } = await sb.rpc('supervisory_ai_report_facets', {
        _modules: filters.modules.length ? filters.modules : null,
        _from: filters.from,
        _to: filters.to,
        _search: filters.search.trim() || null,
        _include_failed: filters.includeFailed,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const entities = useMemo(
    () =>
      (query.data ?? [])
        .filter((r) => r.kind === 'entity')
        .map((r) => ({ id: r.value as string, name: (r.label as string) ?? r.value, count: Number(r.n) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [query.data],
  );

  const analysisTypes = useMemo(
    () =>
      (query.data ?? [])
        .filter((r) => r.kind === 'analysis_type')
        .map((r) => ({ type: r.value as string, count: Number(r.n) }))
        .sort((a, b) => analysisTypeLabel(a.type).localeCompare(analysisTypeLabel(b.type))),
    [query.data],
  );

  return { entities, analysisTypes, isLoading: query.isLoading, isError: query.isError, retry: () => query.refetch() };
}

/**
 * Version history for one logical analysis, queried by its stable identity so
 * older versions are found regardless of which listing page they belong to.
 */
export function useSupervisoryAiReportVersions(versionKey?: string | null) {
  const query = useQuery({
    queryKey: ['ai_report_hub', 'versions', versionKey],
    enabled: !!versionKey,
    queryFn: async () => {
      const { data, error } = await sb.rpc('supervisory_ai_report_versions', { _version_key: versionKey });
      if (error) throw error;
      return ((data ?? []) as any[]).map(toReport);
    },
  });
  return {
    versions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => query.refetch(),
  };
}

/** Full payload for one report, fetched only when the user opens it. */
export function useSupervisoryAiReportDetail(report: SupervisoryAiReport | null) {
  const query = useQuery({
    queryKey: ['ai_report_hub', 'detail', report?.source, report?.id],
    enabled: !!report,
    queryFn: async () => {
      if (!report) return null;
      if (report.source === 'ai_insights') {
        const { data, error } = await sb.rpc('supervisory_ai_report_detail', { _id: report.id });
        if (error) throw error;
        return (data?.[0] ?? null) as any;
      }
      if (report.source === 'application_assessment') {
        const { data, error } = await sb
          .from('application_ai_assessments')
          .select(
            'id, summary, findings, risks, missing_information, sections, confidence_score, generated_at, model_name, status',
          )
          .eq('id', report.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      const { data, error } = await sb
        .from('fp_screening_runs')
        .select('id, status, started_at, completed_at, total_checks, total_hits, provider_outcomes, error')
        .eq('id', report.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return { ...query, retry: () => query.refetch() };
}

/** Which AI sources the current user may see at all (for honest empty states). */
export function useSupervisoryAiReportSources() {
  return useQuery({
    queryKey: ['ai_report_hub', 'sources'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('supervisory_ai_report_sources');
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const row of (data ?? []) as any[]) map[row.source] = !!row.available;
      return map;
    },
  });
}

/** A single report fetched by id — used for `?report=` deep links. */
export function useSupervisoryAiReportById(id: string | null) {
  return useQuery({
    queryKey: ['ai_report_hub', 'by-id', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.rpc('supervisory_ai_reports_index', {
        _modules: null,
        _analysis_types: null,
        _entity_id: null,
        _from: null,
        _to: null,
        _search: null,
        _include_failed: true,
        _confidence: null,
        _freshness: null,
        _limit: 100000,
        _offset: 0,
      });
      if (error) throw error;
      const row = ((data ?? []) as any[]).find((r) => r.id === id);
      return row ? toReport(row) : null;
    },
  });
}

/**
 * Every supervised entity the current user may see, with how many authorised AI
 * reports each one has (zero included). The filter dropdown uses this so it
 * lists the whole supervised population instead of only entities that happen to
 * have an analysis already.
 */
export function useSupervisoryAiReportEntityOptions() {
  const query = useQuery({
    queryKey: ['ai_report_hub', 'entity-options'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('supervisory_ai_report_entity_options');
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.entity_id as string,
        name: (r.entity_name as string) ?? 'Unnamed entity',
        count: Number(r.n ?? 0),
      }));
    },
    staleTime: 5 * 60_000,
  });

  return {
    entities: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => query.refetch(),
  };
}

/**
 * Every authorised AI report for one entity, regardless of module — the input
 * for the entity coverage view across the supervisory areas.
 */
export function useEntityAiCoverage(entityId: string | null) {
  const query = useQuery({
    queryKey: ['ai_report_hub', 'entity-coverage', entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<SupervisoryAiReport[]> => {
      const { data, error } = await sb.rpc('supervisory_ai_reports_index', {
        _modules: null,
        _analysis_types: null,
        _entity_id: entityId,
        _from: null,
        _to: null,
        _search: null,
        _include_failed: false,
        _confidence: null,
        _freshness: null,
        _limit: 500,
        _offset: 0,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map(toReport);
    },
  });

  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => query.refetch(),
  };
}
