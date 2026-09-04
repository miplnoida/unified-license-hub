/**
 * AML/CFT supervision read hooks.
 *
 * Every read goes through the canonical supervisory spine: the governed
 * read models (`aml_overview_metrics`, `aml_portfolio`, `aml_work_queue`,
 * `aml_entity_panel`) and the canonical stores (`supervisory_assessment`,
 * `supervisory_assessment_dimension`, `supervisory_finding`,
 * `supervisory_remediation_action`, `examinations`). Examinations and
 * findings/remediation are filtered views of those canonical models, never
 * AML-private tables.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export type AmlPortfolioRow = {
  entity_id: string;
  entity_name: string | null;
  sector_name: string | null;
  licence_reference: string | null;
  residual_rating: string | null;
  inherent_rating: string | null;
  control_rating: string | null;
  prior_rating: string | null;
  trend: string | null;
  last_review_date: string | null;
  next_review_date: string | null;
  assessment_current: boolean | null;
  last_assessment_id: string | null;
  last_assessment_reference: string | null;
  last_assessment_status: string | null;
  methodology_version: string | null;
  assigned_officer_id: string | null;
  assigned_officer_name: string | null;
  assigned_team_id: string | null;
  high_risk_dimensions: string[] | null;
  open_findings: number | null;
  critical_findings: number | null;
  overdue_remediation: number | null;
  active_examinations: number | null;
  reassessment_required: boolean | null;
};

export type AmlWorkQueueRow = {
  kind: string;
  id: string;
  entity_id: string | null;
  title: string | null;
  status: string | null;
  severity: string | null;
  due_at: string | null;
  href: string | null;
};

export function useAmlOverview() {
  return useQuery({
    queryKey: ['aml', 'overview'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_overview_metrics');
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });
}

export function useAmlPortfolio(limit = 200) {
  return useQuery({
    queryKey: ['aml', 'portfolio', limit],
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_portfolio', { _limit: limit });
      if (error) throw error;
      return (data ?? []) as AmlPortfolioRow[];
    },
  });
}

export function useAmlWorkQueue(limit = 200) {
  return useQuery({
    queryKey: ['aml', 'work-queue', limit],
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_work_queue', { _limit: limit });
      if (error) throw error;
      const names = await nameMap((data ?? []).map((r: any) => r.entity_id));
      return (data ?? []).map((r: any) => ({
        ...r,
        entity_name: names.get(r.entity_id) ?? null,
      })) as (AmlWorkQueueRow & { entity_name: string | null })[];
    },
  });
}

export function useAmlEntityPanel(entityId?: string) {
  return useQuery({
    queryKey: ['aml', 'entity-panel', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('aml_entity_panel', { _entity_id: entityId });
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
  });
}

async function nameMap(entityIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(entityIds.filter(Boolean))) as string[];
  if (!ids.length) return new Map<string, string>();
  const { data } = await sb.from('licensees').select('id, name').in('id', ids);
  return new Map<string, string>((data ?? []).map((r: any) => [r.id, r.name ?? '']));
}

export function useAmlAssessments() {
  return useQuery({
    queryKey: ['aml', 'assessments'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('supervisory_assessment')
        .select(
          'id, reference, entity_id, assessment_type, trigger_type, status, period_start, period_end, ' +
            'methodology_version, residual_rating, inherent_rating, control_rating, is_current, ' +
            'owner_id, submitted_at, approved_at, approved_by, confidentiality, created_at',
        )
        .eq('domain_code', 'AML_CFT')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const names = await nameMap((data ?? []).map((r: any) => r.entity_id));
      return (data ?? []).map((r: any) => ({ ...r, entity_name: names.get(r.entity_id) ?? null }));
    },
  });
}

/**
 * Server-paged AML/CFT assessment register.
 *
 * Real backend paging through `aml_assessment_page`: the filtered population,
 * the count, the supervisory ordering and the range are all executed by the
 * database. Risk sorts by supervisory ordinal and status by workflow order —
 * never by the alphabetical value of the stored string — and the register never
 * fetches a whole table to slice it locally.
 *
 * Sort keys are whitelisted on both sides; an unknown key falls back to the
 * canonical `created_at desc` ordering.
 */
export const AML_ASSESSMENT_SORT_KEYS = [
  'reference',
  'type',
  'status',
  'residual',
  'period',
  'created_at',
  'approved_at',
  'entity',
] as const;

export interface AmlAssessmentPageArgs {
  page: number;
  pageSize: number;
  sortKey?: string | null;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  status?: string | null;
}

export interface AmlPagedResult<T = any> {
  rows: T[];
  totalCount: number;
}

function pagedArgs(args: {
  page: number;
  pageSize: number;
  sortKey?: string | null;
  sortDirection?: 'asc' | 'desc';
  search?: string;
}) {
  return {
    _page: Math.max(1, args.page),
    _page_size: args.pageSize,
    _sort_key: args.sortKey ?? null,
    _sort_direction: args.sortDirection ?? null,
    _search: args.search?.trim() ? args.search.trim() : null,
  };
}

async function pagedRpc<T = any>(fn: string, params: Record<string, unknown>): Promise<AmlPagedResult<T>> {
  const { data, error } = await sb.rpc(fn, params);
  if (error) throw error;
  const payload = (data ?? {}) as any;
  return { rows: (payload.rows ?? []) as T[], totalCount: Number(payload.total_count ?? 0) };
}

export function useAmlAssessmentsPage(args: AmlAssessmentPageArgs) {
  const { page, pageSize, sortKey, sortDirection = 'desc', search = '', status = null } = args;
  return useQuery({
    queryKey: ['aml', 'assessments', 'page', page, pageSize, sortKey, sortDirection, search.trim(), status],
    queryFn: () =>
      pagedRpc('aml_assessment_page', {
        ...pagedArgs({ page, pageSize, sortKey, sortDirection, search }),
        _status: status,
      }),
  });
}


/** Distinct statuses present in the AML/CFT assessment register (server-derived). */
export function useAmlAssessmentStatuses() {
  return useQuery({
    queryKey: ['aml', 'assessment-statuses'],
    staleTime: 300_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb
        .from('supervisory_assessment')
        .select('status')
        .eq('domain_code', 'AML_CFT')
        .limit(1000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => String(r.status)).filter(Boolean))).sort() as string[];
    },
  });
}

export function useAmlAssessment(assessmentId?: string) {
  return useQuery({
    queryKey: ['aml', 'assessment', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      // The AML workspace may only resolve AML/CFT assessments. Supplying the
      // UUID of a prudential or market-conduct assessment must not open it here
      // (the backend scope stays authoritative on top of this filter).
      const { data: header, error } = await sb
        .from('supervisory_assessment')
        .select('*')
        .eq('id', assessmentId)
        .eq('domain_code', 'AML_CFT')
        .maybeSingle();
      if (error) throw error;
      if (!header) return null;

      const [{ data: dims }, { data: methodology }, { data: findings }, { data: originRows }, { data: attention }] =
        await Promise.all([
          sb
            .from('supervisory_assessment_dimension')
            .select('*')
            .eq('assessment_id', assessmentId)
            .order('dimension_group', { ascending: true })
            .order('dimension_code', { ascending: true }),
          sb
            .from('supervisory_methodology')
            .select('id, code, name, version, status, domain_code')
            .eq('id', header.methodology_id)
            .maybeSingle(),
          sb
            .from('supervisory_finding')
            .select('id, reference, title, severity, status, due_date, examination_id')
            .eq('assessment_id', assessmentId)
            .order('created_at', { ascending: false }),
          // Exact provenance: examinations that record THIS assessment as their
          // origin. Never inferred from "same entity + AML domain".
          sb
            .from('examination_origin')
            .select('examination_id, assessment_id, assessment_dimension_id, origin_role, note')
            .eq('assessment_id', assessmentId),
          sb
            .from('supervisory_attention_origin')
            .select('attention_id, assessment_dimension_id, signal_id')
            .eq('assessment_id', assessmentId),
        ]);

      const names = await nameMap([header.entity_id]);
      const attentionIds = Array.from(
        new Set((attention ?? []).map((a: any) => a.attention_id).filter(Boolean)),
      ) as string[];
      let attentionRows: any[] = [];
      let plans: any[] = [];
      if (attentionIds.length) {
        const [{ data: att }, { data: pl }] = await Promise.all([
          sb
            .from('supervisory_attention')
            .select('id, reference, title, materiality, urgency, status, confirmed_priority')
            .in('id', attentionIds),
          sb
            .from('supervisory_plan')
            .select('id, reference, title, status, priority, attention_id')
            .in('attention_id', attentionIds),
        ]);
        attentionRows = att ?? [];
        plans = pl ?? [];
      }

      const planIds = plans.map((p: any) => p.id);
      const dimById = new Map<string, any>((dims ?? []).map((d: any) => [d.id, d]));

      /* Interventions belonging to the plans this assessment drove. */
      let interventions: any[] = [];
      if (planIds.length) {
        const { data: iv } = await sb
          .from('supervisory_intervention')
          .select(
            'id, reference, title, intervention_type, status, plan_id, attention_id, examination_id, planned_start, planned_end, basis, expected_outcome, decision_rationale',
          )
          .in('plan_id', planIds)
          .order('created_at', { ascending: false });
        interventions = iv ?? [];
      }

      /* Examinations that record THIS assessment as their exact origin. */
      const origins = (originRows ?? []) as any[];
      const examIds = Array.from(new Set(origins.map((o) => o.examination_id).filter(Boolean))) as string[];
      let examinations: any[] = [];
      if (examIds.length) {
        const [{ data: ex }, { data: scope }] = await Promise.all([
          sb
            .from('examinations')
            .select(
              'id, reference, title, stage, engagement_type, examination_type, risk_rating, fieldwork_start, fieldwork_end, lead_examiner_id, intervention_id, plan_id, closed_at',
            )
            .in('id', examIds)
            .order('created_at', { ascending: false }),
          sb
            .from('examination_scope_dimension')
            .select('examination_id, assessment_id, assessment_dimension_id, dimension_code, residual_rating')
            .in('examination_id', examIds),
        ]);
        examinations = (ex ?? []).map((e: any) => {
          const own = origins.filter((o) => o.examination_id === e.id);
          return {
            ...e,
            origin_roles: Array.from(new Set(own.map((o) => o.origin_role))),
            is_driving_assessment: own.some((o) => o.origin_role === 'DRIVING_ASSESSMENT'),
            risk_focus_dimensions: own
              .filter((o) => o.origin_role === 'RISK_FOCUS' && o.assessment_dimension_id)
              .map((o) => dimById.get(o.assessment_dimension_id)?.dimension_code ?? '—'),
            scope_dimensions: (scope ?? []).filter((s: any) => s.examination_id === e.id),
          };
        });
      }

      const { data: history } = await sb
        .from('supervisory_assessment_event')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: true });

      return {
        header: { ...header, entity_name: names.get(header.entity_id) ?? null },
        dimensions: dims ?? [],
        methodology: methodology ?? null,
        findings: findings ?? [],
        examinations,
        interventions,
        attention: attentionRows,
        plans,
        history: history ?? [],
      };
    },
  });
}

/**
 * AML/CFT examination register.
 *
 * Reads the canonical `examinations` store filtered to the AML/CFT domain and
 * joins the canonical provenance (`examination_origin` — exact
 * DRIVING_ASSESSMENT / RISK_FOCUS rows), the canonical scope dimensions and
 * the canonical work stores (data requests, workpapers, findings, team) so the
 * register can show real supervisory state instead of a bare stage label.
 * Provenance is never inferred from "same entity + AML domain".
 */
export function useAmlExaminations() {
  return useQuery({
    queryKey: ['aml', 'examinations', 'register'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('examinations')
        .select(
          'id, reference, title, entity_id, engagement_type, examination_type, stage, risk_rating, ' +
            'fieldwork_start, fieldwork_end, period_under_review_start, period_under_review_end, ' +
            'lead_examiner_id, closed_at, intervention_id, plan_id, trigger_type, ' +
            'reassessment_required, created_at',
        )
        .eq('domain_code', 'AML_CFT')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return enrichExaminations((data ?? []) as any[]);
    },
  });
}

/**
 * Canonical examination enrichment for the AML/CFT register.
 *
 * Joins the canonical provenance, scope, work and team stores for the supplied
 * rows only, in set-based batches (never one query per row).
 */
async function enrichExaminations(rows: any[]) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];

    const [names, origins, scope, requests, workpapers, findings, team, plans, interventions] =
      await Promise.all([
        nameMap(rows.map((r) => r.entity_id)),
        sb
          .from('examination_origin')
          .select('examination_id, assessment_id, assessment_dimension_id, attention_id, origin_role')
          .in('examination_id', ids),
        sb
          .from('examination_scope_dimension')
          .select('examination_id, dimension_code, residual_rating')
          .in('examination_id', ids),
        sb.from('examination_data_requests').select('examination_id, status, due_date').in('examination_id', ids),
        sb.from('examination_workpapers').select('examination_id, status').in('examination_id', ids),
        // Canonical findings only. `examination_findings` is historical
        // pre-spine data and must never drive current AML counters.
        sb
          .from('supervisory_finding')
          .select('examination_id, status, severity')
          .eq('domain_code', 'AML_CFT')
          .in('examination_id', ids),
        sb.from('examination_team_members').select('examination_id, user_id, ended_at').in('examination_id', ids),
        sb
          .from('supervisory_plan')
          .select('id, reference, status')
          .in('id', Array.from(new Set(rows.map((r) => r.plan_id).filter(Boolean)))),
        sb
          .from('supervisory_intervention')
          .select('id, reference, intervention_type, status')
          .in('id', Array.from(new Set(rows.map((r) => r.intervention_id).filter(Boolean)))),
      ]);

    const assessmentIds = Array.from(
      new Set((origins.data ?? []).map((o: any) => o.assessment_id).filter(Boolean)),
    ) as string[];
    const assessments = assessmentIds.length
      ? (
          await sb
            .from('supervisory_assessment')
            .select('id, reference, residual_rating, status')
            .in('id', assessmentIds)
        ).data ?? []
      : [];
    const assessmentById = new Map(assessments.map((a: any) => [a.id, a]));
    const planById = new Map((plans?.data ?? []).map((p: any) => [p.id, p]));
    const interventionById = new Map((interventions?.data ?? []).map((i: any) => [i.id, i]));

    const examinerIds = Array.from(new Set(rows.map((r) => r.lead_examiner_id).filter(Boolean))) as string[];
    const examinerById = new Map<string, string>(
      examinerIds.length
        ? (((await sb.from('profiles').select('id, full_name').in('id', examinerIds)).data ?? []) as any[]).map(
            (p) => [p.id, p.full_name ?? ''],
          )
        : [],
    );


    const today = new Date().toISOString().slice(0, 10);
    const group = <T,>(list: T[] | null | undefined, key: (r: T) => string) => {
      const m = new Map<string, T[]>();
      (list ?? []).forEach((r) => {
        const k = key(r);
        m.set(k, [...(m.get(k) ?? []), r]);
      });
      return m;
    };

    const originByExam = group<any>(origins.data, (r) => r.examination_id);
    const scopeByExam = group<any>(scope.data, (r) => r.examination_id);
    const requestByExam = group<any>(requests.data, (r) => r.examination_id);
    const workpaperByExam = group<any>(workpapers.data, (r) => r.examination_id);
    const findingByExam = group<any>(findings.data, (r) => r.examination_id);
    const teamByExam = group<any>(team.data, (r) => r.examination_id);

    return rows.map((r) => {
      const exOrigins = originByExam.get(r.id) ?? [];
      const driving = exOrigins.find((o: any) => o.origin_role === 'DRIVING_ASSESSMENT') ?? null;
      const riskFocus = exOrigins.filter((o: any) => o.origin_role === 'RISK_FOCUS');
      const scopeRows = scopeByExam.get(r.id) ?? [];
      const rfis = requestByExam.get(r.id) ?? [];
      const wps = workpaperByExam.get(r.id) ?? [];
      const fnds = findingByExam.get(r.id) ?? [];
      const members = (teamByExam.get(r.id) ?? []).filter((m: any) => !m.ended_at);
      const drivingAssessment = driving?.assessment_id
        ? assessmentById.get(driving.assessment_id) ?? null
        : null;

      return {
        ...r,
        entity_name: names.get(r.entity_id) ?? null,
        lead_examiner_name: r.lead_examiner_id ? examinerById.get(r.lead_examiner_id) ?? null : null,
        driving_assessment_id: driving?.assessment_id ?? null,
        driving_assessment_reference: (drivingAssessment as any)?.reference ?? null,
        driving_assessment_rating: (drivingAssessment as any)?.residual_rating ?? null,
        risk_focus_dimension_count: riskFocus.length,
        attention_id: exOrigins.find((o: any) => o.attention_id)?.attention_id ?? null,
        plan_reference: (planById.get(r.plan_id) as any)?.reference ?? null,
        plan_status: (planById.get(r.plan_id) as any)?.status ?? null,
        intervention_reference: (interventionById.get(r.intervention_id) as any)?.reference ?? null,
        intervention_type: (interventionById.get(r.intervention_id) as any)?.intervention_type ?? null,
        scope_dimensions: scopeRows.map((s: any) => ({
          dimension_code: s.dimension_code,
          residual_rating: s.residual_rating,
        })),
        open_rfis: rfis.filter((d: any) => !['received', 'closed'].includes(String(d.status ?? '').toLowerCase()))
          .length,
        overdue_rfis: rfis.filter(
          (d: any) =>
            d.due_date &&
            d.due_date < today &&
            !['received', 'closed'].includes(String(d.status ?? '').toLowerCase()),
        ).length,
        workpapers_total: wps.length,
        workpapers_outstanding: wps.filter(
          (w: any) => String(w.status ?? '').toLowerCase() !== 'reviewed',
        ).length,
        findings_total: fnds.length,
        findings_open: fnds.filter(
          (f: any) => !['closed', 'withdrawn', 'superseded'].includes(String(f.status ?? '').toLowerCase()),
        ).length,
        findings_critical: fnds.filter((f: any) =>
          ['critical', 'high'].includes(String(f.severity ?? '').toLowerCase()),
        ).length,
        team_size: members.length,
      };
    });
}

export function useAmlFindings() {
  return useQuery({
    queryKey: ['aml', 'findings'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('supervisory_finding')
        .select(
          'id, reference, title, entity_id, finding_category, severity, status, response_state, ' +
            'due_date, response_target_date, assessment_id, examination_id, confidentiality, ' +
            'issued_at, closed_at, created_at',
        )
        .eq('domain_code', 'AML_CFT')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const findingIds = (data ?? []).map((r: any) => r.id);
      let actions: any[] = [];
      if (findingIds.length) {
        const { data: ra } = await sb
          .from('supervisory_remediation_action')
          .select('id, reference, finding_id, description, status, target_date, effectiveness, escalated_attention_id')
          .in('finding_id', findingIds);
        actions = ra ?? [];
      }
      const names = await nameMap((data ?? []).map((r: any) => r.entity_id));
      return (data ?? []).map((r: any) => ({
        ...r,
        entity_name: names.get(r.entity_id) ?? null,
        remediation: actions.filter((a) => a.finding_id === r.id),
      }));
    },
  });
}

/* ============================================================
 * Real server-paged AML/CFT registers.
 *
 * Each register below reads one page from an additive paged read contract in
 * the database (`aml_portfolio_page`, `aml_work_queue_page`,
 * `aml_examination_page`, `aml_finding_page`). The backend owns the filtered
 * population, the authoritative count, whitelisted sort keys, supervisory
 * risk/lifecycle ordinals and nulls-last ordering. The certified non-paged
 * readers (`aml_portfolio`, `aml_work_queue`, `supervisory_work_queue`) are
 * unchanged and still used by the overview surfaces.
 * ============================================================ */

export const AML_PORTFOLIO_SORT_KEYS = [
  'licence',
  'entity',
  'sector',
  'risk',
  'coverage',
  'review',
  'work',
] as const;

export const AML_WORK_QUEUE_SORT_KEYS = ['queue', 'reference', 'work_type', 'state', 'due', 'entity'] as const;

export const AML_EXAMINATION_SORT_KEYS = [
  'reference',
  'entity',
  'stage',
  'type_risk',
  'workload',
  'fieldwork',
  'created_at',
  'provenance',
] as const;

export const AML_FINDING_SORT_KEYS = [
  'reference',
  'entity',
  'severity',
  'status',
  'due_date',
  'issued_at',
] as const;

export interface AmlPageArgs {
  page: number;
  pageSize: number;
  sortKey?: string | null;
  sortDirection?: 'asc' | 'desc';
  search?: string;
}

/** AML/CFT supervised entities — server page over the certified portfolio model. */
export function useAmlPortfolioPage(
  args: AmlPageArgs & { rating?: string | null; coverage?: string | null; sector?: string | null },
) {
  const { page, pageSize, sortKey, sortDirection, search = '', rating = null, coverage = null, sector = null } = args;
  return useQuery({
    queryKey: ['aml', 'portfolio', 'page', page, pageSize, sortKey, sortDirection, search.trim(), rating, coverage, sector],
    queryFn: () =>
      pagedRpc<AmlPortfolioRow>('aml_portfolio_page', {
        ...pagedArgs({ page, pageSize, sortKey, sortDirection, search }),
        _rating: rating,
        _coverage: coverage,
        _sector: sector,
      }),
  });
}

/** Distinct residual ratings present in the AML/CFT portfolio (server-derived). */
export function useAmlPortfolioRatings() {
  return useQuery({
    queryKey: ['aml', 'portfolio-ratings'],
    staleTime: 300_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb
        .from('entity_risk_state')
        .select('residual_rating')
        .eq('domain_code', 'AML_CFT')
        .limit(1000);
      if (error) throw error;
      return Array.from(
        new Set((data ?? []).map((r: any) => String(r.residual_rating)).filter((v: string) => v && v !== 'null')),
      ).sort() as string[];
    },
  });
}

/**
 * AML/CFT work queue — server page over the single enterprise work model.
 *
 * The default `queue` ordering preserves supervisory queue semantics server
 * side (overdue first, then priority ordinal, then due date, then a
 * deterministic identifier). Scope counts come from the same contract.
 */
export function useAmlWorkQueuePage(
  args: AmlPageArgs & {
    scope: string;
    workType?: string | null;
    workState?: string | null;
    priority?: string | null;
    due?: string | null;
  },
) {
  const {
    page,
    pageSize,
    sortKey,
    sortDirection,
    search = '',
    scope,
    workType = null,
    workState = null,
    priority = null,
    due = null,
  } = args;
  return useQuery({
    queryKey: [
      'aml', 'work-queue', 'page', page, pageSize, sortKey, sortDirection, search.trim(), scope, workType, workState, priority, due,
    ],
    queryFn: async (): Promise<AmlPagedResult & { counts: Record<string, number> }> => {
      const { data, error } = await sb.rpc('aml_work_queue_page', {
        ...pagedArgs({ page, pageSize, sortKey, sortDirection, search }),
        _scope: scope,
        _work_type: workType,
        _work_state: workState,
        _priority: priority,
        _due: due,
      });
      if (error) throw error;
      const payload = (data ?? {}) as any;
      return {
        rows: (payload.rows ?? []) as any[],
        totalCount: Number(payload.total_count ?? 0),
        counts: (payload.counts ?? {}) as Record<string, number>,
      };
    },
  });
}

/** Distinct AML/CFT work types present in the enterprise work model. */
export function useAmlWorkTypes() {
  return useQuery({
    queryKey: ['aml', 'work-types'],
    staleTime: 300_000,
    queryFn: async (): Promise<Array<[string, string]>> => {
      const { data, error } = await sb
        .from('supervisory_work_item')
        .select('work_type, work_type_label')
        .eq('domain_code', 'AML_CFT')
        .limit(2000);
      if (error) throw error;
      return Array.from(
        new Map((data ?? []).map((r: any) => [String(r.work_type), String(r.work_type_label ?? r.work_type)])).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1]));
    },
  });
}

/**
 * AML/CFT examination register — server page over the canonical `examinations`
 * store, then canonical provenance/work enrichment for that page only.
 */
export function useAmlExaminationsPage(
  args: AmlPageArgs & {
    stage?: string | null;
    risk?: string | null;
    leadExaminer?: string | null;
    openOnly?: boolean;
    fieldworkFrom?: string | null;
    fieldworkTo?: string | null;
  },
) {
  const {
    page,
    pageSize,
    sortKey,
    sortDirection,
    search = '',
    stage = null,
    risk = null,
    leadExaminer = null,
    openOnly = false,
    fieldworkFrom = null,
    fieldworkTo = null,
  } = args;
  return useQuery({
    queryKey: [
      'aml', 'examinations', 'page', page, pageSize, sortKey, sortDirection, search.trim(), stage, risk, leadExaminer, openOnly, fieldworkFrom, fieldworkTo,
    ],
    queryFn: async (): Promise<AmlPagedResult> => {
      const { data, error } = await sb.rpc('aml_examination_page', {
        ...pagedArgs({ page, pageSize, sortKey, sortDirection, search }),
        _stage: stage,
        _risk: risk,
        _lead_examiner: leadExaminer,
        _open_only: openOnly,
        _fieldwork_from: fieldworkFrom,
        _fieldwork_to: fieldworkTo,
      });
      if (error) throw error;
      const payload = (data ?? {}) as any;
      const rows = (payload.rows ?? []) as any[];
      return { rows: await enrichExaminations(rows), totalCount: Number(payload.total_count ?? 0) };
    },
  });
}

/** Distinct AML/CFT examination stages present in the canonical store. */
export function useAmlExaminationStages() {
  return useQuery({
    queryKey: ['aml', 'examination-stages'],
    staleTime: 300_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb
        .from('examinations')
        .select('stage')
        .eq('domain_code', 'AML_CFT')
        .limit(2000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => String(r.stage)).filter(Boolean))).sort() as string[];
    },
  });
}

/**
 * AML/CFT findings & remediation — server page. Remediation actions required by
 * the cards are returned by the same contract, so the card UX keeps its full
 * remediation detail without a per-finding query.
 */
export function useAmlFindingsPage(
  args: AmlPageArgs & { severity?: string | null; status?: string | null; view?: string | null },
) {
  const { page, pageSize, sortKey, sortDirection, search = '', severity = null, status = null, view = null } = args;
  return useQuery({
    queryKey: ['aml', 'findings', 'page', page, pageSize, sortKey, sortDirection, search.trim(), severity, status, view],
    queryFn: () =>
      pagedRpc('aml_finding_page', {
        ...pagedArgs({ page, pageSize, sortKey, sortDirection, search }),
        _severity: severity,
        _status: status,
        _view: view,
      }),
  });
}

/** Distinct AML/CFT finding severities present in the canonical store. */
export function useAmlFindingSeverities() {
  return useQuery({
    queryKey: ['aml', 'finding-severities'],
    staleTime: 300_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb
        .from('supervisory_finding')
        .select('severity')
        .eq('domain_code', 'AML_CFT')
        .limit(2000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => String(r.severity)).filter(Boolean))).sort() as string[];
    },
  });
}
