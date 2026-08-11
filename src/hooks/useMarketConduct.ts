// ============================================================
// Market Conduct hook — Script 4 completion
// Additive. Reuses existing audit + notification infrastructure.
// ============================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logComplianceAudit } from '@/lib/complianceAudit';
import { authorizedAction } from '@/lib/rbac/authorizedAction';

const sb = supabase as any;

function emptyToNull(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

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
    if (import.meta.env.DEV) console.warn('[market conduct audit] failed', e);
  }
}

// ---------- Types ----------
export interface ConductInvestigation {
  id: string; code: string | null; source_type: string; source_id: string | null;
  licensee_id: string | null; product_id: string | null; allegation: string;
  priority: 'low'|'medium'|'high'|'critical'; severity: 'low'|'medium'|'high'|'critical';
  assigned_investigator: string | null; status: 'opened'|'evidence_gathering'|'analysis'|'proposed_outcome'|'closed';
  due_date: string | null; outcome: string | null; closure_reason: string | null;
  opened_by: string | null; closed_by: string | null; closed_at: string | null;
  metadata: any; created_at: string; updated_at: string;
}
export interface ConductEvidence {
  id: string; title: string; evidence_type: string; file_url: string | null; file_id: string | null;
  description: string | null; source: string | null; restricted: boolean; confidentiality_level: string;
  complaint_id: string | null; investigation_id: string | null; thematic_review_id: string | null;
  alert_id: string | null; action_id: string | null; entity_id: string | null;
  uploaded_by: string | null; uploaded_at: string; metadata: any;
}
export interface MonitoringRuleRun {
  id: string; rule_id: string | null; started_at: string; completed_at: string | null;
  executed_by: string | null; status: 'started'|'success'|'failed'; matched_count: number;
  alerts_created: number; error: string | null; summary: any;
}

// ---------- Entity summary ----------
export function useConductEntitySummary(entityId: string | undefined) {
  return useQuery({
    enabled: !!entityId,
    queryKey: ['conduct-entity-summary', entityId],
    queryFn: async () => {
      const { data, error } = await sb.rpc('conduct_entity_profile_summary', { _entity_id: entityId });
      if (error) throw new Error(error.message);
      return (data ?? {}) as Record<string, number>;
    },
  });
}

export function useConductEntityAuditHistory(entityId: string | undefined) {
  return useQuery({
    enabled: !!entityId,
    queryKey: ['conduct-entity-audit', entityId],
    queryFn: async () => {
      const { data, error } = await sb.rpc('conduct_entity_audit_history', { _entity_id: entityId });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
}

// ---------- Investigations ----------
export function useInvestigations(filters: { licensee_id?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['conduct-investigations', filters],
    queryFn: async () => {
      let q = sb.from('conduct_investigations').select('*, licensees(name)').order('created_at', { ascending: false }).limit(200);
      if (filters.licensee_id) q = q.eq('licensee_id', filters.licensee_id);
      if (filters.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
}

export function useInvestigation(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['conduct-investigation', id],
    queryFn: async () => {
      const { data, error } = await sb.from('conduct_investigations').select('*, licensees(name)').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
}

export function useCreateInvestigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ConductInvestigation> & { allegation: string; source_type: string }) => {
      await authorizedAction('conduct_management', 'create', { allegation: payload.allegation });
      const { data: user } = await supabase.auth.getUser();
      const body: any = { ...payload, opened_by: user.user?.id ?? null };
      const { data, error } = await sb.from('conduct_investigations').insert(body).select('*').single();
      if (error) throw new Error(error.message);
      await audit('CREATE', 'conduct_investigation', data.id, null, data);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-investigations'] }); toast.success('Investigation opened'); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateInvestigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, justification }: { id: string; patch: Partial<ConductInvestigation>; justification?: string }) => {
      const { data: before } = await sb.from('conduct_investigations').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_investigations').update(patch).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      const closing = patch.status === 'closed' && before?.status !== 'closed';
      await audit(closing ? 'APPROVE' : 'UPDATE', 'conduct_investigation', id, before, data, justification);
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['conduct-investigations'] });
      qc.invalidateQueries({ queryKey: ['conduct-investigation', v.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Evidence ----------
export function useEvidence(filter: { entity_id?: string; investigation_id?: string; complaint_id?: string; thematic_review_id?: string } = {}) {
  return useQuery({
    queryKey: ['conduct-evidence', filter],
    queryFn: async () => {
      let q = sb.from('conduct_evidence').select('*').order('uploaded_at', { ascending: false });
      if (filter.entity_id) q = q.eq('entity_id', filter.entity_id);
      if (filter.investigation_id) q = q.eq('investigation_id', filter.investigation_id);
      if (filter.complaint_id) q = q.eq('complaint_id', filter.complaint_id);
      if (filter.thematic_review_id) q = q.eq('thematic_review_id', filter.thematic_review_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ConductEvidence[];
    },
  });
}

export function useUploadEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ConductEvidence> & { title: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await sb.from('conduct_evidence')
        .insert({ ...payload, uploaded_by: user.user?.id ?? null })
        .select('*').single();
      if (error) throw new Error(error.message);
      await audit('CREATE', 'conduct_evidence', data.id, null, data);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-evidence'] }); toast.success('Evidence uploaded'); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleEvidenceRestriction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, restricted, reason }: { id: string; restricted: boolean; reason: string }) => {
      const { data: before } = await sb.from('conduct_evidence').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_evidence').update({ restricted }).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await sb.rpc('log_conduct_evidence_access', { _evidence_id: id, _action: restricted ? 'restrict' : 'unrestrict', _reason: reason });
      await audit('UPDATE', 'conduct_evidence', id, before, data, reason);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conduct-evidence'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

/**
 * Record an evidence view/download. Callers should first verify the row is
 * readable — if the RLS-filtered select returned nothing for a restricted
 * item, call `logEvidenceAccessDenied` instead.
 */
export async function logEvidenceAccess(evidenceId: string, action: 'view' | 'download', reason?: string) {
  try {
    if (action === 'download') {
      await authorizedAction('conduct_management', 'export', { evidence_id: evidenceId, reason });
    }
    await sb.rpc('log_conduct_evidence_access', { _evidence_id: evidenceId, _action: action, _reason: reason ?? null });
    await audit('EXPORT', 'conduct_evidence', evidenceId, null, { action }, reason);
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[evidence access] failed', e);
  }
}

export async function logEvidenceAccessDenied(evidenceId: string, reason: string) {
  try {
    await sb.rpc('log_conduct_evidence_access', { _evidence_id: evidenceId, _action: 'denied', _reason: reason });
    await audit('ACCESS_DENIED', 'conduct_evidence', evidenceId, null, null, reason);
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[evidence denied] failed', e);
  }
}

// ---------- Internal complaint intake ----------
export function useCreateInternalComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      // Canonical intake — server RPC handles complaint number, audit, notifications
      const validPriorities = ['p1', 'p2', 'p3', 'p4'];
      const validCustomerTypes = ['retail', 'sme', 'corporate', 'vulnerable', 'other'];
      // NOTE: severity is deliberately NOT sent. It is assigned by the backend
      // from complaint intake/triage configuration.
      const rpcPayload: Record<string, unknown> = {
        subject: payload.subject,
        description: payload.description,
        licensee_id: payload.licensee_id ?? null,
        complaint_type_id: payload.complaint_type_id ?? null,
        conduct_risk_category_id: payload.conduct_risk_category_id ?? null,
        product_id: payload.product_id ?? null,
        channel_id: payload.channel_id ?? null,
        priority: validPriorities.includes(payload.priority) ? payload.priority : 'p3',
        email: emptyToNull(payload.email),
        customer_type: validCustomerTypes.includes(payload.customer_type) ? payload.customer_type : null,
        vulnerability_indicator: !!payload.vulnerability_indicator,
        vulnerability_notes: emptyToNull(payload.vulnerability_notes),
        intake_source: payload.intake_source ?? 'internal',
      };
      const { data, error } = await (sb as any).rpc('create_complaint', { _payload: rpcPayload });
      if (error) {
        if (import.meta.env.DEV) console.error('[internal complaint create_complaint] failed', error);
        throw new Error([error.message, (error as any).details, (error as any).hint].filter(Boolean).join(' '));
      }

      // Triage is enqueued server-side via trg_complaint_triage_enqueue.
      // No client-side edge invoke here — prevents duplicate triage runs.

      return data as any;
    },


    onSuccess: () => { qc.invalidateQueries({ queryKey: ['complaints'] }); toast.success('Complaint recorded'); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Alert lifecycle ----------
export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data: before } = await sb.from('conduct_alerts').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_alerts').update({
        status: 'acknowledged', acknowledged_by: user.user?.id ?? null, acknowledged_at: new Date().toISOString(),
      }).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await audit('UPDATE', 'conduct_alert', id, before, data);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conduct-alerts'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCloseAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!reason || reason.trim().length < 5) throw new Error('Closure reason required (min 5 chars)');
      const { data: user } = await supabase.auth.getUser();
      const { data: before } = await sb.from('conduct_alerts').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_alerts').update({
        status: 'closed', closed_by: user.user?.id ?? null, closed_at: new Date().toISOString(),
        closure_reason: reason,
      }).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await audit(before?.status === 'open' ? 'OVERRIDE' : 'UPDATE', 'conduct_alert', id, before, data, reason);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conduct-alerts'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Action lifecycle ----------
export function useCompleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, outcome, completion_notes }: { id: string; outcome: string; completion_notes: string }) => {
      if (!outcome?.trim() || !completion_notes?.trim()) throw new Error('Outcome and completion notes are required');
      const { data: user } = await supabase.auth.getUser();
      const { data: before } = await sb.from('conduct_actions').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_actions').update({
        status: 'completed', outcome, completion_notes,
        closed_by: user.user?.id ?? null, closed_at: new Date().toISOString(),
      }).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await audit('UPDATE', 'conduct_action', id, before, data);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-actions'] }); toast.success('Action completed'); },
    onError: (e: any) => toast.error(e.message),
  });
}
export function useWaiveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, waiver_reason }: { id: string; waiver_reason: string }) => {
      if (!waiver_reason?.trim() || waiver_reason.trim().length < 10) throw new Error('Waiver reason required (min 10 chars)');
      const { data: user } = await supabase.auth.getUser();
      const { data: before } = await sb.from('conduct_actions').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_actions').update({
        status: 'waived', waiver_reason, closed_by: user.user?.id ?? null, closed_at: new Date().toISOString(),
      }).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await audit('OVERRIDE', 'conduct_action', id, before, data, waiver_reason);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-actions'] }); toast.success('Action waived'); },
    onError: (e: any) => toast.error(e.message),
  });
}
export function useCancelAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cancellation_reason }: { id: string; cancellation_reason: string }) => {
      if (!cancellation_reason?.trim() || cancellation_reason.trim().length < 10) throw new Error('Cancellation reason required (min 10 chars)');
      const { data: user } = await supabase.auth.getUser();
      const { data: before } = await sb.from('conduct_actions').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_actions').update({
        status: 'cancelled', cancellation_reason, closed_by: user.user?.id ?? null, closed_at: new Date().toISOString(),
      }).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await audit('OVERRIDE', 'conduct_action', id, before, data, cancellation_reason);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduct-actions'] }); toast.success('Action cancelled'); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Monitoring rule runs ----------
export function useMonitoringRuleRuns(ruleId: string | undefined) {
  return useQuery({
    enabled: !!ruleId,
    queryKey: ['conduct-monitoring-runs', ruleId],
    queryFn: async () => {
      const { data, error } = await sb.from('conduct_monitoring_rule_runs')
        .select('*').eq('rule_id', ruleId).order('started_at', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as MonitoringRuleRun[];
    },
  });
}
