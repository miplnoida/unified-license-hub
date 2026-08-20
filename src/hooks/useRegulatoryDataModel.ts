/**
 * RDM-ENTITY-001 — Phase 1 metadata access layer.
 *
 * Every regulatory concept that later phases depend on (classifications,
 * lifecycle stages, relationship + role types, form semantics, identity
 * policy) is configuration, never code. This hook family is a thin, generic
 * data layer over those configuration tables plus the Phase 0 read-only
 * integrity diagnostics.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RdmTable =
  | 'classification_schemes'
  | 'classification_values'
  | 'lifecycle_stages'
  | 'entity_identity_statuses'
  | 'relationship_types'
  | 'role_types'
  | 'form_purposes'
  | 'form_trigger_types'
  | 'data_domains'
  | 'entity_identifier_types'
  | 'entity_resolution_policies'
  | 'entity_registry_failure_policies';

export type RdmRow = Record<string, unknown> & {
  id: string;
  key: string;
  label: string;
  is_active: boolean;
  is_system?: boolean;
  sort_order?: number;
};

// The metadata tables are generic by design, so the generated row types add no
// safety here — the field schema in `rdmSchema.ts` is the contract.
const db = () => supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export function useRdmRows(table: RdmTable, opts?: { schemeId?: string | null }) {
  return useQuery({
    queryKey: ['rdm', table, opts?.schemeId ?? null],
    queryFn: async (): Promise<RdmRow[]> => {
      let q = db().from(table).select('*');
      if (table === 'classification_values' && opts?.schemeId) {
        q = q.eq('scheme_id', opts.schemeId);
      }
      const { data, error } = await q.order('sort_order', { ascending: true }).order('label', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RdmRow[];
    },
    enabled: table !== 'classification_values' || !!opts?.schemeId,
    staleTime: 60_000,
  });
}

/**
 * All writes go through the guarded, audited RPCs (`rdm_save_metadata`,
 * `rdm_retire_metadata`, `rdm_delete_metadata`) instead of direct table
 * writes: they re-check `settings.edit`, enforce key immutability, protect
 * system rows, keep a single active default policy and block deletion of
 * referenced configuration.
 */
export function useRdmMutations(table: RdmTable) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['rdm', table] });

  const create = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await db().rpc('rdm_save_metadata', { _table: table, _values: values, _id: null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { key: _ignoredImmutableKey, ...rest } = values as { key?: unknown };
      const { error } = await db().rpc('rdm_save_metadata', { _table: table, _values: rest, _id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const retire = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().rpc('rdm_retire_metadata', { _table: table, _id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().rpc('rdm_delete_metadata', { _table: table, _id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, retire, remove };
}


export interface RdmIntegrityReport {
  generated_at: string;
  entities_total: number;
  licenses_total: number;
  entities_without_license: number;
  licenses_without_entity: number;
  entities_sharing_license_id: number;
  entities_multi_license_capable: boolean;
  duplicate_entity_names: number;
  applications_total: number;
  applications_without_pinned_form_version: number;
  applications_without_resolvable_entity: number;
  registrations_total: number;
  registrations_without_user: number;
  duplicate_registration_numbers: number;
  relationship_rows: number;
  distinct_relationship_type_values: number;
  form_templates_total: number;
  distinct_form_type_values: number;
  form_templates_without_published_version: number;
  foreign_keys_referencing_licensees: number;
  configured_metadata: Record<string, number>;
}

export function useRdmIntegrityReport() {
  return useQuery({
    queryKey: ['rdm', 'integrity-report'],
    queryFn: async (): Promise<RdmIntegrityReport> => {
      const { data, error } = await db().rpc('rdm_integrity_report');
      if (error) throw error;
      return data as RdmIntegrityReport;
    },
    staleTime: 30_000,
  });
}

export interface RdmDuplicateEntity {
  normalised_name: string;
  entity_count: number;
  entity_ids: string[];
  entity_names: string[];
  statuses: string[];
}

export function useRdmDuplicateEntities() {
  return useQuery({
    queryKey: ['rdm', 'duplicate-entities'],
    queryFn: async (): Promise<RdmDuplicateEntity[]> => {
      const { data, error } = await db().rpc('rdm_diag_duplicate_entities');
      if (error) throw error;
      return (data ?? []) as RdmDuplicateEntity[];
    },
    staleTime: 30_000,
  });
}
