/**
 * Read layer for the Supervisory AI Reports hub.
 *
 * One query per AI source so each source has its own loading / empty / error
 * state (a failed source must never render as "0 reports"). Nothing here
 * generates AI analysis or writes to a supervisory table.
 *
 *  - advisory `ai_insights` → via `supervisory_ai_reports_list`, which applies
 *    the hardened per-module + contributing-source visibility rules
 *  - licensing → `application_ai_assessments` (application-scoped RLS)
 *  - Fit & Proper → `fp_screening_runs` of type `ai_media` (FPA RLS)
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import {
  deriveFreshness,
  hubModuleFromInsight,
  isUsableProviderState,
  sourceRouteFor,
  analysisTypeLabel,
  type HubModule,
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
  page: number;
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
  page: 0,
  pageSize: 25,
};

interface SourceState {
  isLoading: boolean;
  isError: boolean;
  reports: SupervisoryAiReport[];
}

/** Subject metadata resolved from authoritative records (never AI content). */
interface SubjectInfo {
  name?: string | null;
  reference?: string | null;
  updatedAt?: string | null;
}

function withinRange(iso: string | null | undefined, from: string | null, to: string | null) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

export function useSupervisoryAiReports(filters: ReportFilters) {
  const qc = useQueryClient();
  const { hasModuleAccess, isAssignmentOnly, isLoading: permsLoading } = useUserDynamicPermissions();

  const canLicensing = !isAssignmentOnly && hasModuleAccess('application_management');
  const canFpa = !isAssignmentOnly && hasModuleAccess('fit_and_proper');

  const insightsKey = [
    'ai_report_hub',
    'insights',
    filters.modules.join(','),
    filters.analysisTypes.join(','),
    filters.entityId,
    filters.from,
    filters.to,
    filters.search,
    filters.includeFailed,
    filters.page,
    filters.pageSize,
  ];

  const insightsQuery = useQuery({
    queryKey: insightsKey,
    enabled: !permsLoading && !isAssignmentOnly,
    queryFn: async () => {
      const insightModules = filters.modules.filter(
        (m) => m !== 'licensing' && m !== 'fit_proper',
      );
      const { data, error } = await sb.rpc('supervisory_ai_reports_list', {
        _modules: insightModules.length ? insightModules : null,
        _analysis_types: filters.analysisTypes.length ? filters.analysisTypes : null,
        _entity_id: filters.entityId,
        _from: filters.from,
        _to: filters.to,
        _search: filters.search || null,
        _include_failed: filters.includeFailed,
        _limit: filters.pageSize,
        _offset: filters.page * filters.pageSize,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const licensingQuery = useQuery({
    queryKey: ['ai_report_hub', 'licensing', filters.from, filters.to, filters.search, filters.includeFailed],
    enabled: !permsLoading && canLicensing,
    queryFn: async () => {
      let q = sb
        .from('application_ai_assessments')
        .select(
          'id, application_id, status, summary, confidence_score, generated_at, created_at, model_name, applications(application_number, updated_at)',
        )

        .order('generated_at', { ascending: false })
        .limit(200);
      if (filters.from) q = q.gte('generated_at', filters.from);
      if (filters.to) q = q.lte('generated_at', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const fpaQuery = useQuery({
    queryKey: ['ai_report_hub', 'fpa', filters.from, filters.to, filters.includeFailed],
    enabled: !permsLoading && canFpa,
    queryFn: async () => {
      let q = sb
        .from('fp_screening_runs')
        .select('id, assessment_id, individual_id, status, started_at, completed_at, total_checks, total_hits')
        .eq('run_type', 'ai_media')
        .order('completed_at', { ascending: false })
        .limit(200);
      if (filters.from) q = q.gte('started_at', filters.from);
      if (filters.to) q = q.lte('started_at', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const insightRows = insightsQuery.data ?? [];

  /** Authoritative subject lookups for the rows currently on screen. */
  const subjectIds = useMemo(() => {
    const byModule: Record<string, Set<string>> = {};
    for (const r of insightRows) {
      const id = r.scope_id ?? r.object_id ?? r.entity_id;
      if (!id) continue;
      const m = hubModuleFromInsight(r.module);
      byModule[m] = byModule[m] ?? new Set();
      byModule[m].add(id);
    }
    return byModule;
  }, [insightRows]);

  const subjectsQuery = useQuery({
    queryKey: ['ai_report_hub', 'subjects', JSON.stringify(
      Object.fromEntries(Object.entries(subjectIds).map(([k, v]) => [k, [...v].sort()])),
    )],
    enabled: Object.keys(subjectIds).length > 0,
    queryFn: async () => {
      const map: Record<string, SubjectInfo> = {};
      const ids = (m: string) => [...(subjectIds[m] ?? new Set<string>())];

      const licenseeIds = [
        ...new Set([...ids('prudential'), ...ids('cross_module'), ...ids('conduct')]),
      ];
      const tasks: Promise<void>[] = [];

      if (licenseeIds.length) {
        tasks.push(
          (async () => {
            const { data } = await sb.from('licensees').select('id, name, updated_at').in('id', licenseeIds);
            for (const row of data ?? []) map[row.id] = { name: row.name, updatedAt: row.updated_at };
          })(),
        );
      }
      if (ids('examination').length) {
        tasks.push(
          (async () => {
            const { data } = await sb
              .from('examinations')
              .select('id, reference, title, entity_id, updated_at')
              .in('id', ids('examination'));
            for (const row of data ?? [])
              map[row.id] = { name: row.title, reference: row.reference, updatedAt: row.updated_at };
          })(),
        );
      }
      if (ids('complaints').length) {
        tasks.push(
          (async () => {
            const { data } = await sb
              .from('complaints')
              .select('id, complaint_number, subject, updated_at')
              .in('id', ids('complaints'));
            for (const row of data ?? [])
              map[row.id] = { name: row.subject, reference: row.complaint_number, updatedAt: row.updated_at };
          })(),
        );
      }
      if (ids('enforcement').length) {
        tasks.push(
          (async () => {
            const { data } = await sb
              .from('enforcement_actions')
              .select('id, case_number, entity_id, updated_at')
              .in('id', ids('enforcement'));
            for (const row of data ?? [])
              map[row.id] = { reference: row.case_number, updatedAt: row.updated_at };
          })(),
        );
      }
      await Promise.allSettled(tasks);
      return map;
    },
  });

  const subjects = subjectsQuery.data ?? {};

  const insights: SourceState = useMemo(() => {
    const reports = insightRows.map((r): SupervisoryAiReport => {
      const module = hubModuleFromInsight(r.module);
      const recordId = r.scope_id ?? r.object_id ?? r.entity_id ?? null;
      const subject = (recordId && subjects[recordId]) || {};
      const { route, label } = sourceRouteFor({ module, scope: r.scope, recordId });
      return {
        id: r.id,
        source: 'ai_insights',
        module,
        analysisType: r.analysis_type,
        title: r.title || analysisTypeLabel(r.analysis_type),
        summary: r.summary,
        entityId: r.entity_id ?? (module !== 'examination' ? recordId : null),
        entityName: subject.name ?? null,
        recordId,
        recordReference: subject.reference ?? null,
        periodKey: r.period_key,
        generatedAt: r.generated_at,
        generatedBy: r.generated_by,
        confidence: r.confidence,
        providerState: r.provider_state,
        freshness: deriveFreshness(r.generated_at, subject.updatedAt),
        limitedEvidence: !!r.insufficient_evidence || r.confidence === 'limited',
        flagged: r.feedback === 'flagged',
        feedback: r.feedback,
        sourceRoute: route,
        sourceActionLabel: label,
      };
    });
    return { isLoading: insightsQuery.isLoading, isError: insightsQuery.isError, reports };
  }, [insightRows, subjects, insightsQuery.isLoading, insightsQuery.isError]);

  const licensing: SourceState = useMemo(() => {
    const rows = licensingQuery.data ?? [];
    const reports = rows
      .filter((r) => (filters.includeFailed ? true : r.status === 'completed' || r.status === 'ready'))
      .map((r): SupervisoryAiReport => {
        const app = r.applications ?? {};
        const { route, label } = sourceRouteFor({ module: 'licensing', recordId: r.application_id });
        const confidence =
          typeof r.confidence_score === 'number'
            ? r.confidence_score >= 0.75
              ? 'high'
              : r.confidence_score >= 0.5
                ? 'moderate'
                : 'limited'
            : null;
        return {
          id: r.id,
          source: 'application_assessment',
          module: 'licensing',
          analysisType: 'application_assessment',
          title: analysisTypeLabel('application_assessment'),
          summary: r.summary,
          entityId: null,
          entityName: null,
          recordId: r.application_id,
          recordReference: app.application_number ?? null,
          generatedAt: r.generated_at ?? r.created_at,
          confidence,
          providerState: r.status === 'completed' ? 'live' : r.status,
          freshness: deriveFreshness(r.generated_at, app.updated_at),
          limitedEvidence: confidence === 'limited',
          sourceRoute: route,
          sourceActionLabel: label,
        };
      });
    return { isLoading: licensingQuery.isLoading, isError: licensingQuery.isError, reports };
  }, [licensingQuery.data, licensingQuery.isLoading, licensingQuery.isError, filters.includeFailed]);

  const fpa: SourceState = useMemo(() => {
    const rows = fpaQuery.data ?? [];
    const reports = rows
      .filter((r) => (filters.includeFailed ? true : r.status === 'completed'))
      .map((r): SupervisoryAiReport => {
        const { route, label } = sourceRouteFor({ module: 'fit_proper', recordId: r.assessment_id });
        return {
          id: r.id,
          source: 'fpa',
          module: 'fit_proper',
          analysisType: 'fp_ai_media_screening',
          title: analysisTypeLabel('fp_ai_media_screening'),
          summary:
            r.total_hits != null && r.total_checks != null
              ? `${r.total_hits} potential adverse-media match(es) from ${r.total_checks} check(s).`
              : null,
          recordId: r.assessment_id,
          recordReference: null,
          generatedAt: r.completed_at ?? r.started_at,
          providerState: r.status === 'completed' ? 'live' : r.status,
          freshness: 'unknown',
          limitedEvidence: false,
          sourceRoute: route,
          sourceActionLabel: label,
        };
      });
    return { isLoading: fpaQuery.isLoading, isError: fpaQuery.isError, reports };
  }, [fpaQuery.data, fpaQuery.isLoading, fpaQuery.isError, filters.includeFailed]);

  /** Merge + client-side filters that cannot be pushed to each source. */
  const reports = useMemo(() => {
    const wantModule = (m: HubModule) => !filters.modules.length || filters.modules.includes(m);
    const term = filters.search.trim().toLowerCase();
    const all = [...insights.reports, ...licensing.reports, ...fpa.reports]
      .filter((r) => wantModule(r.module))
      .filter((r) => (filters.entityId ? r.entityId === filters.entityId || r.recordId === filters.entityId : true))
      .filter((r) =>
        r.source === 'ai_insights' ? true : filters.from || filters.to ? withinRange(r.generatedAt, filters.from, filters.to) : true,
      )
      .filter((r) => (filters.includeFailed ? true : isUsableProviderState(r.providerState)))
      .filter((r) => (filters.confidence ? r.confidence === filters.confidence : true))
      .filter((r) => (filters.freshness ? r.freshness === filters.freshness : true))
      .filter((r) => (filters.analysisTypes.length ? filters.analysisTypes.includes(r.analysisType) : true))
      .filter((r) =>
        !term || r.source === 'ai_insights'
          ? true
          : [r.title, r.summary, r.entityName, r.recordReference]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(term)),
      );

    // De-duplicate on the persistent record id.
    const seen = new Set<string>();
    const unique = all.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    unique.sort((a, b) => new Date(b.generatedAt ?? 0).getTime() - new Date(a.generatedAt ?? 0).getTime());
    return unique;
  }, [insights.reports, licensing.reports, fpa.reports, filters]);

  /** Latest per subject + analysis type; older ones become history. */
  const grouped = useMemo(() => {
    const byKey = new Map<string, SupervisoryAiReport[]>();
    for (const r of reports) {
      const key = `${r.module}|${r.analysisType}|${r.recordId ?? 'none'}`;
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }
    return [...byKey.values()].map((list) => ({ latest: list[0], history: list.slice(1) }));
  }, [reports]);

  const counts = useMemo(() => {
    const byModule = {} as Record<HubModule, number>;
    for (const r of reports) byModule[r.module] = (byModule[r.module] ?? 0) + 1;
    const weekAgo = Date.now() - 7 * 864e5;
    return {
      total: reports.length,
      recent: reports.filter((r) => r.generatedAt && new Date(r.generatedAt).getTime() >= weekAgo).length,
      outdated: reports.filter((r) => r.freshness === 'outdated').length,
      limited: reports.filter((r) => r.limitedEvidence).length,
      byModule,
    };
  }, [reports]);

  const entities = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reports) {
      if (r.entityId && r.entityName) map.set(r.entityId, r.entityName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [reports]);

  const analysisTypes = useMemo(
    () => [...new Set(reports.map((r) => r.analysisType))].sort(),
    [reports],
  );

  const insightsTotal = insightRows[0]?.total_count ? Number(insightRows[0].total_count) : insightRows.length;

  return {
    reports,
    grouped,
    counts,
    entities,
    analysisTypes,
    insightsTotal,
    hasMore: (filters.page + 1) * filters.pageSize < insightsTotal,
    isLoading: permsLoading || insights.isLoading || licensing.isLoading || fpa.isLoading,
    sources: {
      insights: { isError: insights.isError, isLoading: insights.isLoading, enabled: !isAssignmentOnly },
      licensing: { isError: licensing.isError, isLoading: licensing.isLoading, enabled: canLicensing },
      fpa: { isError: fpa.isError, isLoading: fpa.isLoading, enabled: canFpa },
    },
    retry: (source: 'insights' | 'licensing' | 'fpa') => {
      if (source === 'insights') qc.invalidateQueries({ queryKey: ['ai_report_hub', 'insights'] });
      if (source === 'licensing') qc.invalidateQueries({ queryKey: ['ai_report_hub', 'licensing'] });
      if (source === 'fpa') qc.invalidateQueries({ queryKey: ['ai_report_hub', 'fpa'] });
    },
  };
}

/** Full payload for one report, fetched only when the user opens it. */
export function useSupervisoryAiReportDetail(report: SupervisoryAiReport | null) {
  return useQuery({
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
          .select('id, summary, findings, risks, missing_information, sections, confidence_score, generated_at, model_name, status')
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
}
