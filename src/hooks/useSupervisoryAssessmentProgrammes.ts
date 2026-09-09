/**
 * Supervisory Assessment Programme administration and runtime — governed layer.
 *
 * An assessment programme set is a generic supervisory-platform capability: it
 * states which assessments a regulator runs in a supervisory domain, how each
 * one derives its review period, which triggers it accepts and which question
 * classes are in scope. AML/CFT is the first consumer; no domain is hardcoded.
 *
 * Every read goes through a `supervisory_assessment_programme_*` read model and
 * every write through a governed RPC. Nothing here decides authority — the
 * server does, and `supervisory_assessment_programme_action_capabilities` is the
 * only source of what the signed-in officer may do.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => any };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* --------------------------------------------------------------- types */

export interface ProgrammeSetRow {
  id: string;
  code: string;
  set_version: string;
  name: string;
  description: string | null;
  domain_code: string;
  regulator_id: string | null;
  regulator_code: string | null;
  regulator_name: string | null;
  origin: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  programme_count: number;
  active_programme_count: number;
  profile_binding_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProgrammeTrigger {
  id?: string;
  trigger_code: string;
  label: string | null;
  is_default: boolean;
  is_active?: boolean;
  requires_signal?: boolean;
  requires_prior_assessment?: boolean;
  guidance?: string | null;
  sort_order?: number;
}

export interface Programme {
  id: string;
  programme_code: string;
  label: string;
  description: string | null;
  assessment_type: string;
  period_rule: string;
  period_value: number | null;
  end_offset_days: number | null;
  allow_manual_override: boolean;
  requires_prior_assessment: boolean;
  requires_trigger_signal: boolean;
  summary_required: boolean;
  question_class_scope: string[] | null;
  guidance: string | null;
  is_active: boolean;
  retired_at: string | null;
  sort_order: number | null;
  triggers: ProgrammeTrigger[];
}

export interface ProgrammeValidation {
  error_count: number;
  warning_count?: number;
  errors?: string[];
  warnings?: string[];
  [k: string]: unknown;
}

export interface ProgrammeSetDetail {
  set: ProgrammeSetRow & {
    purpose?: string | null;
    notes?: string | null;
    adopted_from: { id: string; code: string; set_version: string; origin: string } | null;
    supersedes: { id: string; code: string; set_version: string; status: string } | null;
  };
  programmes: Programme[];
  profile_bindings: Array<{
    profile_id: string; profile_code: string; profile_version: string;
    profile_status: string; profile_origin: string; bound_version: string | null;
  }>;
  versions: Array<{ id: string; set_version: string; status: string; origin: string }>;
  validation: ProgrammeValidation;
}

export interface ProgrammeCapabilities {
  programme_set_id: string;
  status: string;
  origin: string;
  editable: boolean;
  can_manage: boolean;
  can_submit: boolean;
  can_return: boolean;
  can_approve: boolean;
  can_activate: boolean;
  can_retire: boolean;
  can_new_version: boolean;
  can_adopt: boolean;
  maker_checker_block: string | null;
  validation: ProgrammeValidation;
  reason: string | null;
}

export interface ProgrammeRegisterOptions {
  domains: string[];
  origins: string[];
  statuses: string[];
  regulators: Array<{ id: string; code: string; name: string; status?: string }>;
  selectable_regulator_count?: number;
  cross_regulator_allowed?: boolean;
  active_regulator?: { id: string; code: string; name: string } | null;
  regulator_scope_reason?: string | null;
  period_rules: Array<{ code: string; label: string; description: string | null }>;
  question_classes: Array<{ code: string; label: string }>;
  assessment_types: Array<{ code: string; label: string }>;
  trigger_codes: Array<{ code: string; label: string }>;
}

/* --------------------------------------------------------------- reads */

export function useAssessmentProgrammeOptions() {
  return useQuery({
    queryKey: ['assessment-programme-options'],
    queryFn: () => rpc<ProgrammeRegisterOptions>('supervisory_assessment_programme_register_options'),
    staleTime: 60_000,
  });
}

export function useAssessmentProgrammeSets(p: {
  search?: string; domainCode?: string | null; origin?: string | null; status?: string | null;
  regulatorId?: string | null; sortKey?: string; sortDirection?: string; page?: number; pageSize?: number;
}) {
  const limit = p.pageSize ?? 50;
  const offset = ((p.page ?? 1) - 1) * limit;
  return useQuery({
    queryKey: ['assessment-programme-register', p],
    queryFn: () => rpc<{ rows: ProgrammeSetRow[]; total: number }>('supervisory_assessment_programme_register', {
      _search: p.search || null, _domain_code: p.domainCode ?? null, _origin: p.origin ?? null,
      _status: p.status ?? null, _regulator_id: p.regulatorId ?? null,
      _sort: p.sortKey ?? 'updated_at', _dir: p.sortDirection ?? 'desc',
      _limit: limit, _offset: offset,
    }),
  });
}

export function useAssessmentProgrammeSet(setId?: string) {
  return useQuery({
    queryKey: ['assessment-programme-detail', setId],
    enabled: Boolean(setId),
    queryFn: () => rpc<ProgrammeSetDetail>('supervisory_assessment_programme_detail', { _set_id: setId }),
  });
}

export function useAssessmentProgrammeCapabilities(setId?: string) {
  return useQuery({
    queryKey: ['assessment-programme-capabilities', setId],
    enabled: Boolean(setId),
    queryFn: () => rpc<ProgrammeCapabilities>('supervisory_assessment_programme_action_capabilities', { _set_id: setId }),
  });
}

export function useAssessmentProgrammeHistory(setId?: string) {
  return useQuery({
    queryKey: ['assessment-programme-history', setId],
    enabled: Boolean(setId),
    queryFn: () => rpc<{ rows: any[]; total: number }>('supervisory_assessment_programme_event_register', {
      _set_id: setId, _limit: 200, _offset: 0,
    }),
  });
}

export function useAssessmentProgrammeCompare(setId?: string, baselineId?: string) {
  return useQuery({
    queryKey: ['assessment-programme-compare', setId, baselineId],
    enabled: Boolean(setId && baselineId),
    queryFn: () => rpc<any>('supervisory_assessment_programme_compare', { _set_id: setId, _baseline_id: baselineId }),
  });
}

/* ------------------------------------------------------------ writes */

function useProgrammeMutation<TArgs>(fn: string, build: (a: TArgs) => Record<string, unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: TArgs) => rpc<any>(fn, build(a)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment-programme-register'] });
      qc.invalidateQueries({ queryKey: ['assessment-programme-detail'] });
      qc.invalidateQueries({ queryKey: ['assessment-programme-capabilities'] });
      qc.invalidateQueries({ queryKey: ['assessment-programme-history'] });
    },
  });
}

export const useSaveProgrammeSet = () =>
  useProgrammeMutation<{ setId: string; payload: Record<string, unknown> }>(
    'supervisory_assessment_programme_set_save', (a) => ({ _set_id: a.setId, _payload: a.payload }));

export const useUpsertProgramme = () =>
  useProgrammeMutation<{ setId: string; payload: Record<string, unknown> }>(
    'supervisory_assessment_programme_upsert', (a) => ({ _set_id: a.setId, _payload: a.payload }));

export const useRetireProgramme = () =>
  useProgrammeMutation<{ programmeId: string; rationale: string }>(
    'supervisory_assessment_programme_retire', (a) => ({ _programme_id: a.programmeId, _rationale: a.rationale }));

export const useUpsertProgrammeTrigger = () =>
  useProgrammeMutation<{ programmeId: string; payload: Record<string, unknown> }>(
    'supervisory_assessment_programme_trigger_upsert', (a) => ({ _programme_id: a.programmeId, _payload: a.payload }));

export const useRemoveProgrammeTrigger = () =>
  useProgrammeMutation<{ programmeId: string; triggerCode: string }>(
    'supervisory_assessment_programme_trigger_remove', (a) => ({ _programme_id: a.programmeId, _trigger_code: a.triggerCode }));

export const useProgrammeSetLifecycle = () =>
  useProgrammeMutation<{ setId: string; action: string; rationale: string }>(
    'supervisory_assessment_programme_set_lifecycle',
    (a) => ({ _set_id: a.setId, _action: a.action, _rationale: a.rationale }));

export const useProgrammeSetNewVersion = () =>
  useProgrammeMutation<{ setId: string; setVersion: string; rationale: string }>(
    'supervisory_assessment_programme_set_new_version',
    (a) => ({ _set_id: a.setId, _set_version: a.setVersion, _rationale: a.rationale }));

export const useAdoptProgrammeSet = () =>
  useProgrammeMutation<{ referenceSetId: string; regulatorId: string; rationale: string }>(
    'supervisory_assessment_programme_adopt_reference',
    (a) => ({ _reference_set_id: a.referenceSetId, _regulator_id: a.regulatorId, _rationale: a.rationale }));

/* --------------------------------------------------- runtime (officers) */

export interface EntityProgrammeOption {
  programme_id: string;
  programme_code: string;
  label: string;
  description: string | null;
  assessment_type: string;
  guidance: string | null;
  summary_required: boolean;
  question_class_scope: string[] | null;
  requires_prior_assessment: boolean;
  requires_trigger_signal: boolean;
  prior_assessment_id: string | null;
  period: {
    period_rule: string;
    period_value: number | null;
    end_offset_days: number | null;
    suggested_period_start: string | null;
    suggested_period_end: string | null;
    manual_entry_required: boolean;
    allow_manual_override: boolean;
  };
  triggers: ProgrammeTrigger[];
}

export interface EntityProgrammeOptions {
  mode: 'CONFIGURED' | 'LEGACY_COMPATIBILITY' | 'UNAVAILABLE';
  entity_id: string;
  domain_code: string;
  as_of: string;
  reason?: string | null;
  compatibility_notice?: string | null;
  prior_assessment_id: string | null;
  programme_set: { id: string; code: string; set_version: string; name: string; origin: string; status: string } | null;
  programmes: EntityProgrammeOption[];
}

/**
 * The assessment choices an officer may start for this entity. Nothing is
 * defaulted in the browser: assessment types, triggers and the review period all
 * come from governed configuration resolved server-side.
 */
export function useEntityProgrammeOptions(entityId: string | null, domainCode: string) {
  return useQuery({
    queryKey: ['assessment-programme-entity-options', entityId, domainCode],
    enabled: Boolean(entityId),
    queryFn: () => rpc<EntityProgrammeOptions>('supervisory_assessment_programme_options_for_entity', {
      _entity_id: entityId, _domain_code: domainCode, _as_of: null,
    }),
  });
}

export function useCreateProgrammedAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: {
      entityId: string; domainCode: string; programmeId: string; triggerType?: string | null;
      periodStart?: string | null; periodEnd?: string | null; summary?: string | null;
      triggerSignalId?: string | null;
    }) => rpc<any>('supervisory_assessment_create_programmed', {
      _entity_id: a.entityId, _domain_code: a.domainCode, _programme_id: a.programmeId,
      _trigger_type: a.triggerType ?? null, _period_start: a.periodStart ?? null,
      _period_end: a.periodEnd ?? null, _summary: a.summary ?? null,
      _trigger_signal_id: a.triggerSignalId ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aml-portfolio'] });
      qc.invalidateQueries({ queryKey: ['aml-assessments'] });
    },
  });
}
