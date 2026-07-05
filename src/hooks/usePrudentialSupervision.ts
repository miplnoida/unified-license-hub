import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logComplianceAudit } from '@/lib/complianceAudit';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';

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
async function notify(event_key: string, entity_type: string, entity_id: string | null | undefined, payload: Record<string, unknown> = {}) {
  if (!entity_id) return;
  try {
    await dispatchNotificationEvent({ event_key, entity_type, entity_id, payload });
  } catch {
    /* swallow */
  }
}

// ---------- Types ----------
export interface RiskTaxonomy { id: string; code: string; label: string; description: string | null; parent_id: string | null; sort_order: number; is_active: boolean; }
export interface PrudentialAssessment {
  id: string; entity_id: string; return_id: string | null; period_start: string | null; period_end: string | null;
  overall_rating: string | null; ratings: Record<string, string>; rationale: string | null; evidence_refs: any[];
  conclusion: string | null; recommended_response: string | null; status: 'draft'|'submitted'|'reviewed'|'approved'|'closed';
  override_reason: string | null; auto_suggested_rating: string | null;
  created_by: string | null; reviewed_by: string | null; approved_by: string | null;
  submitted_at: string | null; reviewed_at: string | null; approved_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string;
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
      const payload = { ...row };
      if (row.id) {
        const { error } = await sb.from('prudential_risk_taxonomy').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('prudential_risk_taxonomy').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_risk_taxonomy'] }); toast.success('Taxonomy saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useDeleteTaxonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('prudential_risk_taxonomy').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_risk_taxonomy'] }); toast.success('Taxonomy deactivated'); },
  });
}

// ---------- Entities (universe) ----------
export function usePrudentialEntities() {
  return useQuery({
    queryKey: ['prudential_entities'],
    queryFn: async () => {
      const { data: entities, error } = await sb
        .from('licensees')
        .select('id, name, status, sector_id, sub_sector_id, category_id, license_id')
        .order('name');
      if (error) throw error;
      const ids = (entities ?? []).map((e: any) => e.id);
      if (!ids.length) return [];
      const [breachesRes, actionsRes, returnsRes] = await Promise.all([
        sb.from('return_threshold_breaches').select('id, entity_id:return_id'),
        sb.from('prudential_actions').select('id, entity_id, status').in('entity_id', ids),
        sb.from('returns_filed').select('id, entity_id, submit_date, period_end_date').in('entity_id', ids).order('submit_date', { ascending: false }),
      ]);
      const actionsByEntity: Record<string, number> = {};
      (actionsRes.data ?? []).forEach((a: any) => {
        if (['open','in_progress','overdue'].includes(a.status)) actionsByEntity[a.entity_id] = (actionsByEntity[a.entity_id] ?? 0) + 1;
      });
      const lastReturnByEntity: Record<string, string> = {};
      (returnsRes.data ?? []).forEach((r: any) => { if (!lastReturnByEntity[r.entity_id]) lastReturnByEntity[r.entity_id] = r.submit_date || r.period_end_date; });
      return (entities ?? []).map((e: any) => ({
        ...e,
        open_actions: actionsByEntity[e.id] ?? 0,
        last_return: lastReturnByEntity[e.id] ?? null,
      }));
    },
  });
}

export function useEntityHistoricalProfile(entityId?: string | null) {
  return useQuery({
    queryKey: ['entity_prudential_profile', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const [entityRes, returnsRes, breachesRes, assessRes, actionsRes, escRes] = await Promise.all([
        sb.from('licensees').select('*').eq('id', entityId).maybeSingle(),
        sb.from('returns_filed').select('id, unique_id, period_end_date, submit_date, workflow_status, status').eq('entity_id', entityId).order('period_end_date', { ascending: false }),
        sb.from('return_threshold_breaches').select('*').order('detected_at', { ascending: false }).limit(200),
        sb.from('prudential_assessments').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_actions').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
        sb.from('prudential_escalations').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }),
      ]);
      const returnIds = (returnsRes.data ?? []).map((r: any) => r.id);
      const breaches = (breachesRes.data ?? []).filter((b: any) => returnIds.includes(b.return_id));
      const ratiosRes = returnIds.length
        ? await sb.from('return_calculated_ratios').select('*').in('return_id', returnIds).order('computed_at', { ascending: false })
        : { data: [] };
      return {
        entity: entityRes.data,
        returns: returnsRes.data ?? [],
        breaches,
        ratios: ratiosRes.data ?? [],
        assessments: assessRes.data ?? [],
        actions: actionsRes.data ?? [],
        escalations: escRes.data ?? [],
      };
    },
  });
}

// ---------- Assessments ----------
export function useAssessments(filters?: { entity_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['prudential_assessments', filters ?? {}],
    queryFn: async () => {
      let q = sb.from('prudential_assessments').select('*, licensees(name)').order('created_at', { ascending: false });
      if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useAssessment(id?: string | null) {
  return useQuery({
    queryKey: ['prudential_assessment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from('prudential_assessments').select('*, licensees(name)').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as PrudentialAssessment & { licensees?: { name: string } };
    },
  });
}
export function useUpsertAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PrudentialAssessment>) => {
      const user = (await sb.auth.getUser()).data.user;
      const payload: any = { ...row };
      if (row.id) {
        const { data, error } = await sb.from('prudential_assessments').update(payload).eq('id', row.id).select().single();
        if (error) throw error;
        return data;
      } else {
        payload.created_by = user?.id;
        const { data, error } = await sb.from('prudential_assessments').insert(payload).select().single();
        if (error) throw error;
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
    mutationFn: async ({ id, to, reason }: { id: string; to: 'submitted'|'reviewed'|'approved'|'closed'; reason?: string }) => {
      const user = (await sb.auth.getUser()).data.user;
      const now = new Date().toISOString();
      const patch: any = { status: to };
      if (to === 'submitted') patch.submitted_at = now;
      if (to === 'reviewed') { patch.reviewed_at = now; patch.reviewed_by = user?.id; }
      if (to === 'approved') { patch.approved_at = now; patch.approved_by = user?.id; }
      if (to === 'closed') patch.closed_at = now;
      if (reason) patch.override_reason = reason;
      const { error } = await sb.from('prudential_assessments').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_assessments'] }); qc.invalidateQueries({ queryKey: ['prudential_assessment'] }); toast.success('Status updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
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
      const user = (await sb.auth.getUser()).data.user;
      const payload: any = { ...row, created_by: user?.id };
      const { data, error } = await sb.from('prudential_actions').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_actions'] }); toast.success('Action created'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, waiver_reason }: { id: string; patch: Partial<PrudentialAction>; waiver_reason?: string }) => {
      const user = (await sb.auth.getUser()).data.user;
      const body: any = { ...patch };
      if (patch.status && ['completed','waived','cancelled'].includes(patch.status)) {
        body.closed_at = new Date().toISOString();
        body.closed_by = user?.id;
      }
      if (patch.status === 'waived' && waiver_reason) body.waiver_reason = waiver_reason;
      const { error } = await sb.from('prudential_actions').update(body).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_actions'] }); toast.success('Action updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });
}
export function useMarkOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc('mark_prudential_actions_overdue');
      if (error) throw error;
      return data as number;
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
      const { data, error } = await sb.from('prudential_escalations').insert({ ...row, created_by: user?.id }).select().single();
      if (error) throw error;
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
      const user = (await sb.auth.getUser()).data.user;
      const body: any = { ...patch };
      if (patch.status === 'resolved' || patch.status === 'withdrawn') {
        body.decided_at = new Date().toISOString();
        body.decision_by = user?.id;
      }
      const { error } = await sb.from('prudential_escalations').update(body).eq('id', id);
      if (error) throw error;
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
      if (row.id) {
        const { error } = await sb.from('prudential_stress_indicators').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('prudential_stress_indicators').insert(payload);
        if (error) throw error;
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
      const { error } = await sb.from('prudential_stress_indicators').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prudential_stress_indicators'] }); toast.success('Indicator deactivated'); },
  });
}
export function useEvaluateStressForReturn() {
  return useMutation({
    mutationFn: async (returnId: string) => {
      const { data, error } = await sb.rpc('evaluate_stress_indicators_for_return', { _return_id: returnId });
      if (error) throw error;
      return data as StressEvent[];
    },
    onSuccess: (rows) => toast.success(`${rows.length} stress event(s) evaluated`),
    onError: (e: any) => toast.error(e.message || 'Failed'),
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
  const user = (await sb.auth.getUser()).data.user;
  await sb.from('prudential_data_feed_logs').insert({ ...row, triggered_by: user?.id });
}
