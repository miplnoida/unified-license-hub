import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as any;

// ─── Reference data ───
export const OPERATOR_TYPES = [
  { value: 'rtgs', label: 'RTGS' },
  { value: 'ach', label: 'ACH' },
  { value: 'card_network', label: 'Card network' },
  { value: 'e_money', label: 'E-money' },
  { value: 'cbdc', label: 'CBDC' },
  { value: 'msb', label: 'Money service business' },
  { value: 'securities_settlement', label: 'Securities settlement / CSD' },
  { value: 'other', label: 'Other' },
];

export const LICENSE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'provisional', label: 'Provisional' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'surrendered', label: 'Surrendered' },
];

export const OBSERVANCE_LEVELS = [
  { value: 'observed', label: 'Observed' },
  { value: 'broadly_observed', label: 'Broadly observed' },
  { value: 'partly_observed', label: 'Partly observed' },
  { value: 'not_observed', label: 'Not observed' },
  { value: 'not_applicable', label: 'Not applicable' },
];

export const INCIDENT_TYPES = [
  { value: 'settlement_failure', label: 'Settlement failure' },
  { value: 'system_outage', label: 'System outage' },
  { value: 'cyber_incident', label: 'Cyber incident' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'data_breach', label: 'Data breach' },
  { value: 'third_party_failure', label: 'Third-party failure' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_TYPES = [
  { value: 'cards', label: 'Cards' },
  { value: 'ach_credit', label: 'ACH credit' },
  { value: 'ach_debit', label: 'ACH debit' },
  { value: 'rtgs_transfer', label: 'RTGS transfer' },
  { value: 'e_money', label: 'E-money' },
  { value: 'remittance', label: 'Remittance' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export const AML_STATUSES = [
  { value: 'compliant', label: 'Compliant' },
  { value: 'minor_findings', label: 'Minor findings' },
  { value: 'material_findings', label: 'Material findings' },
  { value: 'non_compliant', label: 'Non-compliant' },
  { value: 'not_assessed', label: 'Not assessed' },
];

export const labelOf = (list: { value: string; label: string }[], v?: string | null) =>
  list.find(i => i.value === v)?.label ?? (v ? v.replace(/_/g, ' ') : '—');

export const observanceTone = (v?: string | null) => {
  switch (v) {
    case 'observed': return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    case 'broadly_observed': return 'bg-primary/10 text-primary border-primary/20';
    case 'partly_observed': return 'bg-warning/10 text-warning border-warning/20';
    case 'not_observed': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'not_applicable': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
};

export function paymentOversightErrorMessage(err: any): string {
  const raw = String(err?.message ?? err ?? '');
  if (raw.includes('assessment_already_in_progress')) return 'This operator already has an assessment in progress.';
  if (raw.includes('principles_not_assessed')) {
    const n = raw.match(/principles_not_assessed:\s*(\d+)/)?.[1];
    return n
      ? `${n} applicable principle${n === '1' ? '' : 's'} still need a regulatory score before completion.`
      : 'Every applicable principle needs a regulatory score before completion.';
  }
  if (raw.includes('assessment_not_editable')) return 'A completed assessment cannot be edited.';
  if (raw.includes('assessment_already_completed')) return 'This assessment is already completed.';
  if (raw.includes('incident_already_resolved')) return 'This incident is already resolved.';
  if (raw.includes('invalid_regulatory_score')) return 'That regulatory score is not valid.';
  if (raw.includes('operator_not_found')) return 'Operator not found.';
  if (raw.includes('not_authorised')) return 'You do not have permission to perform this action.';
  return raw || 'Action failed';
}

// ─── Types ───
export interface OperatorRow {
  id: string;
  reference: string;
  operator_name: string;
  operator_type: string;
  entity_id: string | null;
  licence_number: string | null;
  license_status: string;
  designation_date: string | null;
  systemically_important: boolean;
  active_agents_count: number | null;
  aml_compliance_status: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  last_pfmi_assessment_date: string | null;
  pfmi_compliance_level: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  open_incidents?: number;
}

export interface PfmiAssessmentRow {
  id: string;
  reference: string;
  operator_id: string;
  assessment_year: number;
  status: string;
  overall_rating: string | null;
  summary: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface PfmiPrincipleRow {
  id: string;
  assessment_id: string;
  principle_number: number;
  self_score: string | null;
  regulatory_score: string | null;
  narrative: string | null;
  evidence: any[];
  assessed_at: string | null;
}

export interface IncidentRow {
  id: string;
  reference: string;
  operator_id: string;
  incident_type: string;
  severity: string;
  title: string;
  description: string | null;
  occurred_at: string;
  notification_received_at: string | null;
  affected_transactions: number | null;
  affected_value: number | null;
  resolution_status: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  notification_delay_minutes: number | null;
  sla_breached: boolean;
}

// ─── Config ───
export function usePaymentOversightConfig() {
  return useQuery({
    queryKey: ['payment-oversight-config'],
    queryFn: async () => {
      const { data, error } = await sb.from('payment_oversight_config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data as { incident_notification_hours: number; pfmi_assessment_frequency_months: number } | null;
    },
    staleTime: 60_000,
  });
}

export function useUpdatePaymentOversightConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb
        .from('payment_oversight_config')
        .update({ ...updates, updated_by: auth?.user?.id ?? null })
        .eq('id', 1);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-oversight-config'] });
      toast.success('Oversight settings saved');
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

// ─── Operators ───
export function usePaymentOperators(filters?: { operator_type?: string; license_status?: string; msbOnly?: boolean }) {
  return useQuery({
    queryKey: ['payment-operators', filters ?? {}],
    queryFn: async (): Promise<OperatorRow[]> => {
      let q = sb.from('payment_system_operators').select('*').order('operator_name');
      if (filters?.operator_type) q = q.eq('operator_type', filters.operator_type);
      if (filters?.license_status) q = q.eq('license_status', filters.license_status);
      if (filters?.msbOnly) q = q.eq('operator_type', 'msb');
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as OperatorRow[];
      if (!rows.length) return rows;
      const { data: incidents } = await sb
        .from('payment_system_incidents')
        .select('id, operator_id, resolution_status')
        .in('operator_id', rows.map(r => r.id));
      const open = (incidents ?? []).filter((i: any) => i.resolution_status !== 'resolved');
      return rows.map(r => ({ ...r, open_incidents: open.filter((i: any) => i.operator_id === r.id).length }));
    },
    staleTime: 30_000,
  });
}

export function usePaymentOperator(id?: string) {
  return useQuery({
    queryKey: ['payment-operator', id],
    queryFn: async () => {
      const { data, error } = await sb.from('payment_system_operators').select('*').eq('id', id).single();
      if (error) throw error;
      let licensee: any = null;
      if (data?.entity_id) {
        const { data: l } = await sb.from('licensees').select('id, name').eq('id', data.entity_id).maybeSingle();
        licensee = l ?? null;
      }
      return { ...(data as OperatorRow), licensee };
    },
    enabled: !!id,
  });
}

export function useSaveOperator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, any>) => {
      if (id) {
        const { data, error } = await sb
          .from('payment_system_operators').update(payload).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await sb
        .from('payment_system_operators')
        .insert({ ...payload, created_by: auth?.user?.id ?? null })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v: any) => {
      qc.invalidateQueries({ queryKey: ['payment-operators'] });
      if (v?.id) qc.invalidateQueries({ queryKey: ['payment-operator', v.id] });
      toast.success(v?.id ? 'Operator updated' : 'Operator added to the register');
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

// ─── PFMI principles catalogue ───
export function usePfmiPrinciples() {
  return useQuery({
    queryKey: ['pfmi-principles'],
    queryFn: async () => {
      const { data, error } = await sb.from('pfmi_principles').select('*').order('principle_number');
      if (error) throw error;
      return (data ?? []) as { id: string; principle_number: number; title: string; category: string }[];
    },
    staleTime: 600_000,
  });
}

export function usePfmiApplicability(operatorType?: string) {
  return useQuery({
    queryKey: ['pfmi-applicability', operatorType ?? 'all'],
    queryFn: async () => {
      let q = sb.from('pfmi_principle_applicability').select('*').order('principle_number');
      if (operatorType) q = q.eq('operator_type', operatorType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { operator_type: string; principle_number: number }[];
    },
    staleTime: 600_000,
  });
}

// ─── Assessments ───
export function usePfmiAssessments(filters?: { operator_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['pfmi-assessments', filters ?? {}],
    queryFn: async (): Promise<PfmiAssessmentRow[]> => {
      let q = sb.from('pfmi_assessments').select('*').order('started_at', { ascending: false });
      if (filters?.operator_id) q = q.eq('operator_id', filters.operator_id);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PfmiAssessmentRow[];
    },
    staleTime: 30_000,
  });
}

export function usePfmiAssessment(id?: string) {
  return useQuery({
    queryKey: ['pfmi-assessment', id],
    queryFn: async () => {
      const { data, error } = await sb.from('pfmi_assessments').select('*').eq('id', id).single();
      if (error) throw error;
      const { data: op } = await sb
        .from('payment_system_operators').select('*').eq('id', data.operator_id).maybeSingle();
      return { ...(data as PfmiAssessmentRow), operator: (op ?? null) as OperatorRow | null };
    },
    enabled: !!id,
  });
}

export function usePfmiAssessmentPrinciples(assessmentId?: string) {
  return useQuery({
    queryKey: ['pfmi-assessment-principles', assessmentId],
    queryFn: async (): Promise<PfmiPrincipleRow[]> => {
      const { data, error } = await sb
        .from('pfmi_assessment_principles').select('*')
        .eq('assessment_id', assessmentId).order('principle_number');
      if (error) throw error;
      return (data ?? []) as PfmiPrincipleRow[];
    },
    enabled: !!assessmentId,
  });
}

export function useStartPfmiAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ operator_id, year }: { operator_id: string; year?: number }) => {
      const { data, error } = await sb.rpc('pfmi_start_assessment', {
        _operator_id: operator_id,
        _year: year ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; assessment_id: string; reference: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pfmi-assessments'] });
      qc.invalidateQueries({ queryKey: ['payment-operators'] });
      toast.success('PFMI assessment started');
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

export function useSavePfmiPrinciple(assessmentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      principle_number: number;
      self_score?: string | null;
      regulatory_score?: string | null;
      narrative?: string | null;
      evidence?: any[] | null;
    }) => {
      const { data, error } = await sb.rpc('pfmi_save_principle', {
        _assessment_id: assessmentId,
        _principle_number: p.principle_number,
        _self_score: p.self_score ?? null,
        _regulatory_score: p.regulatory_score ?? null,
        _narrative: p.narrative ?? null,
        _evidence: p.evidence ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pfmi-assessment-principles', assessmentId] });
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

export function useCompletePfmiAssessment(assessmentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (summary?: string) => {
      const { data, error } = await sb.rpc('pfmi_complete_assessment', {
        _assessment_id: assessmentId,
        _summary: summary ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; overall_rating: string };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['pfmi-assessment', assessmentId] });
      qc.invalidateQueries({ queryKey: ['pfmi-assessments'] });
      qc.invalidateQueries({ queryKey: ['payment-operators'] });
      qc.invalidateQueries({ queryKey: ['pfmi-observance'] });
      toast.success(`Assessment completed — ${labelOf(OBSERVANCE_LEVELS, d?.overall_rating)}`);
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

// ─── Observance dashboard ───
export function usePfmiObservance() {
  return useQuery({
    queryKey: ['pfmi-observance'],
    queryFn: async () => {
      const [opsRes, aRes] = await Promise.all([
        sb.from('payment_system_operators').select('*').eq('status', 'active').order('operator_name'),
        sb.from('pfmi_assessments').select('*').eq('status', 'completed').order('completed_at', { ascending: false }),
      ]);
      if (opsRes.error) throw opsRes.error;
      if (aRes.error) throw aRes.error;
      const operators = (opsRes.data ?? []) as OperatorRow[];
      const assessments = (aRes.data ?? []) as PfmiAssessmentRow[];

      // latest completed assessment per operator
      const latest = new Map<string, PfmiAssessmentRow>();
      for (const a of assessments) if (!latest.has(a.operator_id)) latest.set(a.operator_id, a);
      const ids = Array.from(latest.values()).map(a => a.id);

      let principles: PfmiPrincipleRow[] = [];
      if (ids.length) {
        const { data, error } = await sb
          .from('pfmi_assessment_principles').select('*').in('assessment_id', ids);
        if (error) throw error;
        principles = (data ?? []) as PfmiPrincipleRow[];
      }
      return { operators, latest, principles };
    },
    staleTime: 30_000,
  });
}

// ─── Incidents ───
export function usePaymentIncidents(filters?: { operator_id?: string; resolution_status?: string }) {
  return useQuery({
    queryKey: ['payment-incidents', filters ?? {}],
    queryFn: async (): Promise<IncidentRow[]> => {
      let q = sb.from('payment_system_incidents').select('*').order('occurred_at', { ascending: false });
      if (filters?.operator_id) q = q.eq('operator_id', filters.operator_id);
      if (filters?.resolution_status) q = q.eq('resolution_status', filters.resolution_status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IncidentRow[];
    },
    staleTime: 30_000,
  });
}

export function useRecordIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      operator_id: string;
      incident_type: string;
      title: string;
      occurred_at: string;
      notification_received_at?: string | null;
      severity?: string;
      description?: string | null;
      affected_transactions?: number | null;
      affected_value?: number | null;
    }) => {
      const { data, error } = await sb.rpc('payment_incident_record', {
        _operator_id: p.operator_id,
        _incident_type: p.incident_type,
        _title: p.title,
        _occurred_at: p.occurred_at,
        _notification_received_at: p.notification_received_at ?? null,
        _severity: p.severity ?? 'medium',
        _description: p.description ?? null,
        _affected_transactions: p.affected_transactions ?? null,
        _affected_value: p.affected_value ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; incident_id: string; reference: string; sla_breached: boolean };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['payment-incidents'] });
      qc.invalidateQueries({ queryKey: ['payment-operators'] });
      if (d?.sla_breached) toast.warning(`${d.reference} recorded — notification window breached, supervisor alerted`);
      else toast.success(`${d?.reference ?? 'Incident'} recorded`);
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data, error } = await sb.rpc('payment_incident_resolve', { _incident_id: id, _notes: notes ?? null });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-incidents'] });
      qc.invalidateQueries({ queryKey: ['payment-operators'] });
      toast.success('Incident resolved');
    },
    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

// ─── Retail payments data ───
export interface RetailVolumeRow {
  id: string;
  operator_id: string;
  period_start: string;
  period_end: string;
  payment_type: string;
  transaction_count: number;
  transaction_value: number;
  currency: string;
}

export function useRetailVolumes() {
  return useQuery({
    queryKey: ['payment-retail-volumes'],
    queryFn: async (): Promise<RetailVolumeRow[]> => {
      const { data, error } = await sb
        .from('payment_retail_volumes').select('*').order('period_start');
      if (error) throw error;
      return (data ?? []) as RetailVolumeRow[];
    },
    staleTime: 30_000,
  });
}

export function useSaveRetailVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data, error } = await sb.rpc('payment_retail_volume_record', {
        _operator_id: payload.operator_id,
        _period_start: payload.period_start,
        _period_end: payload.period_end,
        _payment_type: payload.payment_type,
        _transaction_count: payload.transaction_count ?? 0,
        _transaction_value: payload.transaction_value ?? 0,
        _currency: (payload.currency || 'JMD').toUpperCase(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-retail-volumes'] });
      qc.invalidateQueries({ queryKey: ['payment-oversight-events'] });
      toast.success('Retail payments figures saved');
    },

    onError: (e: any) => toast.error(paymentOversightErrorMessage(e)),
  });
}

// ─── Audit trail ───
export function usePaymentOversightEvents(filters?: { operator_id?: string; assessment_id?: string }) {
  return useQuery({
    queryKey: ['payment-oversight-events', filters ?? {}],
    queryFn: async () => {
      let q = sb.from('payment_oversight_events').select('*').order('created_at', { ascending: false }).limit(200);
      if (filters?.operator_id) q = q.eq('operator_id', filters.operator_id);
      if (filters?.assessment_id) q = q.eq('assessment_id', filters.assessment_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as {
        id: string; event_type: string; actor_id: string | null; notes: string | null;
        metadata: any; created_at: string;
      }[];
    },
    staleTime: 15_000,
  });
}
