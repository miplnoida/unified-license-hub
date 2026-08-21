/**
 * RDM-ENTITY-001 Wave C — data hooks for the canonical returns model:
 * return definitions, reporting obligations, periods, filings, versions,
 * regulatory metrics and the legacy classification workbench.
 *
 * Every write goes through a governed SECURITY DEFINER RPC; no component
 * mutates the Wave C tables directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ReturnFrequency =
  | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'EVENT_DRIVEN' | 'AD_HOC';

export interface ReturnDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  regulator_id: string | null;
  frequency: ReturnFrequency;
  filing_basis: 'SOLO' | 'CONSOLIDATED' | 'BOTH';
  consolidation_basis: string | null;
  currency_basis: string | null;
  due_days_after_period_end: number;
  requires_declaration: boolean;
  declaration_text: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  legacy_return_config_id: string | null;
}

export interface ReturnDefinitionForm {
  id: string;
  return_definition_id: string;
  form_template_id: string;
  sequence: number;
  is_required: boolean;
  section_label: string | null;
  tab_name: string | null;
}

export interface ObligationRule {
  id: string;
  return_definition_id: string;
  code: string;
  name: string;
  description: string | null;
  regulator_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  classification_value_id: string | null;
  lifecycle_stage_id: string | null;
  requires_active_license: boolean;
  jurisdiction: string | null;
  priority: number;
  frequency_override: ReturnFrequency | null;
  due_days_override: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

export interface RegulatoryMetric {
  id: string;
  code: string;
  name: string;
  description: string | null;
  data_domain_id: string | null;
  data_type: string;
  unit: string | null;
  aggregation_type: string;
  sensitivity: string;
  is_calculated: boolean;
  calculation_strategy: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

export interface MetricCalculationRule {
  id: string;
  regulatory_metric_id: string;
  version: number;
  expression: string;
  dependency_metric_codes: string[];
  on_missing_dependency: 'ERROR' | 'NOT_AVAILABLE';
  is_active: boolean;
}

export interface FilingQueueRow {
  filing_id: string;
  filing_reference: string;
  entity_id: string;
  entity_name: string | null;
  definition_code: string;
  definition_name: string;
  frequency: ReturnFrequency;
  period_label: string;
  period_end: string;
  due_date: string;
  status: string;
  current_version_number: number;
  current_version_id: string | null;
  submitted_at: string | null;
  is_overdue: boolean;
  days_late: number;
  blocking_errors: number;
  open_requests: number;
}

export interface EntityCalendarRow {
  obligation_id: string;
  period_id: string;
  definition_code: string;
  definition_name: string;
  frequency: ReturnFrequency;
  period_label: string;
  period_start: string;
  period_end: string;
  due_date: string;
  period_status: string;
  filing_id: string | null;
  filing_reference: string | null;
  filing_status: string | null;
  current_version_id: string | null;
  is_overdue: boolean;
  days_remaining: number;
}

export interface FilingDetail {
  filing: {
    id: string; filing_reference: string; entity_id: string; status: string;
    current_version_number: number; accepted_version_id: string | null;
    submitted_at: string | null; accepted_at: string | null; rejected_at: string | null;
  };
  entity_name: string | null;
  definition: ReturnDefinition;
  period: {
    id: string; period_label: string; period_start: string; period_end: string;
    due_date: string; status: string;
  };
  versions: Array<{
    id: string; version_number: number; status: string; is_immutable: boolean;
    legacy_origin: string | null; submitted_at: string | null; accepted_at: string | null;
    rejected_at: string | null; rejection_reason: string | null;
    declaration_accepted_at: string | null;
  }>;
  forms: Array<{
    id: string; form_template_id: string; form_version_id: string;
    template_name: string | null; form_version: number | null;
    is_required: boolean; sequence: number; tab_name: string | null;
    form_response_id: string | null; completion_status: string;
    return_filing_version_id: string;
  }>;
  metrics: Array<{
    code: string; name: string; unit: string | null;
    value_numeric: number | null; value_text: string | null;
    availability: string; availability_reason: string | null;
    source_kind: string; calculation_inputs: Record<string, unknown> | null;
  }>;
  findings: Array<{
    id: string; severity: string; rule_code: string; scope: string;
    message: string; is_blocking: boolean; detected_at: string;
  }>;
  requests: Array<{
    id: string; request_kind: string; message: string; status: string;
    response_text: string | null; created_at: string; responded_at: string | null;
  }>;
}

export interface LegacyClassificationReport {
  return_types: number;
  return_configs: number;
  legacy_filings: number;
  definitions_mapped: number;
  filings_migrated: number;
  classification: Record<string, number>;
  unclassified_filings: number;
  blockers: Array<{ issue: string; count: number }>;
}

/* ------------------------------------------------------------------ */
/* Configuration reads                                                 */
/* ------------------------------------------------------------------ */

const KEY = ['wave-c'] as const;

export function useReturnDefinitions() {
  return useQuery({
    queryKey: [...KEY, 'definitions'],
    queryFn: async (): Promise<ReturnDefinition[]> => {
      const { data, error } = await db().from('return_definitions')
        .select('*').order('code');
      if (error) throw new Error(error.message);
      return (data ?? []) as ReturnDefinition[];
    },
    staleTime: 30_000,
  });
}

export function useReturnDefinitionForms(definitionId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'definition-forms', definitionId],
    enabled: !!definitionId,
    queryFn: async (): Promise<ReturnDefinitionForm[]> => {
      const { data, error } = await db().from('return_definition_forms')
        .select('*').eq('return_definition_id', definitionId).order('sequence');
      if (error) throw new Error(error.message);
      return (data ?? []) as ReturnDefinitionForm[];
    },
  });
}

export function useObligationRules(definitionId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'obligation-rules', definitionId ?? 'all'],
    queryFn: async (): Promise<ObligationRule[]> => {
      let q = db().from('reporting_obligation_rules').select('*').order('priority');
      if (definitionId) q = q.eq('return_definition_id', definitionId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ObligationRule[];
    },
  });
}

export function useRegulatoryMetrics() {
  return useQuery({
    queryKey: [...KEY, 'metrics'],
    queryFn: async (): Promise<RegulatoryMetric[]> => {
      const { data, error } = await db().from('regulatory_metrics')
        .select('*').order('code');
      if (error) throw new Error(error.message);
      return (data ?? []) as RegulatoryMetric[];
    },
    staleTime: 30_000,
  });
}

export function useMetricCalculationRules() {
  return useQuery({
    queryKey: [...KEY, 'metric-rules'],
    queryFn: async (): Promise<MetricCalculationRule[]> => {
      const { data, error } = await db().from('metric_calculation_rules')
        .select('*').eq('is_active', true);
      if (error) throw new Error(error.message);
      return (data ?? []) as MetricCalculationRule[];
    },
  });
}

export function useEntityObligations(entityId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'entity-obligations', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db().from('entity_reporting_obligations')
        .select('*, return_definitions(code, name, frequency)')
        .eq('entity_id', entityId).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<Record<string, any>>;
    },
  });
}

export function useReportingPeriods(obligationId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'periods', obligationId],
    enabled: !!obligationId,
    queryFn: async () => {
      const { data, error } = await db().from('reporting_periods')
        .select('*').eq('entity_reporting_obligation_id', obligationId)
        .order('period_end', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<Record<string, any>>;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Operational reads                                                   */
/* ------------------------------------------------------------------ */

export function useFilingQueue(status?: string | null, entityId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'filing-queue', status ?? 'all', entityId ?? 'all'],
    queryFn: () => rpc<FilingQueueRow[]>('returns_filing_queue', {
      _status: status ?? null, _entity_id: entityId ?? null, _limit: 300,
    }),
    staleTime: 15_000,
  });
}

export function useEntityReportingCalendar(entityId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'entity-calendar', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityCalendarRow[]>('returns_entity_calendar', { _entity_id: entityId }),
    staleTime: 15_000,
  });
}

export function useFilingDetail(filingId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'filing-detail', filingId],
    enabled: !!filingId,
    queryFn: () => rpc<FilingDetail>('returns_filing_detail', { _filing_id: filingId }),
  });
}

/* ------------------------------------------------------------------ */
/* Version comparison + entity summary (Wave C closure)                */
/* ------------------------------------------------------------------ */

export interface FilingVersionSide {
  id: string;
  version_number: number;
  status: string;
  is_immutable: boolean;
  submitted_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  declaration_accepted_at: string | null;
}

export interface FilingVersionComparison {
  filing_reference: string;
  a: FilingVersionSide;
  b: FilingVersionSide;
  forms: Array<{
    template_id: string | null;
    template_name: string | null;
    a_form_version_id: string | null;
    b_form_version_id: string | null;
    form_version_pinning_changed: boolean;
    a_completion: string | null;
    b_completion: string | null;
    field_changes: Array<{
      field: string;
      old_value: unknown;
      new_value: unknown;
      change: 'ADDED' | 'REMOVED' | 'CHANGED';
    }>;
  }>;
  metrics: Array<{
    code: string; name: string; unit: string | null;
    a_value: number | null; b_value: number | null;
    a_availability: string | null; b_availability: string | null;
    delta: number | null; changed: boolean;
  }>;
  validation: {
    a: Array<{ rule_code: string; severity: string; message: string; is_blocking: boolean }>;
    b: Array<{ rule_code: string; severity: string; message: string; is_blocking: boolean }>;
  };
  requests: Array<{
    request_kind: string; message: string; status: string;
    response_text: string | null; created_at: string; responded_at: string | null;
  }>;
}

export function useFilingVersionComparison(versionA?: string | null, versionB?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'version-compare', versionA, versionB],
    enabled: !!versionA && !!versionB && versionA !== versionB,
    queryFn: () => rpc<FilingVersionComparison>('returns_compare_filing_versions', {
      _version_a: versionA, _version_b: versionB,
    }),
  });
}

export interface EntityReturnsSummary {
  entity_id: string;
  active_obligations: number;
  overdue_count: number;
  correction_requested_count: number;
  next_due: {
    definition_code: string; definition_name: string;
    period_label: string; due_date: string;
  } | null;
  recent_filings: Array<{
    filing_id: string; filing_reference: string; status: string;
    current_version_number: number; definition_code: string; definition_name: string;
    period_label: string; period_end: string; due_date: string; submitted_at: string | null;
  }>;
  latest_accepted_metrics: Array<{
    code: string; name: string; unit: string | null;
    value_numeric: number | null; availability: string;
    period_label: string; period_end: string;
  }>;
}

export function useEntityReturnsSummary(entityId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'entity-returns-summary', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityReturnsSummary>('returns_entity_summary', { _entity_id: entityId }),
    staleTime: 30_000,
  });
}



export function useMetricSeries(entityId?: string | null, codes?: string[]) {
  return useQuery({
    queryKey: [...KEY, 'metric-series', entityId, codes?.join(',') ?? 'all'],
    enabled: !!entityId,
    queryFn: () => rpc<Array<{
      metric_code: string; metric_name: string; unit: string | null;
      period_label: string; period_end: string; value_numeric: number | null;
      availability: string; source_kind: string;
    }>>('returns_metric_series', {
      _entity_id: entityId, _metric_codes: codes && codes.length ? codes : null, _limit: 24,
    }),
  });
}

export function useLegacyClassificationReport() {
  return useQuery({
    queryKey: [...KEY, 'legacy-report'],
    queryFn: () => rpc<LegacyClassificationReport>('returns_legacy_classification_report'),
    staleTime: 20_000,
  });
}

export function useLegacyMappings() {
  return useQuery({
    queryKey: [...KEY, 'legacy-mappings'],
    queryFn: async () => {
      const { data, error } = await db().from('returns_legacy_mappings')
        .select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<Record<string, any>>;
    },
  });
}

export function useLegacyFilings() {
  return useQuery({
    queryKey: [...KEY, 'legacy-filings'],
    queryFn: async () => {
      const { data, error } = await db().from('returns_filed')
        .select('id, unique_id, entity_id, return_configuration_id, return_year, return_period, workflow_status, period_start_date, period_end_date')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<Record<string, any>>;
    },
  });
}

export function useLegacyConfigs() {
  return useQuery({
    queryKey: [...KEY, 'legacy-configs'],
    queryFn: async () => {
      const { data, error } = await db().from('return_configs')
        .select('id, name, sector_id, return_type_id, status').order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<Record<string, any>>;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function useWaveCMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  return {
    saveDefinition: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        rpc<string>('returns_save_definition', { _payload: payload }),
      onSuccess: invalidate,
    }),
    saveObligationRule: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        rpc<string>('returns_save_obligation_rule', { _payload: payload }),
      onSuccess: invalidate,
    }),
    saveMetric: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        rpc<string>('returns_save_metric', { _payload: payload }),
      onSuccess: invalidate,
    }),
    bindFieldMetric: useMutation({
      mutationFn: (v: { fieldDefinitionId: string; metricId: string | null }) =>
        rpc('returns_bind_field_metric', {
          _field_definition_id: v.fieldDefinitionId, _metric_id: v.metricId,
        }),
      onSuccess: invalidate,
    }),
    deriveObligations: useMutation({
      mutationFn: (entityId: string) =>
        rpc<{ created: number; closed: number }>('returns_derive_entity_obligations', { _entity_id: entityId }),
      onSuccess: invalidate,
    }),
    generatePeriods: useMutation({
      mutationFn: (v: { obligationId: string; through?: string }) =>
        rpc<{ created: number; reason?: string }>('returns_generate_periods', {
          _obligation_id: v.obligationId, _through: v.through ?? null,
        }),
      onSuccess: invalidate,
    }),
    openFiling: useMutation({
      mutationFn: (periodId: string) =>
        rpc<{ filing_id: string; filing_reference: string; version_id: string }>(
          'returns_open_filing', { _period_id: periodId }),
      onSuccess: invalidate,
    }),
    attachFormResponse: useMutation({
      mutationFn: (v: { requirementId: string; formResponseId: string; completion?: string }) =>
        rpc('returns_attach_form_response', {
          _requirement_id: v.requirementId,
          _form_response_id: v.formResponseId,
          _completion: v.completion ?? 'COMPLETED',
        }),
      onSuccess: invalidate,
    }),
    validateFiling: useMutation({
      mutationFn: (versionId: string) =>
        rpc<{ errors: number; warnings: number; can_submit: boolean }>(
          'returns_validate_filing', { _version_id: versionId }),
      onSuccess: invalidate,
    }),
    submitFiling: useMutation({
      mutationFn: (v: { versionId: string; declarationAccepted: boolean }) =>
        rpc<{ submitted: boolean; validation: { errors: number; warnings: number; can_submit: boolean } }>(
          'returns_submit_filing', {
            _version_id: v.versionId, _declaration_accepted: v.declarationAccepted,
          }),
      onSuccess: invalidate,
    }),
    reviewFiling: useMutation({
      mutationFn: (v: { versionId: string; action: 'START_REVIEW' | 'ACCEPT' | 'REJECT' | 'REQUEST_CORRECTION'; reason?: string }) =>
        rpc<{ action: string; new_version_id: string | null }>('returns_review_filing', {
          _version_id: v.versionId, _action: v.action, _reason: v.reason ?? null,
        }),
      onSuccess: invalidate,
    }),
    respondToRequest: useMutation({
      mutationFn: (v: { requestId: string; response: string }) =>
        rpc('returns_respond_to_request', { _request_id: v.requestId, _response: v.response }),
      onSuccess: invalidate,
    }),
    classifyLegacy: useMutation({
      mutationFn: () => rpc<{ total_classified: number }>('returns_classify_legacy'),
      onSuccess: invalidate,
    }),
    adoptLegacyConfig: useMutation({
      mutationFn: (configId: string) =>
        rpc<string>('returns_adopt_legacy_config', { _config_id: configId }),
      onSuccess: invalidate,
    }),
    migrateLegacyFiling: useMutation({
      mutationFn: (legacyId: string) =>
        rpc<{ migrated: boolean; filing_id?: string; reason?: string }>(
          'returns_migrate_legacy_filing', { _legacy_id: legacyId }),
      onSuccess: invalidate,
    }),
  };
}

export const FREQUENCY_LABELS: Record<ReturnFrequency, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMI_ANNUAL: 'Half-yearly',
  ANNUAL: 'Annual',
  EVENT_DRIVEN: 'Event-driven',
  AD_HOC: 'Ad hoc',
};

export const FILING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  CORRECTION_REQUESTED: 'Correction requested',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

/* ------------------------------------------------------------------ */
/* EPR-01 — canonical enterprise queue + server-supplied workflow      */
/* guidance. React never derives Returns stage, SLA, priority or the   */
/* next required action; all of it comes from the server read model.   */
/* ------------------------------------------------------------------ */

export interface FilingQueueFilters {
  status?: string | null;
  stage?: string | null;
  entityId?: string | null;
  ownerUserId?: string | null;
  overdueOnly?: boolean;
}

export interface FilingQueueRowV2 {
  filing_id: string;
  filing_reference: string;
  entity_id: string;
  entity_name: string | null;
  return_definition_id: string;
  definition_code: string;
  definition_name: string;
  frequency: ReturnFrequency;
  reporting_period_id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  due_date: string;
  stage: string;
  stage_label: string;
  status: string;
  status_label: string;
  owner_user_id: string | null;
  owner_name: string | null;
  team: string | null;
  priority: string;
  priority_reason: string;
  sla_due_at: string | null;
  sla_state: string;
  waiting_on: string;
  blocker_count: number;
  blocking_validation_count: number;
  open_request_count: number;
  incomplete_required_forms: number;
  last_activity_at: string | null;
  next_action: string;
  next_action_label: string;
  next_action_href: string;
  next_action_permission: string | null;
  current_version_id: string | null;
  current_version_number: number;
  submitted_at: string | null;
  is_overdue: boolean;
  days_late: number;
}

export interface FilingQueueCounts {
  total: number;
  overdue: number;
  sla_breached: number;
  blocking_validations: number;
  open_requests: number;
  unassigned: number;
  awaiting_regulator: number;
  awaiting_entity: number;
  by_stage: Record<string, number>;
}

const queueArgs = (f: FilingQueueFilters) => ({
  _status: f.status ?? null,
  _stage: f.stage ?? null,
  _entity_id: f.entityId ?? null,
  _owner_user_id: f.ownerUserId ?? null,
  _overdue_only: !!f.overdueOnly,
});

export function useFilingQueueV2(filters: FilingQueueFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'filing-queue-v2', filters],
    queryFn: () => rpc<FilingQueueRowV2[]>('returns_filing_queue_v2', { ...queueArgs(filters), _limit: 500 }),
    staleTime: 15_000,
  });
}

export function useFilingQueueCounts(filters: FilingQueueFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'filing-queue-counts', filters],
    queryFn: () => rpc<FilingQueueCounts>('returns_filing_queue_counts', queueArgs(filters)),
    staleTime: 15_000,
  });
}

export interface FilingBlocker {
  code: string;
  label: string;
  detail: string;
  severity: 'critical' | 'warning' | string;
}

export interface FilingAvailableAction {
  code: 'START_REVIEW' | 'VALIDATE' | 'REQUEST_CORRECTION' | 'ACCEPT' | 'REJECT' | 'ASSIGN' | string;
  label: string;
  variant: string;
  requires_reason?: boolean;
}

export interface FilingWorkflowState {
  filing_id: string;
  stage: string;
  stage_label: string;
  status: string;
  status_label: string;
  waiting_on: 'ENTITY' | 'REGULATOR' | 'NOBODY' | string;
  owner_user_id: string | null;
  owner_name: string | null;
  team: string | null;
  priority: string;
  priority_reason: string;
  sla_due_at: string | null;
  sla_state: 'ON_TRACK' | 'DUE_SOON' | 'BREACHED' | 'NOT_APPLICABLE' | string;
  due_date: string;
  is_overdue: boolean;
  days_late: number;
  last_activity_at: string | null;
  current_version_id: string | null;
  current_version_number: number;
  accepted_version_id: string | null;
  blocker_count: number;
  blockers: FilingBlocker[];
  available_actions: FilingAvailableAction[];
  next_action: string;
  next_action_label: string;
  next_action_href: string;
  next_action_permission: string | null;
  completed: {
    submitted_at: string | null;
    accepted_at: string | null;
    rejected_at: string | null;
    required_forms_complete: boolean;
    declaration_accepted_at: string | null;
  };
}

export function useFilingWorkflowState(filingId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'filing-workflow-state', filingId],
    enabled: !!filingId,
    queryFn: () => rpc<FilingWorkflowState>('returns_filing_workflow_state', { _filing_id: filingId }),
    staleTime: 10_000,
  });
}

export interface FilingRelatedCases {
  breaches: Array<{
    id: string; metric_key: string | null; level: string | null; value: number | null;
    threshold_value: number | null; risk_level: string | null; detected_at: string | null;
    acknowledged_at: string | null; return_filing_version_id: string | null;
  }>;
  ewi_alerts: Array<{ id: string; severity: string | null; status: string | null; created_at: string | null }>;
  assessments: Array<{ id: string; status: string | null; created_at: string | null }>;
  actions: Array<{
    id: string; action_reference: string | null; action_type: string | null; title: string | null;
    status: string | null; severity: string | null; due_date: string | null;
  }>;
  enforcement: Array<{ id: string; escalated_at: string | null }>;
}

export function useFilingRelatedCases(filingId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'filing-related-cases', filingId],
    enabled: !!filingId,
    queryFn: () => rpc<FilingRelatedCases>('returns_filing_related_cases', { _filing_id: filingId }),
    staleTime: 20_000,
  });
}

/** Governed ownership assignment for a canonical filing. */
export function useAssignFiling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { filingId: string; ownerUserId: string | null; team?: string | null }) =>
      rpc('returns_assign_filing', {
        _filing_id: v.filingId, _owner_user_id: v.ownerUserId, _team: v.team ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Server-side translation of a legacy `returns_filed.id` to the canonical filing id. */
export function useResolveLegacyFiling(legacyId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'resolve-legacy-filing', legacyId],
    enabled: !!legacyId,
    retry: false,
    queryFn: () => rpc<string | null>('returns_resolve_legacy_filing', { _legacy_id: legacyId }),
  });
}

export const RETURN_STAGE_LABELS: Record<string, string> = {
  ENTITY_PREPARATION: 'Entity preparation',
  SUBMITTED_INTAKE: 'Submitted — intake',
  REGULATOR_REVIEW: 'Regulator review',
  CORRECTION: 'Correction',
  CLOSED: 'Closed',
};

export const WAITING_ON_LABELS: Record<string, string> = {
  ENTITY: 'Regulated entity',
  REGULATOR: 'Regulator',
  NOBODY: 'No one — closed',
};

export const SLA_STATE_LABELS: Record<string, string> = {
  ON_TRACK: 'On track',
  DUE_SOON: 'Due soon',
  BREACHED: 'Breached',
  NOT_APPLICABLE: 'Not applicable',
};
