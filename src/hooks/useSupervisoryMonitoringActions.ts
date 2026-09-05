/**
 * OS-02D — Monitoring → supervisory action convergence (read + governed commands).
 *
 * The browser never decides what may be done from a monitoring row and never
 * writes a supervisory record itself. Both the list of possible next steps and
 * the reason a step is unavailable come from
 * `supervisory_monitoring_action_capabilities`; the provenance of every
 * monitoring state comes from `supervisory_monitoring_provenance`.
 *
 * The two write paths delegate to the canonical attention and reassessment
 * contracts server-side, are de-duplicated on a repeated condition, and create
 * no monitoring object of any kind.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type MonitoringActionKind = 'NAVIGATE' | 'COMMAND' | 'GATED';

export interface MonitoringActionTarget {
  module?: string | null;
  record_id?: string | null;
  reference?: string | null;
  route?: string | null;
  status?: string | null;
  stage?: string | null;
  severity?: string | null;
  due_date?: string | null;
  engagement_type?: string | null;
  intervention_type?: string | null;
  execution_kind?: string | null;
  note?: string | null;
}

export interface MonitoringAction {
  code: string;
  label: string;
  kind: MonitoringActionKind;
  command?: string | null;
  allowed: boolean;
  reason?: string | null;
  requires?: string | null;
  origin?: Record<string, unknown> | null;
  target?: MonitoringActionTarget | null;
}

export interface MonitoringCapabilities {
  entity_id: string;
  domain_code: string;
  as_of: string;
  readable: boolean;
  reason?: string | null;
  lifecycle?: string | null;
  permissions?: {
    may_open_attention: boolean;
    may_require_reassessment: boolean;
    may_open_examination: boolean;
    entity_in_action_scope: boolean;
  } | null;
  actions: MonitoringAction[];
}

export interface MonitoringProvenanceItem {
  state: string;
  present: boolean;
  source_table: string;
  source_id?: string | null;
  reference?: string | null;
  status?: string | null;
  value?: string | null;
  as_of?: string | null;
  due_date?: string | null;
  route?: string | null;
  note?: string | null;
}

export interface MonitoringProvenance {
  entity_id?: string;
  domain_code?: string;
  as_of?: string;
  readable: boolean;
  reason?: string | null;
  items: MonitoringProvenanceItem[];
  note?: string | null;
}

export function useMonitoringActionCapabilities(
  entityId: string | null,
  domainCode: string | null,
) {
  return useQuery({
    queryKey: ['supervisory-monitoring-capabilities', entityId, domainCode],
    enabled: Boolean(entityId && domainCode),
    staleTime: 15_000,
    queryFn: () => rpc<MonitoringCapabilities>('supervisory_monitoring_action_capabilities', {
      _entity_id: entityId,
      _domain_code: domainCode,
    }),
  });
}

export function useMonitoringProvenance(
  entityId: string | null,
  domainCode: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['supervisory-monitoring-provenance', entityId, domainCode],
    enabled: enabled && Boolean(entityId && domainCode),
    staleTime: 15_000,
    queryFn: () => rpc<MonitoringProvenance>('supervisory_monitoring_provenance', {
      _entity_id: entityId,
      _domain_code: domainCode,
    }),
  });
}

export interface RaiseAttentionInput {
  entityId: string;
  domainCode: string;
  supervisoryBasis: string;
  signalId?: string | null;
  assessmentId?: string | null;
  targetReviewDate?: string | null;
  title?: string | null;
}

export interface RaiseAttentionResult {
  created: boolean;
  deduplicated: boolean;
  attention_id: string;
  reference?: string | null;
  status?: string | null;
  route?: string | null;
  reason?: string | null;
}

export interface RequireReassessmentInput {
  entityId: string;
  domainCode: string;
  triggerRationale: string;
  signalId?: string | null;
  requestedType?: string | null;
  dueDate?: string | null;
}

export interface RequireReassessmentResult {
  created: boolean;
  deduplicated: boolean;
  requirement_id: string;
  status?: string | null;
  due_date?: string | null;
  reason?: string | null;
  note?: string | null;
}

function useConvergenceInvalidation() {
  const qc = useQueryClient();
  return (entityId: string, domainCode: string) => {
    qc.invalidateQueries({ queryKey: ['supervisory-monitoring-register'] });
    qc.invalidateQueries({ queryKey: ['supervisory-monitoring-capabilities', entityId, domainCode] });
    qc.invalidateQueries({ queryKey: ['supervisory-monitoring-provenance', entityId, domainCode] });
  };
}

export function useRaiseSupervisoryAttention() {
  const invalidate = useConvergenceInvalidation();
  return useMutation({
    mutationFn: (input: RaiseAttentionInput) =>
      rpc<RaiseAttentionResult>('supervisory_monitoring_raise_attention', {
        _entity_id: input.entityId,
        _domain_code: input.domainCode,
        _supervisory_basis: input.supervisoryBasis,
        _signal_id: input.signalId ?? null,
        _assessment_id: input.assessmentId ?? null,
        _target_review_date: input.targetReviewDate ?? null,
        _title: input.title ?? null,
      }),
    onSuccess: (_r, input) => invalidate(input.entityId, input.domainCode),
  });
}

export function useRequireReassessment() {
  const invalidate = useConvergenceInvalidation();
  return useMutation({
    mutationFn: (input: RequireReassessmentInput) =>
      rpc<RequireReassessmentResult>('supervisory_monitoring_require_reassessment', {
        _entity_id: input.entityId,
        _domain_code: input.domainCode,
        _trigger_rationale: input.triggerRationale,
        _signal_id: input.signalId ?? null,
        _requested_type: input.requestedType ?? 'TARGETED',
        _due_date: input.dueDate ?? null,
      }),
    onSuccess: (_r, input) => invalidate(input.entityId, input.domainCode),
  });
}
