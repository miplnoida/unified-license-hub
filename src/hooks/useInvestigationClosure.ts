// ============================================================
// Formal Investigation — Closure & Discontinuation (Market Conduct)
// Every state transition goes through a SECURITY DEFINER RPC so
// authorisation, mandatory-reason rules, the readiness gate, audit
// logging and notification enqueueing are enforced server-side.
// ============================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as any;

export type DeterminationType =
  | 'closure_with_enforcement'
  | 'closure_no_further_action'
  | 'discontinuation';

export type ClosureStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type MonitoringFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export interface InvestigationClosure {
  id: string;
  investigation_id: string;
  version: number;
  determination_type: DeterminationType;
  status: ClosureStatus;
  findings_summary: string | null;
  evidence_relied_upon: string | null;
  rationale: string | null;
  next_steps: string | null;
  regulatory_learning: string | null;
  discontinuation_ground: string | null;
  discontinuation_detail: string | null;
  enforcement_action_id: string | null;
  entity_letter_required: boolean;
  readiness_snapshot: ClosureReadiness | Record<string, never>;
  override_reason: string | null;
  prepared_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approver_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface ClosureBreach {
  id: string;
  closure_id: string;
  provision: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  substantiated: boolean;
  evidence_reference: string | null;
  created_at: string;
}

export interface PostClosureMonitoring {
  id: string;
  investigation_id: string;
  closure_id: string | null;
  licensee_id: string | null;
  focus_areas: string;
  indicators: string | null;
  entity_reporting_requirement: string | null;
  frequency: MonitoringFrequency;
  start_date: string;
  end_date: string | null;
  next_review_date: string | null;
  owner_id: string | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  activated_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface MonitoringReview {
  id: string;
  monitoring_id: string;
  due_date: string;
  status: 'scheduled' | 'completed' | 'missed';
  observations: string | null;
  outcome: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  escalated: boolean;
}

export interface ClosureReadiness {
  unfinalised_interviews: number;
  evidence_count: number;
  open_actions: number;
  has_enforcement_link: boolean;
}

export const DISCONTINUATION_GROUNDS: Array<{ value: string; label: string }> = [
  { value: 'insufficient_evidence', label: 'Insufficient evidence' },
  { value: 'no_breach_found', label: 'No breach found' },
  { value: 'resolved_by_entity', label: 'Matter resolved by the entity' },
  { value: 'duplicate_case', label: 'Duplicate of another case' },
  { value: 'out_of_jurisdiction', label: 'Outside regulatory jurisdiction' },
  { value: 'entity_ceased', label: 'Entity ceased operations' },
  { value: 'other', label: 'Other (describe)' },
];

const invKey = (id?: string) => ['conduct-closure', id] as const;

// ---------- Queries ----------
export function useInvestigationClosures(investigationId: string | undefined) {
  return useQuery({
    enabled: !!investigationId,
    queryKey: [...invKey(investigationId), 'list'],
    queryFn: async (): Promise<InvestigationClosure[]> => {
      const { data, error } = await sb
        .from('conduct_investigation_closures')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as InvestigationClosure[];
    },
  });
}

export function useClosureBreaches(closureId: string | undefined) {
  return useQuery({
    enabled: !!closureId,
    queryKey: ['conduct-closure-breaches', closureId],
    queryFn: async (): Promise<ClosureBreach[]> => {
      const { data, error } = await sb
        .from('conduct_closure_breaches')
        .select('*')
        .eq('closure_id', closureId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ClosureBreach[];
    },
  });
}

export function useClosureReadiness(investigationId: string | undefined) {
  return useQuery({
    enabled: !!investigationId,
    queryKey: [...invKey(investigationId), 'readiness'],
    queryFn: async (): Promise<ClosureReadiness> => {
      const { data, error } = await sb.rpc('conduct_closure_readiness', {
        _investigation_id: investigationId,
      });
      if (error) throw new Error(error.message);
      return (data ?? {
        unfinalised_interviews: 0, evidence_count: 0, open_actions: 0, has_enforcement_link: false,
      }) as ClosureReadiness;
    },
  });
}

export function useMonitoringDirectives(investigationId: string | undefined) {
  return useQuery({
    enabled: !!investigationId,
    queryKey: ['conduct-monitoring-directives', investigationId],
    queryFn: async (): Promise<PostClosureMonitoring[]> => {
      const { data, error } = await sb
        .from('conduct_post_closure_monitoring')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as PostClosureMonitoring[];
    },
  });
}

export function useMonitoringDirectivesForEntity(licenseeId: string | undefined) {
  return useQuery({
    enabled: !!licenseeId,
    queryKey: ['conduct-monitoring-directives-entity', licenseeId],
    queryFn: async (): Promise<PostClosureMonitoring[]> => {
      const { data, error } = await sb
        .from('conduct_post_closure_monitoring')
        .select('*')
        .eq('licensee_id', licenseeId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as PostClosureMonitoring[];
    },
  });
}

export function useMonitoringReviews(monitoringId: string | undefined) {
  return useQuery({
    enabled: !!monitoringId,
    queryKey: ['conduct-monitoring-reviews', monitoringId],
    queryFn: async (): Promise<MonitoringReview[]> => {
      const { data, error } = await sb
        .from('conduct_monitoring_reviews')
        .select('*')
        .eq('monitoring_id', monitoringId)
        .order('due_date', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as MonitoringReview[];
    },
  });
}

/** Supervisor queue: closure determinations awaiting an approval decision. */
export function useClosureApprovalQueue() {
  return useQuery({
    queryKey: ['conduct-closure-approval-queue'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('conduct_investigation_closures')
        .select('*, conduct_investigations(id, code, allegation, status, licensee_id, licensees(name))')
        .eq('status', 'pending_approval')
        .order('submitted_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
}

// ---------- Mutations ----------
function useInvalidate(investigationId?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: invKey(investigationId) });
    qc.invalidateQueries({ queryKey: ['conduct-monitoring-directives', investigationId] });
    qc.invalidateQueries({ queryKey: ['conduct-closure-approval-queue'] });
    qc.invalidateQueries({ queryKey: ['conduct-investigation', investigationId] });
    qc.invalidateQueries({ queryKey: ['conduct-investigations'] });
  };
}

export interface ClosureDraftInput {
  investigation_id: string;
  closure_id?: string | null;
  determination_type: DeterminationType;
  findings_summary?: string | null;
  evidence_relied_upon?: string | null;
  rationale?: string | null;
  next_steps?: string | null;
  regulatory_learning?: string | null;
  discontinuation_ground?: string | null;
  discontinuation_detail?: string | null;
  entity_letter_required?: boolean;
  approver_id?: string | null;
}

export function useSaveClosureDraft(investigationId?: string) {
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (input: ClosureDraftInput): Promise<string> => {
      const { data, error } = await sb.rpc('conduct_closure_upsert_draft', {
        _investigation_id: input.investigation_id,
        _closure_id: input.closure_id ?? null,
        _determination_type: input.determination_type,
        _findings_summary: input.findings_summary ?? null,
        _evidence_relied_upon: input.evidence_relied_upon ?? null,
        _rationale: input.rationale ?? null,
        _next_steps: input.next_steps ?? null,
        _regulatory_learning: input.regulatory_learning ?? null,
        _discontinuation_ground: input.discontinuation_ground ?? null,
        _discontinuation_detail: input.discontinuation_detail ?? null,
        _entity_letter_required: input.entity_letter_required ?? false,
        _approver_id: input.approver_id ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => { invalidate(); toast.success('Closure determination saved'); },
    onError: (e: any) => toast.error(e.message || 'Could not save the closure determination'),
  });
}

export function useSubmitClosure(investigationId?: string) {
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (p: { closure_id: string; approver_id?: string | null; override_reason?: string | null }) => {
      const { error } = await sb.rpc('conduct_closure_submit', {
        _closure_id: p.closure_id,
        _approver_id: p.approver_id ?? null,
        _override_reason: p.override_reason ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { invalidate(); toast.success('Closure submitted for supervisory approval'); },
    onError: (e: any) => toast.error(e.message || 'Could not submit the closure'),
  });
}

export function useApproveClosure(investigationId?: string) {
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (p: { closure_id: string; decision_note?: string | null }) => {
      const { error } = await sb.rpc('conduct_closure_approve', {
        _closure_id: p.closure_id,
        _decision_note: p.decision_note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { invalidate(); toast.success('Closure approved'); },
    onError: (e: any) => toast.error(e.message || 'Could not approve the closure'),
  });
}

export function useRejectClosure(investigationId?: string) {
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (p: { closure_id: string; reason: string }) => {
      const { error } = await sb.rpc('conduct_closure_reject', {
        _closure_id: p.closure_id,
        _reason: p.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { invalidate(); toast.success('Closure returned to the investigator'); },
    onError: (e: any) => toast.error(e.message || 'Could not return the closure'),
  });
}

export function useLinkEnforcement(investigationId?: string) {
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (p: {
      closure_id: string;
      enforcement_action_id?: string | null;
      create_new?: boolean;
      enforcement_type?: string;
    }) => {
      const { data, error } = await sb.rpc('conduct_closure_link_enforcement', {
        _closure_id: p.closure_id,
        _enforcement_action_id: p.enforcement_action_id ?? null,
        _create_new: p.create_new ?? false,
        _enforcement_type: p.enforcement_type ?? 'warning',
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => { invalidate(); toast.success('Enforcement referral recorded'); },
    onError: (e: any) => toast.error(e.message || 'Could not record the enforcement referral'),
  });
}

export function useSaveMonitoringDirective(investigationId?: string) {
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (p: {
      investigation_id: string;
      monitoring_id?: string | null;
      closure_id?: string | null;
      focus_areas: string;
      indicators?: string | null;
      entity_reporting_requirement?: string | null;
      frequency: MonitoringFrequency;
      start_date?: string | null;
      end_date?: string | null;
      owner_id?: string | null;
    }) => {
      const { data, error } = await sb.rpc('conduct_monitoring_directive_upsert', {
        _investigation_id: p.investigation_id,
        _monitoring_id: p.monitoring_id ?? null,
        _closure_id: p.closure_id ?? null,
        _focus_areas: p.focus_areas,
        _indicators: p.indicators ?? null,
        _entity_reporting_requirement: p.entity_reporting_requirement ?? null,
        _frequency: p.frequency,
        _start_date: p.start_date ?? null,
        _end_date: p.end_date ?? null,
        _owner_id: p.owner_id ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => { invalidate(); toast.success('Monitoring directive saved'); },
    onError: (e: any) => toast.error(e.message || 'Could not save the monitoring directive'),
  });
}

export function useRecordMonitoringReview(investigationId?: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate(investigationId);
  return useMutation({
    mutationFn: async (p: {
      review_id: string; monitoring_id: string; observations: string;
      outcome?: string; escalate?: boolean;
    }) => {
      const { error } = await sb.rpc('conduct_monitoring_review_record', {
        _review_id: p.review_id,
        _observations: p.observations,
        _outcome: p.outcome ?? 'satisfactory',
        _escalate: p.escalate ?? false,
      });
      if (error) throw new Error(error.message);
      return p.monitoring_id;
    },
    onSuccess: (monitoringId) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['conduct-monitoring-reviews', monitoringId] });
      toast.success('Monitoring review recorded');
    },
    onError: (e: any) => toast.error(e.message || 'Could not record the monitoring review'),
  });
}
