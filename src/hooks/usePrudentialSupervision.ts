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
  /** EPR-01 — canonical filing provenance for the assessed return. */
  return_filing_id?: string | null;
  return_filing_version_id?: string | null;
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
      await prudentialTaxonomySave({ is_active: false }, id, 'Deactivated by supervisor');
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_risk_taxonomy'] }); toast.success('Taxonomy deactivated'); },
  });
}

// ---------- Entities (universe) ----------
/**
 * EPR-01 / P07 — the prudential entity universe is a SERVER read model.
 *
 * `prudential_entity_universe()` is RLS-scoped and SECURITY INVOKER; it derives
 * the latest canonical filing (`v_return_filing_workflow_state`), current
 * breach counts/severity (`v_prudential_current_breaches`), open EWI, actions,
 * escalations, stress events and the latest rated assessment server-side.
 * Nothing here is reconstructed in the browser and no read touches the retired
 * `returns_filed` / legacy `return_id` path.
 */
export interface EntityUniverseFilters {
  search?: string;
  sector_id?: string;
  status?: string;
  risk?: string;
}
export function usePrudentialEntities(filters?: EntityUniverseFilters) {
  return useQuery({
    queryKey: ['prudential_entity_universe', filters ?? {}],
    queryFn: async () => {
      const { data, error } = await sb.rpc('prudential_entity_universe', {
        _sector_id: filters?.sector_id ?? null,
        _status: filters?.status ?? null,
        _search: filters?.search ?? null,
      });
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((r) => ({
        // Identity (canonical entity id).
        id: r.entity_id,
        name: r.entity_name,
        status: r.status,
        sector_id: r.sector_id,
        sub_sector_id: r.sub_sector_id,
        category_id: r.category_id,
        license_id: r.license_id,
        assigned_supervisor_id: r.assigned_supervisor_id,
        systemic_importance: r.systemic_importance,
        // Canonical Return provenance.
        latest_filing_id: r.latest_filing_id,
        latest_filing_reference: r.latest_filing_reference,
        latest_period_label: r.latest_period_label,
        latest_accepted_filing_id: r.latest_accepted_filing_id,
        latest_accepted_period_end: r.latest_accepted_period_end,
        last_return: r.latest_period_end ?? null,
        last_return_status: r.latest_filing_status ?? null,
        // Server-computed supervisory counters.
        breach_count: Number(r.breach_count ?? 0),
        worst_breach: r.worst_breach ?? null,
        open_ewi: Number(r.open_ewi ?? 0),
        open_actions: Number(r.open_actions ?? 0),
        overdue_actions: Number(r.overdue_actions ?? 0),
        open_escalations: Number(r.open_escalations ?? 0),
        stress_open: Number(r.stress_open ?? 0),
        latest_rating: r.latest_rating ?? null,
        latest_rating_status: r.latest_rating_status ?? null,
      }));
      if (filters?.risk) {
        const wanted = normalizeSeverity(filters.risk);
        return rows.filter((r) => normalizeSeverity(r.worst_breach) === wanted);
      }
      return rows;
    },
  });
}

export interface CanonicalPrudentialFiling {
  filing_id: string;
  filing_reference: string | null;
  definition_name: string | null;
  reporting_period_id: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status: string | null;
  status_label: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  current_version_id: string | null;
  current_version_number: number | null;
  accepted_version_id: string | null;
  is_overdue: boolean | null;
  days_late: number | null;
}

export interface CanonicalPrudentialMetric {
  filing_id: string;
  return_filing_version_id: string | null;
  reporting_period_id: string | null;
  period_label: string | null;
  period_end: string | null;
  filing_status: string | null;
  regulatory_metric_id: string;
  metric_code: string;
  metric_name: string | null;
  unit: string | null;
  value_numeric: number | null;
  availability: string | null;
  source_kind: string | null;
  recorded_at: string | null;
}

/** `%`-unit metrics are stored in percentage points (18.40 = 18.40%). */
function metricDisplayFormat(unit?: string | null): string {
  const u = String(unit ?? '').trim().toLowerCase();
  if (u === '%' || u === 'percent' || u === 'percentage') return 'percent_points';
  if (u === 'x' || u === 'ratio' || u === 'multiple') return 'multiple';
  if (!u) return 'decimal';
  return 'decimal';
}

/**
 * EPR-01 / P07 — canonical prudential entity profile.
 *
 * Returns/metrics/breaches come from `prudential_entity_returns_profile()`
 * (canonical filings, `return_metric_values`, `v_prudential_current_breaches`).
 * The `returns`/`ratios`/`breaches` keys keep their existing presentation shape
 * but every row now carries canonical provenance (`filing_id`,
 * `return_filing_version_id`, `reporting_period_id`). No legacy id is minted.
 */
export function useEntityHistoricalProfile(entityId?: string | null) {

  return useQuery({
    queryKey: ['entity_prudential_profile', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const [entityRes, returnsProfile, assessRes, actionsRes, escRes, stressRes] = await Promise.all([
        sb.from('licensees').select('*').eq('id', entityId).maybeSingle(),
        sb.rpc('prudential_entity_returns_profile', { _entity_id: entityId }),
        sb.from('prudential_assessments').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_actions').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_escalations').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_stress_events').select('*, prudential_stress_indicators(label, severity, metric_key)').eq('entity_id', entityId).order('triggered_at', { ascending: false }),
      ]);
      if (returnsProfile.error) throw returnsProfile.error;
      const profile = (returnsProfile.data ?? {}) as {
        filings?: CanonicalPrudentialFiling[];
        metrics?: CanonicalPrudentialMetric[];
        current_breaches?: any[];
        breach_history?: any[];
      };

      const filings = profile.filings ?? [];
      const returns = filings.map((f) => ({
        // Canonical identity — `id` is `return_filings.id`, never a legacy id.
        id: f.filing_id,
        unique_id: f.filing_reference,
        definition_name: f.definition_name,
        reporting_period_id: f.reporting_period_id,
        period_label: f.period_label,
        period_start_date: f.period_start,
        period_end_date: f.period_end,
        due_date: f.due_date,
        submit_date: f.submitted_at,
        accepted_at: f.accepted_at,
        workflow_status: f.status,
        status: f.status,
        status_label: f.status_label,
        current_version_id: f.current_version_id,
        current_version_number: f.current_version_number,
        accepted_version_id: f.accepted_version_id,
        is_overdue: f.is_overdue,
        days_late: f.days_late,
      }));

      // "Ratios" in the UI are canonical regulatory metric facts. Labels stay
      // user-facing (CAR / NPL …) — no second ratio engine, no zero-filling.
      const metrics = profile.metrics ?? [];
      const ratios = metrics.map((m) => ({
        ratio_key: m.metric_code,
        label: m.metric_name || m.metric_code,
        value: m.value_numeric,
        display_format: metricDisplayFormat(m.unit),
        computed_at: m.recorded_at,
        availability: m.availability,
        source_kind: m.source_kind,
        // Canonical provenance
        return_id: m.filing_id,
        return_filing_id: m.filing_id,
        return_filing_version_id: m.return_filing_version_id,
        reporting_period_id: m.reporting_period_id,
        regulatory_metric_id: m.regulatory_metric_id,
        period_label: m.period_label,
        period_end: m.period_end,
      }));

      const breaches = (profile.current_breaches ?? []).map((b: any) => ({
        ...b,
        // Presentation code keys off `return_id`; it now holds the canonical
        // filing id so drill-downs resolve through objectRoute.returnFiling().
        return_id: b.return_filing_id,
      }));

      return {
        entity: entityRes.data,
        returns,
        filings,
        metrics,
        breaches,
        breach_history: profile.breach_history ?? [],
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
      const payload: any = sanitizeAssessmentWritePayload(row as Record<string, any>);
      delete payload.id;
      if (row.id) {
        return await prudentialAssessmentSaveDraft(row.id, payload);
      }
      return await prudentialAssessmentCreate({
        entityId: (row as any).entity_id,
        periodStart: (row as any).period_start,
        periodEnd: (row as any).period_end,
        returnFilingId: (row as any).return_filing_id ?? (row as any).return_id ?? null,
        returnFilingVersionId: (row as any).return_filing_version_id ?? null,
        ratings: payload,
        rationale: (row as any).override_reason ?? (row as any).rationale ?? null,
        signalSnapshot: (row as any).signal_snapshot ?? {},
        autoSuggestedRating: (row as any).auto_suggested_rating ?? null,
      });
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_assessments'] }); qc.invalidateQueries({ queryKey: ['prudential_assessment'] }); toast.success('Assessment saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useTransitionAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, to, reason }: { id: string; to: 'submitted'|'reviewed'|'returned_for_revision'|'approved'|'closed'; reason?: string }) => {
      await prudentialAssessmentTransition(id, to, reason ?? null);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_assessments'] }); qc.invalidateQueries({ queryKey: ['prudential_assessment'] }); toast.success('Status updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}

// Pull signals to prefill an assessment from a return
/**
 * EPR-01 / P07 — assessment prefill from the CANONICAL filing.
 *
 * Takes `return_filings.id`. Metric facts and current breaches come from
 * `prudential_filing_metric_facts()`; stress events are matched on the
 * canonical `return_filing_id`. No `returns_filed` / `return_calculated_ratios`
 * read remains, so a prefill is either canonical or honestly empty.
 */
export function useAssessmentPrefill(returnFilingId?: string | null) {
  return useQuery({
    queryKey: ['prudential_assessment_prefill', returnFilingId],
    enabled: !!returnFilingId,
    queryFn: async () => {
      const [facts, stress] = await Promise.all([
        sb.rpc('prudential_filing_metric_facts', { _return_filing_id: returnFilingId }),
        sb.from('prudential_stress_events')
          .select('*, prudential_stress_indicators(label, severity, metric_key)')
          .eq('return_filing_id', returnFilingId),
      ]);
      if (facts.error) throw facts.error;
      const payload = (facts.data ?? {}) as {
        filing?: any;
        metrics?: CanonicalPrudentialMetric[];
        breaches?: any[];
      };
      const metrics = payload.metrics ?? [];
      return {
        return_row: payload.filing ?? null,
        filing: payload.filing ?? null,
        metrics,
        ratios: metrics.map((m) => ({
          id: `${m.regulatory_metric_id}`,
          ratio_key: m.metric_code,
          label: m.metric_name || m.metric_code,
          value: m.value_numeric,
          display_format: metricDisplayFormat(m.unit),
          return_filing_id: m.filing_id,
          return_filing_version_id: m.return_filing_version_id,
        })),
        breaches: (payload.breaches ?? []).map((b: any) => ({ ...b, return_id: b.return_filing_id })),
        analysis: null,
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
      return await prudentialActionIssue({
        entityId: (row as any).entity_id,
        actionType: (row as any).action_type ?? 'supervisory_letter',
        title: (row as any).title,
        description: (row as any).description ?? null,
        severity: (row as any).severity ?? 'medium',
        dueDate: (row as any).due_date ?? null,
        assignedTo: (row as any).assigned_to ?? null,
        sourceType: (row as any).source_type ?? 'manual',
        sourceId: (row as any).source_id ?? null,
        evidenceRequired: (row as any).evidence_required ?? false,
        entityContact: (row as any).entity_contact ?? null,
        responseDueAt: (row as any).response_due_at ?? null,
        breachAfterDays: (row as any).breach_after_days ?? null,
        entityOwnerUserId: (row as any).entity_owner_user_id ?? null,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_actions'] }); toast.success('Action created'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, waiver_reason, cancellation_reason, completion_notes }: { id: string; patch: Partial<PrudentialAction>; waiver_reason?: string; cancellation_reason?: string; completion_notes?: string }) => {
      // Client-side pre-checks mirror the server rules for a faster message;
      // the governed operation re-enforces them regardless of this path.
      if (patch.status === 'completed' && (!completion_notes || completion_notes.trim().length < 5)) {
        throw new Error('Completion notes are required (min 5 characters) to complete an action');
      }
      if (patch.status === 'waived' && (!waiver_reason || waiver_reason.trim().length < 5)) {
        throw new Error('Waiver reason is required (min 5 characters) to waive an action');
      }
      if (patch.status === 'cancelled' && (!cancellation_reason || cancellation_reason.trim().length < 5)) {
        throw new Error('Cancellation reason is required (min 5 characters) to cancel an action');
      }
      const body: Record<string, unknown> = { ...patch };
      if (patch.status === 'waived' && waiver_reason) body.waiver_reason = waiver_reason;
      if (patch.status === 'cancelled' && cancellation_reason) body.cancellation_reason = cancellation_reason;
      if (patch.status === 'completed' && completion_notes) body.completion_notes = completion_notes;
      await prudentialActionUpdate(id, body, waiver_reason || cancellation_reason || completion_notes || null);
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
      if (!row.reason || row.reason.trim().length < 5) throw new Error('Reason is required for escalation');
      return await prudentialEscalationRaise({
        entityId: (row as any).entity_id,
        escalationType: (row as any).escalation_type ?? 'prudential',
        reason: row.reason,
        relatedType: (row as any).related_type ?? 'entity',
        relatedId: (row as any).related_id ?? null,
        priority: (row as any).priority ?? 'medium',
        evidence: (row as any).evidence ?? {},
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_escalations'] }); toast.success('Escalation created'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useUpdateEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PrudentialEscalation> }) => {
      if (patch.status === 'resolved' || patch.status === 'withdrawn') {
        if (!patch.decision || !patch.outcome) throw new Error('Decision and outcome are required to close an escalation');
      }
      await prudentialEscalationDecide(
        id,
        (patch.status as string) ?? 'acknowledged',
        (patch as any).decision ?? null,
        (patch as any).outcome ?? null,
        (patch as any).priority ?? null,
      );
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
      const { id, ...payload } = row;
      await prudentialStressIndicatorSave(payload as Record<string, unknown>, id ?? null);
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_stress_indicators'] }); toast.success('Indicator saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useDeleteStressIndicator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await prudentialStressIndicatorDelete(id, 'Deactivated by supervisor');
    },

    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_stress_indicators'] }); toast.success('Indicator deactivated'); },
  });
}
/**
 * EPR-01 / P07 — stress evaluation against the CANONICAL filing.
 * Takes `return_filings.id`; the server reads the accepted/current version's
 * `return_metric_values` (never `return_calculated_ratios`).
 */
export function useEvaluateStressForReturn() {
  return useMutation({
    mutationFn: async (returnFilingId: string) => {
      const returnId = returnFilingId;
      await logPrudentialFeed({ source: 'prudential', feed_type: 'stress_evaluation', status: 'started', related_return_id: returnId });
      const { data, error } = await sb.rpc('evaluate_stress_indicators_for_filing', { _return_filing_id: returnFilingId });
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
        // Governed operation records the acknowledgement/notification flag and
        // its own audit entry; no client-side audit or direct DML here.
        try { await prudentialStressEventAcknowledge(ev.event_id); } catch { /* non-blocking */ }
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
export function usePrudentialDashboardMetrics(enabled = true) {
  return useQuery({
    queryKey: ['prudential_dashboard_metrics'],
    enabled,
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

