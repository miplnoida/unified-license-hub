/**
 * REGCLASS-001 — Regulatory Classification console data access.
 *
 * All reads go through the canonical classification tables (read-only for the
 * browser). Every write goes through a governed SECURITY DEFINER routine; there
 * is deliberately no direct INSERT/UPDATE/DELETE in this file.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ClassificationStatus = 'draft' | 'active' | 'disabled' | 'retired';

export const CLASSIFICATION_STATUSES: ClassificationStatus[] = ['draft', 'active', 'disabled', 'retired'];

export const AUTHORIZATION_METHODS = [
  'LICENCE', 'REGISTRATION', 'RECOGNITION', 'APPROVAL', 'SUPERVISION_ONLY', 'REGISTRY_ONLY',
] as const;

export const MARKET_SCOPES = ['DOMESTIC', 'INTERNATIONAL', 'CAPTIVE', 'HYBRID'] as const;

export interface RegulatoryProfile {
  id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  regulator_id: string | null;
  regulator_name: string;
  classification_pack: string;
  status: string;
  is_current: boolean;
  notes: string | null;
}

export interface SectorFamily { id: string; code: string; label: string; status: string; sort_order: number; }
export interface ActivityRow { id: string; code: string; label: string; description: string | null; family_code: string | null; status: string; sort_order: number; }
export interface SubjectFormRow { id: string; code: string; label: string; description: string | null; status: string; sort_order: number; }

export interface ClassRow {
  id: string; scheme_id: string; local_class_code: string; name: string; description: string | null;
  subject_form_code: string | null; customer_restriction: string | null; market_scope: string | null;
  effective_from: string | null; effective_to: string | null; status: ClassificationStatus;
  activity_codes: string[];
}
export interface SchemeRow {
  id: string; business_type_id: string; code: string; name: string; local_legal_name: string | null;
  authorization_method: string; market_scope: string; legal_basis: string | null; version: string;
  effective_from: string | null; effective_to: string | null; status: ClassificationStatus;
  classes: ClassRow[];
}
export interface BusinessTypeRow {
  id: string; sector_id: string; code: string; name: string; local_legal_name: string | null;
  subject_form_code: string | null; market_scope: string | null; legal_basis: string | null;
  description: string | null; effective_from: string | null; effective_to: string | null;
  status: ClassificationStatus; schemes: SchemeRow[];
}
export interface LocalSectorRow {
  id: string; code: string | null; name: string; status: string; family_code: string | null;
  display_group: string | null; scope_note: string | null; effective_from: string | null;
  effective_to: string | null; businessTypes: BusinessTypeRow[];
}

const db = supabase as any;

/** The single current jurisdiction profile for this deployment. */
export function useCurrentRegulatoryProfile() {
  return useQuery({
    queryKey: ['regulatory_profile', 'current'],
    queryFn: async () => {
      const { data, error } = await db.from('regulatory_profiles')
        .select('*').eq('is_current', true).maybeSingle();
      if (error) throw error;
      return (data || null) as RegulatoryProfile | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** All known packs — installed and source-only. Break-glass surfaces only. */
export function useRegulatoryProfiles() {
  return useQuery({
    queryKey: ['regulatory_profiles'],
    queryFn: async () => {
      const { data, error } = await db.from('regulatory_profiles')
        .select('*').order('is_current', { ascending: false }).order('jurisdiction_name');
      if (error) throw error;
      return (data || []) as RegulatoryProfile[];
    },
  });
}

export function useSectorFamilies() {
  return useQuery({
    queryKey: ['common_sector_families'],
    queryFn: async () => {
      const { data, error } = await db.from('common_sector_families').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as SectorFamily[];
    },
  });
}

export function useRegulatedActivities() {
  return useQuery({
    queryKey: ['regulated_activity_catalogue'],
    queryFn: async () => {
      const { data, error } = await db.from('regulated_activity_catalogue').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as ActivityRow[];
    },
  });
}

export function useSubjectForms() {
  return useQuery({
    queryKey: ['subject_forms'],
    queryFn: async () => {
      const { data, error } = await db.from('subject_forms').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as SubjectFormRow[];
    },
  });
}

/**
 * Whole local classification hierarchy for the current jurisdiction, nested:
 * sector -> business type -> scheme -> class -> activities.
 */
export function useClassificationTree() {
  return useQuery({
    queryKey: ['classification_tree'],
    queryFn: async () => {
      const [sectorsRes, btRes, schemeRes, classRes, mapRes] = await Promise.all([
        db.from('sectors').select('id, code, name, status, family_code, display_group, scope_note, effective_from, effective_to').order('name'),
        db.from('classification_business_types').select('*').order('sort_order').order('name'),
        db.from('authorization_schemes').select('*').order('name'),
        db.from('authorization_classes').select('*').order('sort_order').order('local_class_code'),
        db.from('authorization_class_activities').select('class_id, activity_code'),
      ]);
      for (const r of [sectorsRes, btRes, schemeRes, classRes, mapRes]) if (r.error) throw r.error;

      const activityByClass = new Map<string, string[]>();
      for (const m of (mapRes.data || []) as any[]) {
        activityByClass.set(m.class_id, [...(activityByClass.get(m.class_id) || []), m.activity_code]);
      }
      const classes: ClassRow[] = ((classRes.data || []) as any[]).map((c) => ({
        ...c, activity_codes: activityByClass.get(c.id) || [],
      }));
      const schemes: SchemeRow[] = ((schemeRes.data || []) as any[]).map((s) => ({
        ...s, classes: classes.filter((c) => c.scheme_id === s.id),
      }));
      const businessTypes: BusinessTypeRow[] = ((btRes.data || []) as any[]).map((b) => ({
        ...b, schemes: schemes.filter((s) => s.business_type_id === b.id),
      }));
      const sectors: LocalSectorRow[] = ((sectorsRes.data || []) as any[]).map((s) => ({
        ...s, businessTypes: businessTypes.filter((b) => b.sector_id === s.id),
      }));

      return { sectors, businessTypes, schemes, classes };
    },
  });
}

export function useClassificationHistory(limit = 200) {
  return useQuery({
    queryKey: ['classification_change_log', limit],
    queryFn: async () => {
      const { data, error } = await db.from('classification_change_log')
        .select('*').order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useClassificationAliases() {
  return useQuery({
    queryKey: ['classification_aliases'],
    queryFn: async () => {
      const { data, error } = await db.from('classification_aliases')
        .select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Reference counts for a classification, used by the impact preview. */
export async function fetchClassificationImpact(entityType: string, entityId: string) {
  const { data, error } = await db.rpc('classification_dependency_impact', {
    _entity_type: entityType, _entity_id: entityId,
  });
  if (error) throw error;
  return data as { supported: boolean; references: Record<string, number>; total_references: number };
}

export async function runDuplicateScan() {
  const { data, error } = await db.rpc('classification_duplicate_scan');
  if (error) throw error;
  return (data || []) as { finding: string; entity_type: string; detail: string; occurrences: number }[];
}

export async function runImportDryRun(kind: 'sector' | 'business_type', rows: any[]) {
  const { data, error } = await db.rpc('classification_import_dry_run', { _kind: kind, _rows: rows });
  if (error) throw error;
  return data as {
    supported: boolean; rows: number; new: number; updates: number; duplicates: number;
    invalid: number; clean: boolean; issues: { row: number; issue: string }[];
  };
}

const INVALIDATE = [
  'classification_tree', 'classification_change_log', 'regulated_activity_catalogue',
  'subject_forms', 'common_sector_families', 'sectors', 'sub_sectors',
  'classification_aliases', 'regulatory_profiles', 'regulatory_profile',
];

export function useClassificationMutations() {
  const qc = useQueryClient();
  const done = () => { INVALIDATE.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const rpc = (fn: string) => async (args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
  // Named as a hook so the fixed, unconditional call order below is explicit.
  const useRpcMutation = (fn: string) => useMutation({ mutationFn: rpc(fn), onSuccess: done });
  const m = useRpcMutation;


  return {
    upsertSector: m('classification_sector_upsert'),
    setSectorStatus: m('classification_sector_set_status'),
    upsertBusinessType: m('business_type_upsert'),
    setBusinessTypeStatus: m('business_type_set_status'),
    upsertScheme: m('authorization_scheme_upsert'),
    setSchemeStatus: m('authorization_scheme_set_status'),
    upsertClass: m('authorization_class_upsert'),
    setClassStatus: m('authorization_class_set_status'),
    upsertActivity: m('regulated_activity_upsert'),
    setActivityStatus: m('regulated_activity_set_status'),
    upsertSubjectForm: m('subject_form_upsert'),
    setSubjectFormStatus: m('subject_form_set_status'),
    deleteDraft: m('classification_delete_draft'),
    setCurrentProfile: m('regulatory_profile_set_current'),
  };
}

/** Effective availability: a record is only selectable when every ancestor is active. */
export function isEffectivelyAvailable(chain: Array<{ status?: string | null } | null | undefined>) {
  return chain.every((n) => (n?.status || '').toLowerCase() === 'active');
}

export function unavailableReason(
  self: { status?: string | null },
  ancestors: Array<{ status?: string | null; label: string }>,
) {
  const blocked = ancestors.find((a) => (a.status || '').toLowerCase() !== 'active');
  if (blocked) return `Unavailable because ${blocked.label} is ${(blocked.status || 'not active').toLowerCase()}`;
  if ((self.status || '').toLowerCase() !== 'active') return null;
  return null;
}
