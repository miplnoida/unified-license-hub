import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logComplianceAudit } from '@/lib/complianceAudit';
import { authorizedAction } from '@/lib/rbac/authorizedAction';
import {
  prudentialAssessmentCreate,
  prudentialAssessmentSaveDraft,
  prudentialAssessmentTransition,
  prudentialActionIssue,
  prudentialActionUpdate,
  prudentialEscalationRaise,
  prudentialEscalationDecide,
  prudentialTaxonomySave,
  prudentialStressIndicatorSave,
  prudentialStressIndicatorDelete,
  prudentialStressEventAcknowledge,
  prudentialFeedLogRecord,
} from '@/lib/prudentialGovernedOps';
import { worstSeverity, normalizeSeverity } from '@/lib/prudentialSeverity';


const sb = supabase as any;

// Fire-and-forget audit + notification helpers. Never block UI on failure.
async function audit(
  action_type: Parameters<typeof logComplianceAudit>[0]['action_type'],
  object_type: string,
  object_id: string | null | undefined,
  before: any = null,
  after: any = null,
  justification?: string | null,
) {
  try {
    await logComplianceAudit({
      action_type,
      object_type,
      object_id: object_id ?? null,
      before_value: before,
      after_value: after,
      justification: justification ?? null,
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[prudential audit] failed', e);
  }
}

async function fetchAssessmentLicenseeNames(entityIds: string[]) {
  const uniqueIds = Array.from(new Set(entityIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, { name: string | null }>();

  const { data, error } = await sb.from('licensees').select('id, name').in('id', uniqueIds);
  if (error) throw error;

  return new Map<string, { name: string | null }>((data ?? []).map((licensee: any) => [licensee.id, { name: licensee.name ?? null }]));
}

function normalizeAssessmentLicensee<T extends { entity_id?: string; licensee?: any; licensees?: any }>(row: T, licenseeMap?: Map<string, { name: string | null }>) {
  const licensee = row.licensee ?? row.licensees ?? (row.entity_id ? licenseeMap?.get(row.entity_id) : null) ?? null;
  return {
    ...row,
    licensee,
    licensees: licensee,
  };
}

async function attachAssessmentLicensees<T extends { entity_id?: string; licensee?: any; licensees?: any }>(rows: T[]) {
  const missingIds = rows.filter(row => !row.licensee && !row.licensees && row.entity_id).map(row => row.entity_id as string);
  const licenseeMap = await fetchAssessmentLicenseeNames(missingIds);
  return rows.map(row => normalizeAssessmentLicensee(row, licenseeMap));
}

// ---------- Types ----------
export interface RiskTaxonomy { id: string; code: string; label: string; description: string | null; parent_id: string | null; sort_order: number; is_active: boolean; }
export interface PrudentialAssessment {
  id: string; entity_id: string; return_id: string | null; period_start: string | null; period_end: string | null;
  overall_rating: string | null; ratings: Record<string, string>; rationale: string | null; evidence_refs: any[];
  conclusion: string | null; recommended_response: string | null; status: 'draft'|'submitted'|'reviewed'|'approved'|'closed';
  override_reason: string | null; auto_suggested_rating: string | null;
  review_notes?: string | null; signal_snapshot?: any | null;
  created_by: string | null; reviewed_by: string | null; approved_by: string | null;
  submitted_at: string | null; reviewed_at: string | null; approved_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string;
}
type PrudentialAssessmentWithLicensee = PrudentialAssessment & {
  licensee?: { name: string | null } | null;
  licensees?: { name: string | null } | null;
};

const ASSESSMENT_WRITE_COLUMNS = new Set([
  'id',
  'entity_id',
  'return_id',
  'period_start',
  'period_end',
  'overall_rating',
  'ratings',
  'rationale',
  'evidence_refs',
  'conclusion',
  'recommended_response',
  'status',
  'override_reason',
  'auto_suggested_rating',
  'created_by',
  'reviewed_by',
  'approved_by',
  'submitted_at',
  'reviewed_at',
  'approved_at',
  'closed_at',
  'review_notes',
  'signal_snapshot',
]);

function sanitizeAssessmentWritePayload(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => ASSESSMENT_WRITE_COLUMNS.has(key)));
}
export interface PrudentialAction {
  id: string; entity_id: string; source_type: string; source_id: string | null;
  action_type: string; title: string; description: string | null;
  severity: 'low'|'medium'|'high'|'critical'; due_date: string | null;
  assigned_to: string | null; entity_contact: string | null;
  status: 'open'|'in_progress'|'overdue'|'completed'|'waived'|'cancelled';
  completion_notes: string | null; waiver_reason: string | null;
  closed_at: string | null; closed_by: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}
export interface PrudentialEscalation {
  id: string; entity_id: string; related_type: 'entity'|'return'|'assessment'|'action'; related_id: string | null;
  escalation_type: string; reason: string | null; evidence: any[];
  status: 'open'|'under_review'|'resolved'|'withdrawn'; decision: string | null; outcome: string | null;
  decision_by: string | null; decided_at: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}
export interface StressIndicator {
  id: string; metric_key: string; label: string; taxonomy_code: string | null;
  threshold_value: number; direction: 'gt'|'lt'|'gte'|'lte'|'eq';
  severity: 'low'|'medium'|'high'|'critical';
  sector_id: string | null; sub_sector_id: string | null;
  is_active: boolean; notify_roles: string[]; escalate: boolean;
  created_at: string; updated_at: string;
}
export interface StressEvent { id: string; indicator_id: string; entity_id: string | null; return_id: string | null; observed_value: number | null; triggered_at: string; resolved_at: string | null; notified: boolean; }
export interface FeedLog { id: string; source: string; feed_type: string; status: 'started'|'success'|'failed'|'retried'; row_count: number | null; error: string | null; started_at: string; completed_at: string | null; related_return_id: string | null; triggered_by: string | null; metadata: any; }

// ---------- Taxonomy ----------
export function useRiskTaxonomy() {
  return useQuery({
    queryKey: ['prudential_risk_taxonomy'],
    queryFn: async () => {
      const { data, error } = await sb.from('prudential_risk_taxonomy').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as RiskTaxonomy[];
    },
  });
}
export function useUpsertTaxonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<RiskTaxonomy>) => {
      const { id, ...payload } = row;
      // Governed operation: authority, validation and the single audit entry are
      // all derived server-side. Never write prudential_risk_taxonomy directly.
      await prudentialTaxonomySave(payload as Record<string, unknown>, id ?? null);
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_risk_taxonomy'] }); toast.success('Taxonomy saved'); },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (/duplicate key|unique constraint/i.test(msg)) {
        toast.error('A risk category with this code already exists.');
        return;
      }
      toast.error(msg || 'Failed');
    },
  });
}
export function useDeleteTaxonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await authorizedAction('prudential_supervision', 'edit', { taxonomy_id: id, deactivate: true });
      const { error } = await sb.from('prudential_risk_taxonomy').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await audit('UPDATE', 'prudential_taxonomy', id, { is_active: true }, { is_active: false }, 'Deactivated');
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_risk_taxonomy'] }); toast.success('Taxonomy deactivated'); },
  });
}

// ---------- Entities (universe) ----------
export interface EntityUniverseFilters {
  search?: string;
  sector_id?: string;
  status?: string;
  risk?: string;
}
export function usePrudentialEntities(filters?: EntityUniverseFilters) {
  return useQuery({
    queryKey: ['prudential_entities', filters ?? {}],
    queryFn: async () => {
      let q = sb.from('licensees').select('id, name, status, sector_id, sub_sector_id, category_id, license_id, assigned_supervisor_id, systemic_importance').order('name');
      if (filters?.sector_id) q = q.eq('sector_id', filters.sector_id);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
      const { data: entities, error } = await q;
      if (error) throw error;
      const ids = (entities ?? []).map((e: any) => e.id);
      if (!ids.length) return [];
      // Returns per entity → then breaches through those return ids
      const returnsRes = await sb.from('returns_filed')
        .select('id, entity_id, submit_date, period_end_date, workflow_status, status')
        .in('entity_id', ids)
        .order('submit_date', { ascending: false });
      const returnIds = (returnsRes.data ?? []).map((r: any) => r.id);
      const [breachesRes, actionsRes, escRes, assessRes, stressRes] = await Promise.all([
        returnIds.length
          ? sb.from('return_threshold_breaches').select('id, return_id, risk_level, level').in('return_id', returnIds)
          : Promise.resolve({ data: [] }),
        sb.from('prudential_actions').select('id, entity_id, status').in('entity_id', ids),
        sb.from('prudential_escalations').select('id, entity_id, status').in('entity_id', ids),
        sb.from('prudential_assessments').select('id, entity_id, overall_rating, approved_at, created_at, status').in('entity_id', ids).order('created_at', { ascending: false }),
        sb.from('prudential_stress_events').select('id, entity_id, resolved_at').in('entity_id', ids),
      ]);

      // return_id -> entity_id
      const returnToEntity: Record<string, string> = {};
      const lastReturnByEntity: Record<string, { date: string; workflow_status?: string }> = {};
      (returnsRes.data ?? []).forEach((r: any) => {
        returnToEntity[r.id] = r.entity_id;
        const d = r.submit_date || r.period_end_date;
        if (d && !lastReturnByEntity[r.entity_id]) lastReturnByEntity[r.entity_id] = { date: d, workflow_status: r.workflow_status || r.status };
      });

      const breachCounts: Record<string, { total: number; worst: string | null }> = {};
      (breachesRes.data ?? []).forEach((b: any) => {
        const ent = returnToEntity[b.return_id]; if (!ent) return;
        const severity = b.risk_level || b.level;
        const cur = breachCounts[ent] || { total: 0, worst: null };
        cur.total += 1;
        cur.worst = worstSeverity([cur.worst, severity]);
        breachCounts[ent] = cur;
      });

      const openActions: Record<string, number> = {};
      const overdueActions: Record<string, number> = {};
      (actionsRes.data ?? []).forEach((a: any) => {
        if (['open','in_progress','overdue'].includes(a.status)) openActions[a.entity_id] = (openActions[a.entity_id] ?? 0) + 1;
        if (a.status === 'overdue') overdueActions[a.entity_id] = (overdueActions[a.entity_id] ?? 0) + 1;
      });
      const openEsc: Record<string, number> = {};
      (escRes.data ?? []).forEach((e: any) => {
        if (['open','under_review'].includes(e.status)) openEsc[e.entity_id] = (openEsc[e.entity_id] ?? 0) + 1;
      });
      const latestAssess: Record<string, any> = {};
      (assessRes.data ?? []).forEach((a: any) => { if (!latestAssess[a.entity_id]) latestAssess[a.entity_id] = a; });
      const openStress: Record<string, number> = {};
      (stressRes.data ?? []).forEach((s: any) => { if (!s.resolved_at) openStress[s.entity_id] = (openStress[s.entity_id] ?? 0) + 1; });

      const rows = (entities ?? []).map((e: any) => ({
        ...e,
        open_actions: openActions[e.id] ?? 0,
        overdue_actions: overdueActions[e.id] ?? 0,
        open_escalations: openEsc[e.id] ?? 0,
        breach_count: breachCounts[e.id]?.total ?? 0,
        worst_breach: breachCounts[e.id]?.worst ?? null,
        stress_open: openStress[e.id] ?? 0,
        last_return: lastReturnByEntity[e.id]?.date ?? null,
        last_return_status: lastReturnByEntity[e.id]?.workflow_status ?? null,
        latest_rating: latestAssess[e.id]?.overall_rating ?? null,
      }));
      if (filters?.risk) {
        const wanted = normalizeSeverity(filters.risk);
        return rows.filter(r => normalizeSeverity(r.worst_breach) === wanted);
      }
      return rows;
    },
  });
}

/**
 * Recomputations are appended, not replaced, so a return can hold several rows
 * for the same ratio/breach. Keep only the newest record per logical key so the
 * profile page never renders the same ratio or breach twice.
 */
function dedupeLatest<T extends Record<string, any>>(rows: T[], keyOf: (row: T) => string, tsField: string): T[] {
  const best = new Map<string, T>();
  for (const row of rows ?? []) {
    const key = keyOf(row);
    const current = best.get(key);
    if (!current) { best.set(key, row); continue; }
    const a = new Date(row?.[tsField] ?? 0).getTime();
    const b = new Date(current?.[tsField] ?? 0).getTime();
    if (a > b) best.set(key, row);
  }
  return Array.from(best.values());
}

export function useEntityHistoricalProfile(entityId?: string | null) {

  return useQuery({
    queryKey: ['entity_prudential_profile', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const [entityRes, returnsRes, breachesRes, assessRes, actionsRes, escRes, stressRes] = await Promise.all([
        sb.from('licensees').select('*').eq('id', entityId).maybeSingle(),
        sb.from('returns_filed').select('id, unique_id, period_end_date, submit_date, workflow_status, status').eq('entity_id', entityId).order('period_end_date', { ascending: false }),
        sb.from('return_threshold_breaches').select('*').order('detected_at', { ascending: false }).limit(200),
        sb.from('prudential_assessments').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_actions').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_escalations').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_stress_events').select('*, prudential_stress_indicators(label, severity, metric_key)').eq('entity_id', entityId).order('triggered_at', { ascending: false }),
      ]);
      const returnIds = (returnsRes.data ?? []).map((r: any) => r.id);
      const breaches = dedupeLatest(
        (breachesRes.data ?? []).filter((b: any) => returnIds.includes(b.return_id)),
        (b) => `${b.return_id}|${b.metric_key ?? b.ratio_key ?? ''}`,
        'detected_at',
      ).sort((a: any, b: any) => new Date(b.detected_at ?? 0).getTime() - new Date(a.detected_at ?? 0).getTime());

      const ratiosRes = returnIds.length
        ? await sb.from('return_calculated_ratios').select('*').in('return_id', returnIds).order('computed_at', { ascending: false })
        : { data: [] };
      const ratios = dedupeLatest(
        ratiosRes.data ?? [],
        (r) => `${r.return_id}|${r.ratio_key}`,
        'computed_at',
      ).sort((a: any, b: any) => new Date(b.computed_at ?? 0).getTime() - new Date(a.computed_at ?? 0).getTime());

      return {
        entity: entityRes.data,
        returns: returnsRes.data ?? [],
        breaches,
        ratios,

        assessments: assessRes.data ?? [],
        actions: actionsRes.data ?? [],
        escalations: escRes.data ?? [],
        stress_events: stressRes.data ?? [],
      };
    },
  });
}

// ---------- Assessments ----------
export function useAssessments(filters?: { entity_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['prudential_assessments', filters ?? {}],
    queryFn: async () => {
      let q = sb.from('prudential_assessments').select('*').order('created_at', { ascending: false });
      if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return attachAssessmentLicensees(data ?? []);
    },
  });
}
export function useAssessment(id?: string | null) {
  return useQuery({
    queryKey: ['prudential_assessment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from('prudential_assessments').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [row] = await attachAssessmentLicensees([data]);
      return row as PrudentialAssessmentWithLicensee;
    },
  });
}
export function useUpsertAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PrudentialAssessment>) => {
      const user = (await sb.auth.getUser()).data.user;
      const payload: any = sanitizeAssessmentWritePayload(row as Record<string, any>);
      const before = row.id ? (await sb.from('prudential_assessments').select('*').eq('id', row.id).maybeSingle()).data : null;
      if (row.id) {
        await authorizedAction('prudential_supervision', 'edit', { assessment_id: row.id });
        delete payload.id;
        const { data, error } = await sb.from('prudential_assessments').update(payload).eq('id', row.id).select().single();
        if (error) throw error;
        const isOverride = payload.override_reason && before?.overall_rating !== payload.overall_rating;
        await audit(isOverride ? 'OVERRIDE' : 'UPDATE', 'prudential_assessment', row.id, before, data, payload.override_reason);
        return data;
      } else {
        await authorizedAction('prudential_supervision', 'create', { entity_id: (row as any).entity_id });
        payload.created_by = user?.id;
        const { data, error } = await sb.from('prudential_assessments').insert(payload).select().single();
        if (error) throw error;
        await audit('CREATE', 'prudential_assessment', data.id, null, data);
        return data;
      }
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_assessments'] }); qc.invalidateQueries({ queryKey: ['prudential_assessment'] }); toast.success('Assessment saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useTransitionAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, to, reason }: { id: string; to: 'submitted'|'reviewed'|'returned_for_revision'|'approved'|'closed'; reason?: string }) => {
      const user = (await sb.auth.getUser()).data.user;
      const now = new Date().toISOString();
      const before = (await sb.from('prudential_assessments').select('*').eq('id', id).maybeSingle()).data;
      const patch: any = { status: to };
      if (to === 'submitted') patch.submitted_at = now;
      if (to === 'reviewed') { patch.reviewed_at = now; patch.reviewed_by = user?.id; if (reason) patch.review_notes = reason; }
      if (to === 'returned_for_revision') { patch.reviewed_at = now; patch.reviewed_by = user?.id; patch.review_notes = reason ?? null; }
      if (to === 'approved') { patch.approved_at = now; patch.approved_by = user?.id; }
      if (to === 'closed') patch.closed_at = now;
      const { error } = await sb.from('prudential_assessments').update(patch).eq('id', id);
      if (error) throw error;
      const map: Record<string, string> = { submitted: 'APPROVE', reviewed: 'APPROVE', returned_for_revision: 'REJECT', approved: 'APPROVE', closed: 'UPDATE' };
      await audit(map[to] as any, 'prudential_assessment', id, before, { ...before, ...patch }, reason);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_assessments'] }); qc.invalidateQueries({ queryKey: ['prudential_assessment'] }); toast.success('Status updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}

// Pull signals to prefill an assessment from a return
export function useAssessmentPrefill(returnId?: string | null) {
  return useQuery({
    queryKey: ['prudential_assessment_prefill', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const [rf, ratios, breaches, analysis, stress] = await Promise.all([
        sb.from('returns_filed').select('id, entity_id, period_end_date, period_start_date').eq('id', returnId).maybeSingle(),
        sb.from('return_calculated_ratios').select('*').eq('return_id', returnId),
        sb.from('return_threshold_breaches').select('*').eq('return_id', returnId),
        sb.from('return_consolidated_analysis').select('*').eq('return_id', returnId).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('prudential_stress_events').select('*, prudential_stress_indicators(label, severity, metric_key)').eq('return_id', returnId),
      ]);
      return {
        return_row: rf.data,
        ratios: ratios.data ?? [],
        breaches: breaches.data ?? [],
        analysis: analysis.data ?? null,
        stress_events: stress.data ?? [],
      };
    },
  });
}

// ---------- Actions ----------
export function useActions(filters?: { entity_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['prudential_actions', filters ?? {}],
    queryFn: async () => {
      let q = sb.from('prudential_actions').select('*, licensees(name)').order('created_at', { ascending: false });
      if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PrudentialAction>) => {
      await authorizedAction('prudential_supervision', 'create', { entity_id: (row as any).entity_id, title: (row as any).title });
      const user = (await sb.auth.getUser()).data.user;
      const payload: any = { ...row, created_by: user?.id };
      const { data, error } = await sb.from('prudential_actions').insert(payload).select().single();
      if (error) throw error;
      await audit('CREATE', 'prudential_action', data.id, null, data);

      const ent = data.entity_id ? (await sb.from('licensees').select('name').eq('id', data.entity_id).maybeSingle()).data : null;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_actions'] }); toast.success('Action created'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, waiver_reason, cancellation_reason, completion_notes }: { id: string; patch: Partial<PrudentialAction>; waiver_reason?: string; cancellation_reason?: string; completion_notes?: string }) => {
      await authorizedAction('prudential_supervision', 'edit', { action_id: id, status: patch.status });
      const user = (await sb.auth.getUser()).data.user;
      const before = (await sb.from('prudential_actions').select('*, licensees(name)').eq('id', id).maybeSingle()).data;

      // Enforce mandatory notes at hook layer for terminal transitions,
      // so a direct hook caller cannot bypass the UI's 5-char guard.
      if (patch.status === 'completed' && (!completion_notes || completion_notes.trim().length < 5)) {
        throw new Error('Completion notes are required (min 5 characters) to complete an action');
      }
      if (patch.status === 'waived' && (!waiver_reason || waiver_reason.trim().length < 5)) {
        throw new Error('Waiver reason is required (min 5 characters) to waive an action');
      }
      if (patch.status === 'cancelled' && (!cancellation_reason || cancellation_reason.trim().length < 5)) {
        throw new Error('Cancellation reason is required (min 5 characters) to cancel an action');
      }
      const body: any = { ...patch };
      if (patch.status && ['completed','waived','cancelled'].includes(patch.status)) {
        body.closed_at = new Date().toISOString();
        body.closed_by = user?.id;
      }
      if (patch.status === 'waived' && waiver_reason) body.waiver_reason = waiver_reason;
      if (patch.status === 'cancelled' && cancellation_reason) body.cancellation_reason = cancellation_reason;
      if (patch.status === 'completed' && completion_notes) body.completion_notes = completion_notes;
      const { error } = await sb.from('prudential_actions').update(body).eq('id', id);
      if (error) throw error;
      await audit('UPDATE', 'prudential_action', id, before, { ...before, ...body }, waiver_reason || cancellation_reason || completion_notes);
      // Re-notify the new assignee if assignment changed.
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_actions'] }); toast.success('Action updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useMarkOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Snapshot open/in-progress actions that will flip so we can audit + notify each
      const { data: candidates } = await sb.from('prudential_actions')
        .select('id, title, entity_id, assigned_to, licensees(name)')
        .in('status', ['open','in_progress'])
        .lt('due_date', new Date().toISOString().slice(0,10));
      const { data: n, error } = await sb.rpc('mark_prudential_actions_overdue');
      if (error) throw error;
      for (const a of (candidates ?? [])) {
        await audit('UPDATE', 'prudential_action', a.id, { status: 'open_or_in_progress' }, { status: 'overdue' }, 'Automated overdue sweep');
      }
      return n as number;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['prudential_actions'] }); toast.success(`${n} action(s) marked overdue`); },
  });
}

// ---------- Escalations ----------
export function useEscalations(filters?: { entity_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['prudential_escalations', filters ?? {}],
    queryFn: async () => {
      let q = sb.from('prudential_escalations').select('*, licensees(name)').order('created_at', { ascending: false });
      if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useCreateEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PrudentialEscalation>) => {
      const user = (await sb.auth.getUser()).data.user;
      if (!row.reason || row.reason.trim().length < 5) throw new Error('Reason is required for escalation');
      await authorizedAction('prudential_supervision', 'create', { entity_id: (row as any).entity_id, reason_preview: row.reason?.slice(0, 60) });
      const { data, error } = await sb.from('prudential_escalations').insert({ ...row, created_by: user?.id }).select().single();

      if (error) throw error;
      await audit('CREATE', 'prudential_escalation', data.id, null, data, row.reason);
      const ent = data.entity_id ? (await sb.from('licensees').select('name').eq('id', data.entity_id).maybeSingle()).data : null;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_escalations'] }); toast.success('Escalation created'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useUpdateEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PrudentialEscalation> }) => {
      await authorizedAction('prudential_supervision', 'edit', { escalation_id: id, status: patch.status });
      const user = (await sb.auth.getUser()).data.user;
      const before = (await sb.from('prudential_escalations').select('*, licensees(name)').eq('id', id).maybeSingle()).data;

      const body: any = { ...patch };
      if (patch.status === 'resolved' || patch.status === 'withdrawn') {
        if (!patch.decision || !patch.outcome) throw new Error('Decision and outcome are required to close an escalation');
        body.decided_at = new Date().toISOString();
        body.decision_by = user?.id;
      }
      const { error } = await sb.from('prudential_escalations').update(body).eq('id', id);
      if (error) throw error;
      await audit('UPDATE', 'prudential_escalation', id, before, { ...before, ...body });
      
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_escalations'] }); toast.success('Escalation updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}

// ---------- Stress indicators ----------
export function useStressIndicators() {
  return useQuery({
    queryKey: ['prudential_stress_indicators'],
    queryFn: async () => {
      const { data, error } = await sb.from('prudential_stress_indicators').select('*').order('label');
      if (error) throw error;
      return (data ?? []) as StressIndicator[];
    },
  });
}
export function useUpsertStressIndicator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<StressIndicator>) => {
      const payload = { ...row };
      const before = row.id ? (await sb.from('prudential_stress_indicators').select('*').eq('id', row.id).maybeSingle()).data : null;
      if (row.id) {
        await authorizedAction('prudential_supervision', 'edit', { stress_indicator_id: row.id });
        const { error } = await sb.from('prudential_stress_indicators').update(payload).eq('id', row.id);
        if (error) throw error;
        await audit('UPDATE', 'prudential_stress_indicator', row.id, before, payload);
      } else {
        await authorizedAction('prudential_supervision', 'create', { metric_key: row.metric_key });
        const { data, error } = await sb.from('prudential_stress_indicators').insert(payload).select().single();
        if (error) throw error;
        await audit('CREATE', 'prudential_stress_indicator', data.id, null, data);
      }
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_stress_indicators'] }); toast.success('Indicator saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useDeleteStressIndicator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await authorizedAction('prudential_supervision', 'edit', { stress_indicator_id: id, deactivate: true });
      const { error } = await sb.from('prudential_stress_indicators').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await audit('UPDATE', 'prudential_stress_indicator', id, { is_active: true }, { is_active: false }, 'Deactivated');
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_stress_indicators'] }); toast.success('Indicator deactivated'); },
  });
}
export function useEvaluateStressForReturn() {
  return useMutation({
    mutationFn: async (returnId: string) => {
      await logPrudentialFeed({ source: 'prudential', feed_type: 'stress_evaluation', status: 'started', related_return_id: returnId });
      const { data, error } = await sb.rpc('evaluate_stress_indicators_for_return', { _return_id: returnId });
      if (error) {
        await logPrudentialFeed({ source: 'prudential', feed_type: 'stress_evaluation', status: 'failed', related_return_id: returnId, error: error.message, completed_at: new Date().toISOString() });
        throw error;
      }
      // RPC now returns jsonb { new_events, updated_events }
      const newEvents = (data as any)?.new_events ?? [];
      const updatedEvents = (data as any)?.updated_events ?? [];
      await logPrudentialFeed({ source: 'prudential', feed_type: 'stress_evaluation', status: 'success', related_return_id: returnId, row_count: newEvents.length + updatedEvents.length, completed_at: new Date().toISOString(), metadata: { new: newEvents.length, updated: updatedEvents.length } });
      // Fire notifications per newly triggered event
      for (const ev of newEvents) {
        const ent = ev.entity_id ? (await sb.from('licensees').select('name').eq('id', ev.entity_id).maybeSingle()).data : null;
        await audit('CREATE', 'prudential_stress_event', ev.event_id, null, ev, 'Auto-triggered by supervisor stress re-run');
        try { await sb.from('prudential_stress_events').update({ notified: true }).eq('id', ev.event_id); } catch { /* ignore */ }
      }
      return { new: newEvents.length, updated: updatedEvents.length };
    },
    onSuccess: (r) => toast.success(`${r.new} new · ${r.updated} updated stress event(s)`),
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}

export function useEntityAuditHistory(entityId?: string | null) {
  return useQuery({
    queryKey: ['prudential_entity_audit', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('prudential_entity_audit_history', { _entity_id: entityId });
      if (error) throw error;
      return (data ?? []) as Array<any>;
    },
  });
}
export function useStressEvents(entityId?: string | null) {
  return useQuery({
    queryKey: ['prudential_stress_events', entityId ?? 'all'],
    queryFn: async () => {
      let q = sb.from('prudential_stress_events').select('*, prudential_stress_indicators(label, severity, metric_key)').order('triggered_at', { ascending: false }).limit(200);
      if (entityId) q = q.eq('entity_id', entityId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSectorRiskDistribution() {
  return useQuery({
    queryKey: ['prudential_sector_risk_distribution'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('prudential_sector_risk_distribution');
      if (error) throw error;
      return (data ?? []) as Array<{ sector_id: string; sector_name: string; entity_count: number; breach_count: number }>;
    },
  });
}

// ---------- Dashboard ----------
export function usePrudentialDashboardMetrics() {
  return useQuery({
    queryKey: ['prudential_dashboard_metrics'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('prudential_dashboard_metrics');
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
}

// ---------- Feed logs ----------
export function useFeedLogs() {
  return useQuery({
    queryKey: ['prudential_data_feed_logs'],
    queryFn: async () => {
      const { data, error } = await sb.from('prudential_data_feed_logs').select('*').order('started_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as FeedLog[];
    },
  });
}
export async function logPrudentialFeed(row: Partial<FeedLog>) {
  // Governed operation: the feed log row is written server-side with a derived
  // actor. Direct DML on prudential_data_feed_logs is revoked.
  await prudentialFeedLogRecord({
    source: row.source ?? 'prudential',
    feedType: row.feed_type ?? 'unspecified',
    status: row.status ?? 'started',
    rowCount: row.row_count ?? null,
    error: row.error ?? null,
    relatedFilingId: (row as any).related_filing_id ?? row.related_return_id ?? null,
    completedAt: row.completed_at ?? null,
    metadata: row.metadata ?? {},
  });
}

// ---------- Sweep schedule info ----------
export function useSweepSchedule() {
  return useQuery({
    queryKey: ['prudential_sweep_schedule'],
    queryFn: async () => {
      const sources = ['prudential-monitoring-sweep', 'overdue-action-sweep'];
      const { data, error } = await sb
        .from('prudential_data_feed_logs')
        .select('source, completed_at, started_at, status')
        .in('source', sources)
        .in('status', ['success', 'failed'])
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const pickLatest = (src: string) => (data ?? []).find((r: any) => r.source === src) ?? null;
      return {
        last_monitoring_sweep: pickLatest('prudential-monitoring-sweep'),
        last_overdue_check: pickLatest('overdue-action-sweep'),
      };
    },
    refetchInterval: 60_000,
  });
}

