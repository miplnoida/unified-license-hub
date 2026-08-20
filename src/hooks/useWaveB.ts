/**
 * RDM-ENTITY-001 Wave B — data hooks for the semantic form layer, structural
 * entity model, migration workbench and the public entity register.
 *
 * Every write goes through a governed SECURITY DEFINER RPC; no component
 * mutates the Wave B tables directly.
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
/* Migration workbench                                                 */
/* ------------------------------------------------------------------ */

export interface WaveBMigrationReport {
  generated_at: string;
  counts: Record<string, number>;
  legacy_templates: Array<{
    id: string; name: string; legacy_form_type: string | null; status: string | null;
    mapping_status: string; purpose_key: string | null; trigger_key: string | null;
    domains: number; lifecycles: number; field_count: number;
    suggested_purpose_key: string | null; suggested_lifecycle: string | null;
    evidence: { source: string; value: string | null };
  }>;
  unmapped_fields_by_template: Array<{
    template_id: string; template_name: string; fields_without_definition: number; fields_total: number;
  }>;
  applications_missing_requirements_detail: Array<{
    application_id: string; application_number: string | null; status: string;
    submitted_at: string | null; evidence_versions: number; evidence_responses: number; classification: string;
  }>;
  concepts_without_domain_detail: Array<{ id: string; code: string; name: string; canonical_target: string | null }>;
  sensitive_fields: Array<{ definition_id: string; template_id: string; field_key: string; concept_code: string; sensitivity: string }>;
  recent_decisions: Array<{
    id: string; target_type: string; target_id: string | null; decision: string;
    reason: string | null; affected_rows: number | null; decided_at: string; decided_by: string | null;
  }>;
}

export function useWaveBMigrationReport() {
  return useQuery({
    queryKey: ['wave-b-migration-report'],
    queryFn: () => rpc<WaveBMigrationReport>('rdm_wave_b_migration_report'),
    staleTime: 30_000,
  });
}

export function useMigrationWorkbenchMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wave-b-migration-report'] });
    qc.invalidateQueries({ queryKey: ['wave-b'] });
  };
  return {
    decide: useMutation({
      mutationFn: (v: {
        targetType: string; targetId: string | null; decision: string;
        canonical?: Record<string, unknown>; reason?: string; evidence?: Record<string, unknown>;
      }) => rpc('rdm_migration_decide', {
        _target_type: v.targetType,
        _target_id: v.targetId,
        _decision: v.decision,
        _canonical: v.canonical ?? {},
        _reason: v.reason ?? null,
        _evidence: v.evidence ?? {},
      }),
      onSuccess: invalidate,
    }),
    backfillFieldDefinitions: useMutation({
      mutationFn: (templateId?: string | null) => rpc('rdm_backfill_field_definitions', { _template_id: templateId ?? null }),
      onSuccess: invalidate,
    }),
    backfillApplicationRequirements: useMutation({
      mutationFn: (applicationId?: string | null) => rpc('rdm_backfill_application_requirements', { _application_id: applicationId ?? null }),
      onSuccess: invalidate,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Data concepts + logical field definitions                           */
/* ------------------------------------------------------------------ */

export interface DataConceptRow {
  id: string; code: string; name: string; description: string | null;
  data_domain_id: string | null; data_type: string | null; cardinality: string | null;
  sensitivity_classification: string | null; canonical_target: string | null;
  projection_strategy: string | null; is_system: boolean; is_active: boolean;
}

export function useDataConcepts() {
  return useQuery({
    queryKey: ['wave-b', 'data-concepts'],
    queryFn: async (): Promise<DataConceptRow[]> => {
      const { data, error } = await db().from('data_concepts').select('*').order('code');
      if (error) throw new Error(error.message);
      return (data || []) as DataConceptRow[];
    },
    staleTime: 60_000,
  });
}

export function useDataDomains() {
  return useQuery({
    queryKey: ['wave-b', 'data-domains'],
    queryFn: async () => {
      const { data, error } = await db().from('data_domains').select('id, key, label').eq('is_active', true).order('sort_order');
      if (error) throw new Error(error.message);
      return (data || []) as Array<{ id: string; key: string; label: string }>;
    },
    staleTime: 5 * 60_000,
  });
}

export function useFieldDefinitions(templateId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'field-definitions', templateId ?? 'all'],
    queryFn: async () => {
      let q = db().from('form_field_definitions').select('*').order('field_key').limit(1000);
      if (templateId) q = q.eq('template_id', templateId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []) as Array<{
        id: string; template_id: string; field_key: string; data_concept_id: string | null;
        label_hint: string | null; is_published: boolean; is_active: boolean;
      }>;
    },
  });
}

export function useDataConceptMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['wave-b'] });
  return {
    save: useMutation({
      mutationFn: (v: { id?: string | null; values: Record<string, unknown> }) =>
        rpc('rdm_save_data_concept', { _values: v.values, _id: v.id ?? null }),
      onSuccess: invalidate,
    }),
    retire: useMutation({
      mutationFn: (v: { id: string; reason?: string }) => rpc('rdm_retire_data_concept', { _id: v.id, _reason: v.reason ?? null }),
      onSuccess: invalidate,
    }),
    bindField: useMutation({
      mutationFn: (v: { definitionId: string; conceptId: string | null; reason?: string }) =>
        rpc('rdm_migration_decide', {
          _target_type: 'form_field_definition',
          _target_id: v.definitionId,
          _decision: 'BIND_CONCEPT',
          _canonical: { data_concept_id: v.conceptId },
          _reason: v.reason ?? 'Bound logical field to canonical concept',
          _evidence: {},
        }),
      onSuccess: invalidate,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Form packages + applicability                                       */
/* ------------------------------------------------------------------ */

export interface FormPackageRow {
  id: string; code: string; name: string; description: string | null;
  regulator_id: string | null; status: string; version: number;
  published_at: string | null; is_active: boolean;
}

export function useFormPackages() {
  return useQuery({
    queryKey: ['wave-b', 'form-packages'],
    queryFn: async (): Promise<FormPackageRow[]> => {
      const { data, error } = await db().from('form_packages').select('*').order('name');
      if (error) throw new Error(error.message);
      return (data || []) as FormPackageRow[];
    },
  });
}

export function useFormPackageItems(packageId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'form-package-items', packageId],
    enabled: !!packageId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('form_package_items')
        .select('id, package_id, template_id, is_required, sequence, notes, form_templates(name, status)')
        .eq('package_id', packageId)
        .order('sequence');
      if (error) throw new Error(error.message);
      return (data || []) as Array<{
        id: string; package_id: string; template_id: string; is_required: boolean;
        sequence: number; notes: string | null; form_templates?: { name: string; status: string } | null;
      }>;
    },
  });
}

export function useApplicabilityRules() {
  return useQuery({
    queryKey: ['wave-b', 'applicability-rules'],
    queryFn: async () => {
      const { data, error } = await db()
        .from('form_applicability_rules')
        .select('*, form_packages(code, name, status)')
        .order('priority', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useFormTemplatesLite() {
  return useQuery({
    queryKey: ['wave-b', 'form-templates-lite'],
    queryFn: async () => {
      const { data, error } = await db()
        .from('form_templates')
        .select('id, name, status, form_type, form_purpose_id, trigger_type_id, legacy_mapping_status')
        .order('name')
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data || []) as Array<{
        id: string; name: string; status: string; form_type: string | null;
        form_purpose_id: string | null; trigger_type_id: string | null; legacy_mapping_status: string | null;
      }>;
    },
    staleTime: 60_000,
  });
}

export function usePackageMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['wave-b'] });
  return {
    savePackage: useMutation({
      mutationFn: (payload: Record<string, unknown>) => rpc('form_package_save', { _payload: payload }),
      onSuccess: invalidate,
    }),
    saveItem: useMutation({
      mutationFn: (payload: Record<string, unknown>) => rpc('form_package_item_save', { _payload: payload }),
      onSuccess: invalidate,
    }),
    deleteItem: useMutation({
      mutationFn: (id: string) => rpc('form_package_item_delete', { _id: id }),
      onSuccess: invalidate,
    }),
    saveRule: useMutation({
      mutationFn: (payload: Record<string, unknown>) => rpc('form_applicability_rule_save', { _payload: payload }),
      onSuccess: invalidate,
    }),
    deleteRule: useMutation({
      mutationFn: (id: string) => rpc('form_applicability_rule_delete', { _id: id }),
      onSuccess: invalidate,
    }),
  };
}

export function useResolvePackagePreview() {
  return useMutation({
    mutationFn: (ctx: Record<string, unknown>) => rpc<{
      resolved: boolean; reason?: string; package_id?: string; applicability_rule_id?: string;
      specificity?: number; items?: Array<{ template_id: string; template_name: string; is_required: boolean; sequence: number; form_version: number | null }>;
    }>('resolve_applicable_form_package', { _ctx: ctx }),
  });
}

/* ------------------------------------------------------------------ */
/* Entity structure workspace                                          */
/* ------------------------------------------------------------------ */

export interface EntityStructureOverview {
  entity_id: string;
  name?: string;
  [key: string]: unknown;
}

export function useEntityStructureOverview(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'entity-structure', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityStructureOverview>('entity_structure_overview', { _entity_id: entityId }),
  });
}

export function useEntityOwnership(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'entity-ownership', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('ownership_interests')
        .select('*, parties(display_name, party_kind)')
        .eq('owned_entity_id', entityId)
        .order('economic_interest_percentage', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useEntityAppointments(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'entity-appointments', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('entity_appointments')
        .select('*, parties(display_name), role_types(label, key)')
        .eq('entity_id', entityId)
        .order('appointment_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useEntityPartyRelationships(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'entity-party-relationships', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('party_relationships')
        .select('*, relationship_types(label, key)')
        .eq('entity_id', entityId)
        .order('effective_from', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useEntityChangeSets(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'entity-change-sets', entityId ?? 'all'],
    queryFn: async () => {
      let q = db().from('entity_change_sets').select('*').order('created_at', { ascending: false }).limit(200);
      if (entityId) q = q.eq('entity_id', entityId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useChangeSetItems(changeSetId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'change-set-items', changeSetId],
    enabled: !!changeSetId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('entity_change_items')
        .select('*, data_concepts(code, name)')
        .eq('change_set_id', changeSetId)
        .order('sequence');
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useChangeSetMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['wave-b'] });
  return {
    transition: useMutation({
      mutationFn: (v: { id: string; action: string; notes?: string }) =>
        rpc('entity_change_set_transition', { _change_set_id: v.id, _action: v.action, _notes: v.notes ?? null }),
      onSuccess: invalidate,
    }),
  };
}

export function useRegulatoryRequests(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'regulatory-requests', entityId ?? 'all'],
    queryFn: async () => {
      let q = db()
        .from('regulatory_requests')
        .select('*, regulatory_request_types(key, label)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (entityId) q = q.eq('entity_id', entityId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []) as Array<Record<string, any>>;
    },
  });
}

export function useAvailableRequestTypes(entityId?: string | null) {
  return useQuery({
    queryKey: ['wave-b', 'request-types', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db().rpc('regulatory_request_available_types', { _entity_id: entityId });
      if (error) throw new Error(error.message);
      return (data || []) as Array<{ key: string; label: string; description: string | null; requires_change_set: boolean }>;
    },
  });
}

export function useRegulatoryRequestMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['wave-b'] });
  return {
    start: useMutation({
      mutationFn: (v: { entityId: string; requestTypeKey: string; effectiveDate?: string | null; summary?: string }) =>
        rpc('regulatory_request_start', {
          _entity_id: v.entityId,
          _request_type_key: v.requestTypeKey,
          _effective_date: v.effectiveDate ?? null,
          _summary: v.summary ?? null,
        }),
      onSuccess: invalidate,
    }),
    transition: useMutation({
      mutationFn: (v: { id: string; action: string; notes?: string; assignee?: string | null }) =>
        rpc('regulatory_request_transition', {
          _request_id: v.id, _action: v.action, _notes: v.notes ?? null, _assignee: v.assignee ?? null,
        }),
      onSuccess: invalidate,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Publication policy + public entity register                         */
/* ------------------------------------------------------------------ */

export interface PublicationPolicyRow {
  id: string; key: string; label: string; description: string | null;
  publish_entity: boolean; requires_authorised_licence: boolean;
  publish_licences: boolean; publish_status: boolean; publish_enforcement: boolean;
  is_default: boolean; is_active: boolean;
}

export function usePublicationPolicies() {
  return useQuery({
    queryKey: ['wave-b', 'publication-policies'],
    queryFn: async (): Promise<PublicationPolicyRow[]> => {
      const { data, error } = await db().from('registry_publication_policies').select('*').eq('is_active', true).order('sort_order');
      if (error) throw new Error(error.message);
      return (data || []) as PublicationPolicyRow[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSetPublicationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { entityId: string; policyKey: string; reason?: string }) =>
      rpc('entity_set_publication_policy', { _entity_id: v.entityId, _policy_key: v.policyKey, _reason: v.reason ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wave-b'] }),
  });
}

export interface PublicEntityRow {
  slug: string;
  legal_name: string;
  trading_name: string | null;
  sector: string | null;
  entity_status: string | null;
  licence_count: number;
  publication_policy: string;
  licences: Array<{
    license_number: string | null; license_type: string | null; status: string | null;
    valid_from: string | null; valid_until: string | null; is_primary: boolean | null; conditions?: string | null;
  }>;
}

export function usePublicEntityRegister(criteria: { query?: string; sector_id?: string | null; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['public-entity-register', criteria],
    queryFn: () => rpc<PublicEntityRow[]>('public_entity_register_search', { _criteria: criteria }),
    staleTime: 60_000,
  });
}

export function usePublicEntityDetail(slug?: string) {
  return useQuery({
    queryKey: ['public-entity-detail', slug],
    enabled: !!slug,
    queryFn: () => rpc<PublicEntityRow & {
      found: boolean; publication_policy_label?: string;
      former_names: Array<{ name: string; recorded_at: string }>;
      enforcement: Array<{ enforcement_type: string; status: string; date_opened: string | null }>;
    }>('public_entity_register_detail', { _slug: slug }),
  });
}

/* ------------------------------------------------------------------ */
/* Public onboarding — entity identification                           */
/* ------------------------------------------------------------------ */

export interface ResolveOutcome {
  outcome: 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH';
  entity_id: string | null;
  case_id?: string | null;
  case_number?: string | null;
  match_basis?: string | null;
  entity?: Record<string, unknown>;
  candidates: Array<{ entity_id: string; legal_name: string; match_score: number; match_basis: string }>;
}

export function useOnboardingIdentity() {
  return {
    resolve: useMutation({
      mutationFn: (payload: Record<string, unknown>) => rpc<ResolveOutcome>('entity_resolve_identity', { _payload: payload }),
    }),
    provision: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        rpc<{ entity_id: string; outcome: string }>('wb_onboarding_provision_entity', { _payload: payload }),
    }),
    requestMembership: useMutation({
      mutationFn: (v: { entityId: string; roleKey: string; evidenceRef?: string }) =>
        rpc('entity_membership_request', {
          _entity_id: v.entityId,
          _membership_role_key: v.roleKey,
          _authority_evidence_reference: v.evidenceRef ?? null,
        }),
    }),
  };
}
