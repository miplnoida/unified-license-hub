import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FormSection, FormField, ConditionalRule } from '@/types/formBuilder';

// ─── Types ───
export interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  form_type: string;
  sector: string;
  sub_sector: string;
  category: string;
  service: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  service_id: string | null;
  // Joined names for display
  sector_name: string | null;
  sub_sector_name: string | null;
  category_name: string | null;
  service_name: string | null;
  regulator_id: string | null;
  is_reusable: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  return_type_id?: string | null;
  return_type_name?: string | null;
  return_type_code?: string | null;
}

export interface FormVersion {
  id: string;
  template_id: string;
  version: number;
  semantic_version?: string | null;
  branched_from_version_id?: string | null;
  schema_snapshot: FormSection[];
  status: string;
  published_at: string | null;
  effective_from?: string | null;
  effective_until?: string | null;
  created_by: string | null;
  change_notes: string | null;
  created_at: string;
}

export interface FormFieldRow {
  id: string;
  version_id: string;
  section_id: string;
  section_title: string;
  section_order: number;
  section_description: string | null;
  section_is_repeatable: boolean;
  field_type: string;
  label: string;
  field_name: string;
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  options: string[] | null;
  validation: any | null;
  sort_order: number;
  content: string | null;
  table_columns: any[] | null;
  calculated_expression: string | null;
  created_at: string;
}

export interface FieldConditionRow {
  id: string;
  field_id: string;
  watch_field_id: string;
  operator: string;
  value: string | null;
  action: string;
  created_at: string;
}

export interface FormResponse {
  id: string;
  template_id: string;
  version_id: string;
  user_id: string;
  response_data: Record<string, any>;
  status: string;
  submitted_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helper: Convert sections to normalized field rows ───
function sectionsToFieldRows(
  versionId: string,
  sections: FormSection[]
): { fields: Omit<FormFieldRow, 'created_at'>[]; conditions: Omit<FieldConditionRow, 'id' | 'created_at'>[] } {
  const fields: Omit<FormFieldRow, 'created_at'>[] = [];
  const conditions: Omit<FieldConditionRow, 'id' | 'created_at'>[] = [];

  for (const section of sections) {
    for (let fIdx = 0; fIdx < section.fields.length; fIdx++) {
      const f = section.fields[fIdx];
      const fieldId = f.id;

      fields.push({
        id: fieldId,
        version_id: versionId,
        section_id: section.id,
        section_title: section.title,
        section_order: section.sortOrder,
        section_description: section.description || null,
        section_is_repeatable: section.isRepeatable,
        field_type: f.type,
        label: f.label,
        field_name: f.fieldName,
        required: f.required,
        placeholder: f.placeholder || null,
        help_text: f.helpText || null,
        default_value: f.defaultValue || null,
        options: f.options || null,
        validation: f.validation || null,
        sort_order: fIdx,
        content: f.content || null,
        table_columns: f.tableColumns || null,
        calculated_expression: f.calculatedExpression || null,
      });

      if (f.conditionalLogic) {
        for (const rule of f.conditionalLogic) {
          conditions.push({
            field_id: fieldId,
            watch_field_id: rule.fieldId,
            operator: rule.operator,
            value: rule.value || null,
            action: rule.action,
          });
        }
      }
    }
  }

  return { fields, conditions };
}

// ─── Helper: Convert field rows + conditions back to FormSection[] ───
function fieldRowsToSections(
  fieldRows: FormFieldRow[],
  conditionRows: FieldConditionRow[]
): FormSection[] {
  const conditionsByField = new Map<string, ConditionalRule[]>();
  for (const c of conditionRows) {
    if (!conditionsByField.has(c.field_id)) conditionsByField.set(c.field_id, []);
    conditionsByField.get(c.field_id)!.push({
      fieldId: c.watch_field_id,
      operator: c.operator as ConditionalRule['operator'],
      value: c.value || undefined,
      action: c.action as ConditionalRule['action'],
    });
  }

  const sectionMap = new Map<string, FormSection>();
  for (const row of fieldRows) {
    if (!sectionMap.has(row.section_id)) {
      sectionMap.set(row.section_id, {
        id: row.section_id,
        title: row.section_title,
        description: row.section_description || undefined,
        sortOrder: row.section_order,
        isRepeatable: row.section_is_repeatable,
        fields: [],
      });
    }
    const section = sectionMap.get(row.section_id)!;
    const field: FormField = {
      id: row.id,
      type: row.field_type as FormField['type'],
      label: row.label,
      fieldName: row.field_name,
      required: row.required,
      placeholder: row.placeholder || undefined,
      helpText: row.help_text || undefined,
      defaultValue: row.default_value || undefined,
      options: row.options || undefined,
      validation: row.validation || undefined,
      content: row.content || undefined,
      tableColumns: row.table_columns || undefined,
      calculatedExpression: row.calculated_expression || undefined,
      conditionalLogic: conditionsByField.get(row.id) || undefined,
    };
    section.fields.push(field);
  }

  return Array.from(sectionMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(s => ({ ...s, fields: s.fields.sort((a, b) => {
      const aIdx = fieldRows.findIndex(r => r.id === a.id);
      const bIdx = fieldRows.findIndex(r => r.id === b.id);
      return aIdx - bIdx;
    }) }));
}

function isValidSectionSnapshot(snapshot: unknown): snapshot is FormSection[] {
  return Array.isArray(snapshot) && snapshot.every((section) => {
    if (!section || typeof section !== 'object') return false;
    const maybeSection = section as Partial<FormSection>;
    return typeof maybeSection.id === 'string'
      && typeof maybeSection.title === 'string'
      && Array.isArray(maybeSection.fields)
      && maybeSection.fields.every((field) => !!field && typeof field === 'object');
  });
}

function cloneSectionsWithNewFieldIds(sections: FormSection[]): FormSection[] {
  const newSections = JSON.parse(JSON.stringify(sections)) as FormSection[];
  const idMap = new Map<string, string>();

  for (const section of newSections) {
    for (const field of section.fields) {
      const newId = crypto.randomUUID();
      idMap.set(field.id, newId);
      field.id = newId;
    }
  }

  for (const section of newSections) {
    for (const field of section.fields) {
      if (!field.conditionalLogic) continue;
      for (const rule of field.conditionalLogic) {
        if (rule.fieldId && idMap.has(rule.fieldId)) {
          rule.fieldId = idMap.get(rule.fieldId)!;
        }
      }
    }
  }

  return newSections;
}

async function ensureVersionScopedFieldIds(versionId: string, sections: FormSection[]): Promise<FormSection[]> {
  const fieldIds = sections.flatMap((section) => section.fields.map((field) => field.id)).filter(Boolean);
  if (fieldIds.length === 0) return sections;

  if (new Set(fieldIds).size !== fieldIds.length) {
    return cloneSectionsWithNewFieldIds(sections);
  }

  const { data, error } = await supabase
    .from('form_fields')
    .select('id, version_id')
    .in('id', fieldIds);
  if (error) throw error;

  const hasCrossVersionCollision = (data || []).some((row: any) => row.version_id !== versionId);
  return hasCrossVersionCollision ? cloneSectionsWithNewFieldIds(sections) : sections;
}

async function replaceVersionFields(versionId: string, sections: FormSection[]) {
  const { data: existingFields } = await supabase
    .from('form_fields')
    .select('id')
    .eq('version_id', versionId);

  const existingFieldIds = (existingFields || []).map((row: any) => row.id).filter(Boolean);
  if (existingFieldIds.length > 0) {
    const { error: condErr } = await supabase
      .from('field_conditions')
      .delete()
      .in('field_id', existingFieldIds);
    if (condErr) throw condErr;
  }

  const { error: delFieldsErr } = await supabase
    .from('form_fields')
    .delete()
    .eq('version_id', versionId);
  if (delFieldsErr) throw delFieldsErr;

  const { fields, conditions } = sectionsToFieldRows(versionId, sections);

  // Defensive: dedupe any field IDs that might collide within the payload
  // (legacy data or accidental duplications can produce repeats which would
  // otherwise trip the form_fields PK constraint).
  const seenFieldIds = new Set<string>();
  const dedupedFields = fields.filter((f) => {
    if (seenFieldIds.has(f.id)) return false;
    seenFieldIds.add(f.id);
    return true;
  });

  if (dedupedFields.length > 0) {
    const { error: fErr } = await supabase.from('form_fields').insert(dedupedFields as any);
    if (fErr) throw fErr;
  }

  if (conditions.length > 0) {
    // Only keep conditions whose field_id was actually inserted
    const validConditions = conditions.filter((c) => seenFieldIds.has(c.field_id));
    if (validConditions.length > 0) {
      const { error: cErr } = await supabase.from('field_conditions').insert(validConditions as any);
      if (cErr) throw cErr;
    }
  }
}

async function deleteVersionDraft(versionId: string) {
  const { data: existingFields } = await supabase
    .from('form_fields')
    .select('id')
    .eq('version_id', versionId);

  const existingFieldIds = (existingFields || []).map((row: any) => row.id).filter(Boolean);
  if (existingFieldIds.length > 0) {
    const { error: condErr } = await supabase
      .from('field_conditions')
      .delete()
      .in('field_id', existingFieldIds);
    if (condErr) throw condErr;
  }

  const { error: fieldErr } = await supabase.from('form_fields').delete().eq('version_id', versionId);
  if (fieldErr) throw fieldErr;

  const { error: versionErr } = await supabase.from('form_versions').delete().eq('id', versionId);
  if (versionErr) throw versionErr;
}

// ─── Queries ───

export function useFormTemplates(formType?: string, regulatorId?: string | null) {
  return useQuery({
    queryKey: ['form_templates', formType, regulatorId],
    queryFn: async () => {
      let query = supabase
        .from('form_templates')
        .select('*, sectors:sector_id(name), sub_sectors:sub_sector_id(name), categories:category_id(name), services:service_id(name), return_types:return_type_id(id, name, code)')
        .order('created_at', { ascending: false });
      if (formType) query = query.eq('form_type', formType);
      if (regulatorId) query = query.eq('regulator_id', regulatorId);
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as any[]).map((row: any) => ({
        ...row,
        sector_name: row.sectors?.name || row.sector || null,
        sub_sector_name: row.sub_sectors?.name || row.sub_sector || null,
        category_name: row.categories?.name || row.category || null,
        service_name: row.services?.name || row.service || null,
        return_type_name: row.return_types?.name || null,
        return_type_code: row.return_types?.code || null,
      })) as FormTemplate[];
    },
  });
}

export function useFormTemplate(id: string | null) {
  return useQuery({
    queryKey: ['form_templates', 'detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('form_templates')
        .select('*, sectors:sector_id(name), sub_sectors:sub_sector_id(name), categories:category_id(name), services:service_id(name), return_types:return_type_id(id, name, code)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as any),
        sector_name: (data as any).sectors?.name || (data as any).sector || null,
        sub_sector_name: (data as any).sub_sectors?.name || (data as any).sub_sector || null,
        category_name: (data as any).categories?.name || (data as any).category || null,
        service_name: (data as any).services?.name || (data as any).service || null,
        return_type_name: (data as any).return_types?.name || null,
        return_type_code: (data as any).return_types?.code || null,
      } as FormTemplate;
    },
    enabled: !!id,
  });
}

export function useFormVersions(templateId: string | null) {
  return useQuery({
    queryKey: ['form_versions', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', templateId)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FormVersion[];
    },
    enabled: !!templateId,
  });
}

/**
 * Returns a map of templateId -> latest version row (preferring the most recent
 * published version, falling back to highest version number). Used by the Form
 * Management list to show the live "current" version regardless of template row state.
 */
export function useLatestVersionsByTemplates(templateIds: string[]) {
  const key = [...templateIds].sort().join(',');
  return useQuery({
    queryKey: ['form_versions', 'latest_map', key],
    queryFn: async () => {
      const map: Record<string, { semantic_version?: string | null; version: number; status: string; id: string }> = {};
      if (templateIds.length === 0) return map;
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, template_id, semantic_version, version, status, created_at')
        .in('template_id', templateIds)
        .order('version', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      // Prefer latest published; fall back to latest of any status.
      for (const r of rows) {
        const tid = r.template_id as string;
        const existing = map[tid];
        if (!existing) { map[tid] = r; continue; }
        const existingPub = existing.status === 'published';
        const rPub = r.status === 'published';
        if (rPub && !existingPub) map[tid] = r;
        else if (rPub === existingPub && r.version > existing.version) map[tid] = r;
      }
      return map;
    },
    enabled: templateIds.length > 0,
  });
}

export function useFormVersion(versionId: string | null) {
  return useQuery({
    queryKey: ['form_versions', 'detail', versionId],
    queryFn: async () => {
      if (!versionId) return null;
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('id', versionId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FormVersion | null;
    },
    enabled: !!versionId,
  });
}

export function useLatestVersion(templateId: string | null) {
  return useQuery({
    queryKey: ['form_versions', 'latest', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', templateId)
        .order('version', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FormVersion | null;
    },
    enabled: !!templateId,
  });
}

/**
 * Returns the published version that is currently effective per
 * `effective_from` / `effective_until`. If multiple are effective, the
 * highest version wins. Falls back to the latest published version if none
 * are explicitly scheduled (back-compat for legacy rows).
 */
export function useLatestPublishedVersion(templateId: string | null) {
  return useQuery({
    queryKey: ['form_versions', 'latest-published-effective', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', templateId)
        .eq('status', 'published')
        .order('version', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as FormVersion[];
      if (rows.length === 0) return null;

      const effective = rows.filter(v => isVersionEffective(v, nowIso));
      // Prefer effective rows; otherwise fall back to latest published
      return (effective[0] || rows[0]) ?? null;
    },
    enabled: !!templateId,
  });
}

export function useFormFields(versionId: string | null) {
  return useQuery({
    queryKey: ['form_fields', versionId],
    queryFn: async () => {
      if (!versionId) return [];
      const { data, error } = await supabase
        .from('form_fields')
        .select('*')
        .eq('version_id', versionId)
        .order('section_order', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as FormFieldRow[];
    },
    enabled: !!versionId,
  });
}

export function useFieldConditions(versionId: string | null) {
  return useQuery({
    queryKey: ['field_conditions', versionId],
    queryFn: async () => {
      if (!versionId) return [];
      // Get all field IDs for this version first
      const { data: fields } = await supabase
        .from('form_fields')
        .select('id')
        .eq('version_id', versionId);
      if (!fields?.length) return [];
      const fieldIds = fields.map((f: any) => f.id);
      const { data, error } = await supabase
        .from('field_conditions')
        .select('*')
        .in('field_id', fieldIds);
      if (error) throw error;
      return (data || []) as unknown as FieldConditionRow[];
    },
    enabled: !!versionId,
  });
}

// Combined: load sections from version (from schema_snapshot or normalized fields)
export function useVersionSections(versionId: string | null) {
  const { data: version, isFetched: versionFetched } = useFormVersion(versionId);
  const {
    data: fieldRows = [],
    isFetched: fieldsFetched,
    isFetching: fieldsFetching,
  } = useFormFields(versionId);
  const {
    data: conditionRows = [],
    isFetched: conditionsFetched,
    isFetching: conditionsFetching,
  } = useFieldConditions(versionId);

  return useQuery({
    queryKey: ['version_sections', versionId, fieldRows.length, conditionRows.length, version?.id],
    queryFn: () => {
      if (fieldRows.length > 0) {
        return fieldRowsToSections(fieldRows, conditionRows);
      }
      if (isValidSectionSnapshot(version?.schema_snapshot)) {
        return version.schema_snapshot as unknown as FormSection[];
      }
      return [];
    },
    enabled:
      !!versionId
      && versionFetched
      && fieldsFetched
      && !fieldsFetching
      && conditionsFetched
      && !conditionsFetching,
  });
}

// ─── Form Responses ───

export function useFormResponses(templateId?: string, entityType?: string, entityId?: string) {
  return useQuery({
    queryKey: ['form_responses', templateId, entityType, entityId],
    queryFn: async () => {
      let query = supabase
        .from('form_responses')
        .select('*')
        .order('created_at', { ascending: false });
      if (templateId) query = query.eq('template_id', templateId);
      if (entityType) query = query.eq('entity_type', entityType);
      if (entityId) query = query.eq('entity_id', entityId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as FormResponse[];
    },
  });
}

// ─── Mutations ───

export function useSaveFormTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      template: Omit<FormTemplate, 'created_at' | 'updated_at'>;
      sections: FormSection[];
      versionId?: string;
      version?: number;
      changeNotes?: string;
      semanticVersion?: string;
    }) => {
      const { template, sections, versionId, version = 1, changeNotes, semanticVersion } = params;

      // Upsert template
      const { error: tErr } = await supabase.from('form_templates').upsert({
        id: template.id,
        name: template.name,
        description: template.description,
        form_type: template.form_type,
        sector: template.sector,
        sub_sector: template.sub_sector,
        category: template.category,
        service: template.service,
        sector_id: template.sector_id || null,
        sub_sector_id: template.sub_sector_id || null,
        category_id: template.category_id || null,
        service_id: template.service_id || null,
        regulator_id: template.regulator_id || null,
        is_reusable: template.is_reusable,
        status: template.status,
        created_by: template.created_by,
        tab_name: (template as any).tab_name ?? null,
        form_order: (template as any).form_order ?? 0,
        return_type_id: (template as any).return_type_id ?? null,
      } as any);
      if (tErr) throw tErr;

      // Upsert version. IMPORTANT: Save/Draft must NOT bump semantic_version,
      // mark a version as published, or change the version's status. Versioning
      // is handled exclusively at Publish time so existing submissions stay
      // linked to their original published version.
      let sourceRow: any = null;
      if (versionId) {
        const { data, error: existingErr } = await supabase
          .from('form_versions')
          .select('*')
          .eq('id', versionId)
          .maybeSingle();
        if (existingErr) throw existingErr;
        sourceRow = data || null;
      }

      const isHistoricalSource =
        sourceRow?.status === 'published' || sourceRow?.status === 'archived';
      let workingRow = sourceRow;
      let vid = versionId || crypto.randomUUID();
      // Branch a brand-new draft when editing any historical (non-draft)
      // version — published OR archived — so we never overwrite history.
      let createNewDraftFromHistorical = false;
      const sourceHistoricalVersionId = isHistoricalSource ? sourceRow?.id ?? null : null;

      if (isHistoricalSource) {
        const { data: matchingDrafts, error: draftErr } = await supabase
          .from('form_versions')
          .select('*')
          .eq('template_id', template.id)
          .eq('status', 'draft')
          .eq('branched_from_version_id', sourceRow.id)
          .order('version', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);
        if (draftErr) throw draftErr;

        const latestDraft = matchingDrafts?.[0] || null;
        if (latestDraft) {
          workingRow = latestDraft;
          vid = latestDraft.id;
        } else {
          workingRow = null;
          vid = crypto.randomUUID();
          createNewDraftFromHistorical = true;
        }
      }

      // Compute version number. For brand-new drafts (no source row, or a new
      // draft branched from a published row), pick max(version)+1 to satisfy
      // the (template_id, version) uniqueness constraint.
      let resolvedVersion: number;
      if (workingRow?.version != null) {
        resolvedVersion = workingRow.version;
      } else {
        const { data: maxRows } = await supabase
          .from('form_versions')
          .select('version')
          .eq('template_id', template.id)
          .order('version', { ascending: false })
          .limit(1);
        const maxV = (maxRows?.[0] as any)?.version ?? 0;
        if (createNewDraftFromHistorical) {
          resolvedVersion = maxV + 1;
        } else if (!sourceRow) {
          // Brand-new template save: use requested version if free, else max+1
          resolvedVersion = maxV >= version ? maxV + 1 : version;
        } else {
          resolvedVersion = sourceRow.version ?? version;
        }
      }

      // The draft inherits the source/published semver as a placeholder. The
      // FINAL semver is recomputed at publish time based on change kind, so
      // this value is only used for display while the draft is being edited.
      // Never derive from the integer `resolvedVersion` — that desyncs from
      // the semantic version line (e.g. integer=7 while semver is still 2.x).
      const baseSemver =
        workingRow?.semantic_version ??
        sourceRow?.semantic_version ??
        semanticVersion ??
        '1.0';

      // CRITICAL: when branching a brand-new draft off a published version,
      // we must reassign field IDs. Also repair legacy drafts that still carry
      // IDs already used by another version of the same form.
      const baseSectionsForDraft = createNewDraftFromHistorical
        ? cloneSectionsWithNewFieldIds(sections)
        : sections;
      const sectionsForDraft = await ensureVersionScopedFieldIds(vid, baseSectionsForDraft);

      const shouldInheritSourceDates = !!sourceRow && !isHistoricalSource && !createNewDraftFromHistorical;

      const versionRow: any = {
        id: vid,
        template_id: template.id,
        version: resolvedVersion,
        branched_from_version_id: createNewDraftFromHistorical
          ? sourceHistoricalVersionId
          : (workingRow?.branched_from_version_id ?? sourceHistoricalVersionId),
        schema_snapshot: JSON.parse(JSON.stringify(sectionsForDraft)),
        status: 'draft',
        published_at: null,
        created_by: template.created_by,
        change_notes: changeNotes ?? workingRow?.change_notes ?? (createNewDraftFromHistorical ? null : sourceRow?.change_notes) ?? null,
        semantic_version: baseSemver,
        effective_from: workingRow?.effective_from ?? (shouldInheritSourceDates ? sourceRow?.effective_from : null) ?? null,
        effective_until: workingRow?.effective_until ?? (shouldInheritSourceDates ? sourceRow?.effective_until : null) ?? null,
      };

      const { error: vErr } = await supabase.from('form_versions').upsert(versionRow);
      if (vErr) throw vErr;

      await replaceVersionFields(vid, sectionsForDraft);

      return { templateId: template.id, versionId: vid, sections: sectionsForDraft };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_templates'] });
      queryClient.invalidateQueries({ queryKey: ['form_templates', 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
      queryClient.invalidateQueries({ queryKey: ['form_fields'] });
      queryClient.invalidateQueries({ queryKey: ['field_conditions'] });
    },
  });
}

export function useCreateNewFormVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { templateId: string; sections: FormSection[]; changeNotes?: string; semanticVersion?: string }) => {
      // Get max version
      const { data: versions } = await supabase
        .from('form_versions')
        .select('version')
        .eq('template_id', params.templateId)
        .order('version', { ascending: false })
        .limit(1);
      const maxVersion = (versions?.[0] as any)?.version || 0;
      const newVersion = maxVersion + 1;
      const vid = crypto.randomUUID();

      // Generate new IDs for fields first, then build snapshot
      const newSections = JSON.parse(JSON.stringify(params.sections)) as FormSection[];
      const idMap = new Map<string, string>();
      for (const section of newSections) {
        for (const field of section.fields) {
          const newId = crypto.randomUUID();
          idMap.set(field.id, newId);
          field.id = newId;
        }
      }
      // Update conditional logic references to use new IDs
      for (const section of newSections) {
        for (const field of section.fields) {
          if (field.conditionalLogic) {
            for (const rule of field.conditionalLogic) {
              if (rule.fieldId && idMap.has(rule.fieldId)) {
                rule.fieldId = idMap.get(rule.fieldId)!;
              }
            }
          }
        }
      }

      const { error: vErr } = await supabase.from('form_versions').insert({
        id: vid,
        template_id: params.templateId,
        version: newVersion,
        schema_snapshot: JSON.parse(JSON.stringify(newSections)),
        status: 'draft',
        change_notes: params.changeNotes || null,
        semantic_version: params.semanticVersion || `${newVersion}.0`,
      } as any);
      if (vErr) throw vErr;

      const { fields, conditions } = sectionsToFieldRows(vid, newSections);
      if (fields.length > 0) {
        const { error: fErr } = await supabase.from('form_fields').insert(fields as any);
        if (fErr) throw fErr;
      }
      if (conditions.length > 0) {
        const { error: cErr } = await supabase.from('field_conditions').insert(conditions as any);
        if (cErr) throw cErr;
      }

      return { versionId: vid, version: newVersion };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
      queryClient.invalidateQueries({ queryKey: ['form_fields'] });
      queryClient.invalidateQueries({ queryKey: ['field_conditions'] });
    },
  });
}

export function useDeleteFormTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Clean up dependent rows that have NO ACTION FKs and would block delete.
      // Order matters: child data first, then linking config rows, then responses.
      const cleanups: Array<{ table: string; col: string }> = [
        { table: 'return_form_data', col: 'form_id' },
        { table: 'return_comments', col: 'form_id' },
        { table: 'return_config_forms', col: 'form_id' },
        { table: 'form_responses', col: 'template_id' },
      ];
      for (const { table, col } of cleanups) {
        const { error: cErr } = await supabase.from(table as any).delete().eq(col, id);
        if (cErr && cErr.code !== '42P01') {
          // Ignore "table does not exist"; surface anything else
          throw new Error(`${table}: ${cErr.message}`);
        }
      }
      // registration_form_configs has ON DELETE SET NULL — safe to leave.
      // form_versions / form_field_dependencies cascade automatically.
      const { error } = await supabase.from('form_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_templates'] });
    },
  });
}

export function useUpdateTemplateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, effective_from }: { id: string; status: string; effective_from?: string | null }) => {
      // Always update the template's status first.
      const { error } = await supabase.from('form_templates').update({ status } as any).eq('id', id);
      if (error) throw error;

      // For non-publish transitions (draft / archived), just sync the latest
      // version's status — never create new version rows.
      if (status !== 'published') {
        const { data: versions } = await supabase
          .from('form_versions')
          .select('id')
          .eq('template_id', id)
          .order('version', { ascending: false })
          .limit(1);
        if (versions?.[0]) {
          await supabase.from('form_versions').update({
            status,
            published_at: null,
          } as any).eq('id', (versions[0] as any).id);
        }
        return;
      }

      // ── Publish path ──
      // Multi-active versioning: publishing a draft ALWAYS inserts a new
      // form_versions row so prior published versions remain accessible
      // alongside the new one. Cosmetic-only edits with no draft just refresh
      // the timestamp on the existing published row.
      const { data: draftRows } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', id)
        .eq('status', 'draft')
        .order('version', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      const latestDraft: any = draftRows?.[0] || null;

      const { data: publishedRows } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', id)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1);
      const lastPublished: any = publishedRows?.[0] || null;

      // No draft and no prior published → nothing to publish
      if (!latestDraft && !lastPublished) return;

      // No draft, only an existing published row → just refresh timestamp.
      if (!latestDraft && lastPublished) {
        await supabase.from('form_versions').update({
          status: 'published',
          published_at: new Date().toISOString(),
        } as any).eq('id', lastPublished.id);
        return;
      }

      // Draft exists → snapshot it as a NEW published version. We never
      // overwrite or delete prior published versions (multi-active support).
      const draftSections = (latestDraft.schema_snapshot || []) as FormSection[];
      const publishedSections = (lastPublished?.schema_snapshot || []) as FormSection[];



      const changeKind: SchemaChangeKind = lastPublished
        ? classifySchemaChange(publishedSections, draftSections)
        : 'major'; // first-ever publish

      // ── No meaningful change at all → just refresh the existing published row's timestamp ──
      if (lastPublished && changeKind === 'none') {
        await supabase.from('form_versions').update({
          status: 'published',
          published_at: new Date().toISOString(),
        } as any).eq('id', lastPublished.id);
        // Discard the working draft so the next edit starts fresh.
        await deleteVersionDraft(latestDraft.id);
        return;
      }

      // Compute new semantic version per spec:
      //   minor change → bump minor (v1.2 → v1.3)
      //   major change → bump major, reset minor (v1.2 → v2.0)
      //   first publish → 1.0
      // IMPORTANT: derive baseline from the highest *semantic* version across
      // all published rows — never from the integer DB `version` column. The
      // integer column auto-increments on every publish, so using it as a
      // fallback caused jumps like v2.1 → v7.0.
      let baseMaj = 0;
      let baseMin = 0;
      if (lastPublished) {
        const { data: pubRows } = await supabase
          .from('form_versions')
          .select('semantic_version')
          .eq('template_id', id)
          .eq('status', 'published');
        const parsed = (pubRows || [])
          .map((r: any) => {
            const sv = (r?.semantic_version || '').toString().trim();
            if (!sv) return null;
            const [a, b] = sv.split('.').map((n: string) => Number(n));
            if (!Number.isFinite(a)) return null;
            return { maj: a, min: Number.isFinite(b) ? b : 0 };
          })
          .filter(Boolean) as Array<{ maj: number; min: number }>;
        if (parsed.length > 0) {
          parsed.sort((a, b) => (b.maj - a.maj) || (b.min - a.min));
          baseMaj = parsed[0].maj;
          baseMin = parsed[0].min;
        } else {
          // No semantic_version recorded anywhere → start from 1.0 baseline.
          baseMaj = 1;
          baseMin = 0;
        }
      }

      const newSemver = !lastPublished
        ? '1.0'
        : changeKind === 'major'
          ? `${baseMaj + 1}.0`
          : `${baseMaj}.${baseMin + 1}`;

      // Compute next integer version (DB unique on template_id+version).
      // Both major and minor publishes create a NEW row so prior published
      // versions remain unchanged and submissions stay linked correctly.
      const { data: maxRows } = await supabase
        .from('form_versions')
        .select('version')
        .eq('template_id', id)
        .order('version', { ascending: false })
        .limit(1);
      const maxV = (maxRows?.[0] as any)?.version ?? 0;
      const newVersionNum = maxV + 1;
      const newVid = crypto.randomUUID();

      // Always clone field IDs so historic submissions linked via field_id
      // to the prior published version remain stable and independent.
      const newSections = cloneSectionsWithNewFieldIds(draftSections);

      const nowDate = new Date();
      const nowIso = nowDate.toISOString();
      // Last day of the current month at end-of-day, used to retire prior
      // open-ended published versions when a new version goes live.
      const monthEnd = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth() + 1,
        0,
        23, 59, 59, 999,
      ).toISOString();

      const nextEffectiveFrom = latestDraft.effective_from ?? effective_from ?? nowIso;
      const nextEffectiveUntil = latestDraft.effective_until ?? null;

      if (nextEffectiveUntil && new Date(nextEffectiveUntil) < new Date(nextEffectiveFrom)) {
        throw new Error('End date cannot be before effective from.');
      }

      // Close out any prior published versions for this template that are still
      // open-ended (effective_until IS NULL). Their effective_from is preserved.
      await supabase
        .from('form_versions')
        .update({ effective_until: monthEnd } as any)
        .eq('template_id', id)
        .eq('status', 'published')
        .is('effective_until', null);

      const { error: vErr } = await supabase.from('form_versions').insert({
        id: newVid,
        template_id: id,
        version: newVersionNum,
        schema_snapshot: JSON.parse(JSON.stringify(newSections)),
        status: 'published',
        published_at: nowIso,
        change_notes:
          latestDraft.change_notes ||
          (lastPublished
            ? `Published v${newSemver} (${changeKind} update)`
            : 'Initial publish'),
        semantic_version: newSemver,
        // New version starts today (or admin-chosen date from draft) and is
        // open-ended by default. Admin can edit effective_until later.
        effective_from: nextEffectiveFrom,
        effective_until: nextEffectiveUntil,
        notified_for_upcoming: false,
      } as any);
      if (vErr) throw vErr;

      await replaceVersionFields(newVid, newSections);

      // Discard the working draft after a successful publish.
      await deleteVersionDraft(latestDraft.id);

      // Best-effort: announce upcoming version if it's scheduled for the future.
      try { await notifyUpcomingVersionIfNeeded(newVid); } catch (_) { /* non-blocking */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_templates'] });
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
      queryClient.invalidateQueries({ queryKey: ['form_fields'] });
      queryClient.invalidateQueries({ queryKey: ['field_conditions'] });
    },
  });
}

/**
 * Returns true when two schemas differ in ways that affect submitted data
 * structure: fields added/removed, sections added/removed, field type changed,
 * or field name (`id` mapping) changed. Label/placeholder/help/order/styling
 * changes are NOT considered structural.
 */
/**
 * Classify the diff between two form schemas.
 * - 'major'   : structural change (added/removed field or section, type/validation/required/options/data-mapping change)
 * - 'minor'   : cosmetic only (label, placeholder, help text, description, section title, order, styling)
 * - 'none'    : no meaningful change
 *
 * Field identity is matched by `fieldName` (stable across version branching),
 * NOT by `id`, because branching a draft from a published version assigns
 * fresh field IDs and would otherwise always look "structural".
 */
export type SchemaChangeKind = 'major' | 'minor' | 'none';

export function classifySchemaChange(
  oldSections: FormSection[],
  newSections: FormSection[],
): SchemaChangeKind {
  // Section-level structural diffs (by section id is fine — sections don't get re-id'd on branching)
  const oldSectionIds = new Set(oldSections.map(s => s.id));
  const newSectionIds = new Set(newSections.map(s => s.id));
  if ([...newSectionIds].some(id => !oldSectionIds.has(id))) return 'major';
  if ([...oldSectionIds].some(id => !newSectionIds.has(id))) return 'major';

  // Build field maps keyed by fieldName (stable identifier).
  // Skip fields without a fieldName as unidentifiable.
  const collect = (sections: FormSection[]) => {
    const map = new Map<string, { field: FormField; sectionId: string; index: number }>();
    sections.forEach(s => s.fields.forEach((f, idx) => {
      if (f.fieldName) map.set(f.fieldName, { field: f, sectionId: s.id, index: idx });
    }));
    return map;
  };
  const oldMap = collect(oldSections);
  const newMap = collect(newSections);

  // Added / removed fields → structural (major)
  for (const k of newMap.keys()) if (!oldMap.has(k)) return 'major';
  for (const k of oldMap.keys()) if (!newMap.has(k)) return 'major';

  // Per-field structural checks
  let anyCosmeticChange = false;
  for (const [name, n] of newMap.entries()) {
    const o = oldMap.get(name)!;
    const of = o.field;
    const nf = n.field;

    // Structural attributes
    if (of.type !== nf.type) return 'major';
    if (!!of.required !== !!nf.required) return 'major';
    if (JSON.stringify(of.validation || {}) !== JSON.stringify(nf.validation || {})) return 'major';
    if (JSON.stringify(of.options || []) !== JSON.stringify(nf.options || [])) return 'major';
    if (of.type === 'table' && JSON.stringify(of.tableColumns || []) !== JSON.stringify(nf.tableColumns || [])) return 'major';

    // Cosmetic-only attributes
    if ((of.label || '') !== (nf.label || '')) anyCosmeticChange = true;
    if ((of.placeholder || '') !== (nf.placeholder || '')) anyCosmeticChange = true;
    if ((of.helpText || '') !== (nf.helpText || '')) anyCosmeticChange = true;
    if (((of as any).description || '') !== ((nf as any).description || '')) anyCosmeticChange = true;
    if (o.sectionId !== n.sectionId || o.index !== n.index) anyCosmeticChange = true;
  }

  // Section title / ordering changes → cosmetic
  for (let i = 0; i < newSections.length; i++) {
    const ns = newSections[i];
    const os = oldSections.find(s => s.id === ns.id);
    if (!os) continue;
    if ((os.title || '') !== (ns.title || '')) anyCosmeticChange = true;
    if (oldSections.indexOf(os) !== i) anyCosmeticChange = true;
  }

  return anyCosmeticChange ? 'minor' : 'none';
}

/**
 * @deprecated Use classifySchemaChange() instead. Kept for backward compatibility.
 */
export function hasStructuralChanges(oldSections: FormSection[], newSections: FormSection[]): boolean {
  return classifySchemaChange(oldSections, newSections) === 'major';
}

export function useSaveFormResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (response: Omit<FormResponse, 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('form_responses').upsert({
        id: response.id,
        template_id: response.template_id,
        version_id: response.version_id,
        user_id: response.user_id,
        response_data: response.response_data,
        status: response.status,
        submitted_at: response.submitted_at,
        entity_type: response.entity_type || null,
        entity_id: response.entity_id || null,
      } as any);
      if (error) throw error;
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_responses'] });
    },
  });
}

// ─── Semantic Versioning Helper ───
// Minor change (label, text, validation tweak): 1.0 → 1.1 → 1.2
// Major change (field added/removed, field type changed, section added/removed): 1.x → 2.0, 2.x → 3.0
export function computeSemanticVersion(
  currentVersion: string,
  oldSections: FormSection[],
  newSections: FormSection[]
): string {
  const [major, minor] = currentVersion.split('.').map(Number);

  const oldFieldIds = new Set(oldSections.flatMap(s => s.fields.map(f => f.id)));
  const newFieldIds = new Set(newSections.flatMap(s => s.fields.map(f => f.id)));

  // Check if any fields were added or removed
  const added = [...newFieldIds].some(id => !oldFieldIds.has(id));
  const removed = [...oldFieldIds].some(id => !newFieldIds.has(id));

  // Check if sections were added or removed
  const oldSectionIds = new Set(oldSections.map(s => s.id));
  const newSectionIds = new Set(newSections.map(s => s.id));
  const sectionAdded = [...newSectionIds].some(id => !oldSectionIds.has(id));
  const sectionRemoved = [...oldSectionIds].some(id => !newSectionIds.has(id));

  // Check if any field type was changed
  const oldFieldMap = new Map<string, string>();
  oldSections.forEach(s => s.fields.forEach(f => oldFieldMap.set(f.id, f.type)));
  const typeChanged = newSections.some(s =>
    s.fields.some(f => oldFieldMap.has(f.id) && oldFieldMap.get(f.id) !== f.type)
  );

  if (added || removed || sectionAdded || sectionRemoved || typeChanged) {
    return `${major + 1}.0`;
  }
  return `${major}.${minor + 1}`;
}

// ─── Multi-Active Versions: helpers + hooks ───

/**
 * Returns true when a published version is currently within its
 * effective_from / effective_until window. Effective_until is treated as an
 * inclusive end-of-day to match the admin's date picker semantics.
 */
export function isVersionEffective(v: { effective_from?: string | null; effective_until?: string | null }, atIso?: string): boolean {
  const nowIso = atIso || new Date().toISOString();
  const fromOk = !v.effective_from || v.effective_from <= nowIso;
  let untilOk = true;
  if (v.effective_until) {
    const until = new Date(v.effective_until);
    until.setUTCHours(23, 59, 59, 999);
    untilOk = until.toISOString() >= nowIso;
  }
  return fromOk && untilOk;
}

/**
 * Returns ALL currently-active (published + within effective window) versions
 * for a template, sorted by version desc. The first item is the default for
 * licensees; they may switch to any other returned version.
 */
export function useActiveVersions(templateId: string | null) {
  return useQuery({
    queryKey: ['form_versions', 'active-multi', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', templateId)
        .eq('status', 'published')
        .order('version', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as FormVersion[];
      const eff = rows.filter(v => isVersionEffective(v));
      // If none are within an effective window, fall back to all published rows
      // so existing legacy templates (no dates configured) keep working.
      return eff.length > 0 ? eff : rows;
    },
    enabled: !!templateId,
  });
}

/**
 * Admin-only: update activation/scheduling of a published version. Allows
 * toggling between `published` (active) and `archived` (deactivated) and
 * setting effective_from / effective_until.
 */
export function useUpdateVersionSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      versionId: string;
      status?: 'published' | 'archived';
      effective_from?: string | null;
      effective_until?: string | null;
    }) => {
      const patch: any = {};
      if (params.status) patch.status = params.status;
      if (params.effective_from !== undefined) patch.effective_from = params.effective_from;
      if (params.effective_until !== undefined) patch.effective_until = params.effective_until;
      // Reset notification flag when the schedule moves so a newly-future
      // version can re-trigger an upcoming notification.
      if (params.effective_from !== undefined) patch.notified_for_upcoming = false;
      // Validate date range: effective_until must not be before effective_from.
      if (params.effective_from && params.effective_until) {
        if (new Date(params.effective_until) < new Date(params.effective_from)) {
          throw new Error('Effective until cannot be before effective from.');
        }
      }
      const { error } = await supabase.from('form_versions').update(patch).eq('id', params.versionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
    },
  });
}

/**
 * Activate a published version as the current default for new applications.
 * Backend retires other open-ended published versions to current month-end so
 * already-pinned in-progress applications can still complete on them.
 */
export function useActivateVersionAsCurrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { versionId: string; activationDate?: string | null }) => {
      const { data, error } = await supabase.rpc('activate_form_version_as_current' as any, {
        _version_id: params.versionId,
        _activation_date: params.activationDate ?? null,
      });
      if (error) throw error;
      const res: any = data;
      if (res?.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
    },
  });
}

/**
 * Per-version usage counts (in-progress applications + submitted responses).
 * Used by the admin version timeline to indicate where each version is in use.
 */
export function useFormVersionUsageCounts(templateId: string | null) {
  return useQuery({
    queryKey: ['form_versions', 'usage_counts', templateId],
    queryFn: async () => {
      if (!templateId) return {} as Record<string, { in_progress: number; submitted: number }>;
      const { data, error } = await supabase.rpc('get_form_version_usage_counts' as any, {
        _template_id: templateId,
      });
      if (error) throw error;
      const map: Record<string, { in_progress: number; submitted: number }> = {};
      for (const row of (data || []) as any[]) {
        map[row.version_id] = {
          in_progress: Number(row.in_progress_count) || 0,
          submitted: Number(row.submitted_response_count) || 0,
        };
      }
      return map;
    },
    enabled: !!templateId,
  });
}

/**
 * Idempotent helper: if a version has a future effective_from and hasn't
 * been announced yet, create one in-app notification per licensee user.
 */
export async function notifyUpcomingVersionIfNeeded(versionId: string) {
  const { data: version } = await supabase
    .from('form_versions')
    .select('id, template_id, semantic_version, version, effective_from, notified_for_upcoming, status')
    .eq('id', versionId)
    .maybeSingle();
  if (!version) return;
  const v: any = version;
  if (v.status !== 'published') return;
  if (v.notified_for_upcoming) return;
  if (!v.effective_from || v.effective_from <= new Date().toISOString()) return;

  const { data: tpl } = await supabase
    .from('form_templates')
    .select('id, name')
    .eq('id', v.template_id)
    .maybeSingle();
  if (!tpl) return;

  const { data: users } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['licensee_primary', 'licensee_secondary'] as any);
  const recipients = (users || []) as any[];

  if (recipients.length > 0) {
    const friendlyDate = new Date(v.effective_from).toLocaleDateString();
    const semver = v.semantic_version || `${v.version}.0`;
    const rows = recipients.map(u => ({
      user_id: u.id,
      title: `Upcoming form version: ${(tpl as any).name}`,
      message: `A new version (v${semver}) of "${(tpl as any).name}" becomes effective on ${friendlyDate}. Please review before the activation date.`,
      type: 'info',
      channel: 'in_app',
      delivery_status: 'delivered',
      entity_type: 'form_version',
      entity_id: versionId,
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await supabase.from('notifications').insert(rows.slice(i, i + CHUNK) as any);
    }
  }

  await supabase.from('form_versions').update({ notified_for_upcoming: true } as any).eq('id', versionId);
}

/**
 * Manually notify licensee/PPOC users about a form version (admin-triggered).
 * Returns the number of recipients notified.
 */
export async function notifyVersionToLicensees(versionId: string): Promise<number> {
  const { data: version } = await supabase
    .from('form_versions')
    .select('id, template_id, semantic_version, version, effective_from, status')
    .eq('id', versionId)
    .maybeSingle();
  if (!version) throw new Error('Version not found');
  const v: any = version;

  const { data: tpl } = await supabase
    .from('form_templates')
    .select('id, name')
    .eq('id', v.template_id)
    .maybeSingle();
  if (!tpl) throw new Error('Form template not found');

  // Licensees come from user_roles (canonical); PPOC users come from ppoc_entity_mappings
  // because 'ppoc' is not a value in the app_role enum.
  const [licenseesRes, ppocRes] = await Promise.all([
    supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['licensee_primary', 'licensee_secondary'] as any),
    supabase
      .from('ppoc_entity_mappings')
      .select('ppoc_user_id')
      .eq('is_active', true),
  ]);
  if (licenseesRes.error) throw licenseesRes.error;
  if (ppocRes.error) throw ppocRes.error;
  const ids = new Set<string>();
  (licenseesRes.data || []).forEach((r: any) => r.user_id && ids.add(r.user_id));
  (ppocRes.data || []).forEach((r: any) => r.ppoc_user_id && ids.add(r.ppoc_user_id));
  const userIds = Array.from(ids);
  if (userIds.length === 0) return 0;
  const recipients = userIds.map(id => ({ id }));

  const semver = v.semantic_version || `${v.version}.0`;
  const effectiveLine = v.effective_from
    ? ` It becomes effective on ${new Date(v.effective_from).toLocaleDateString()}.`
    : '';
  const rows = recipients.map(u => ({
    user_id: u.id,
    title: `Form version update: ${(tpl as any).name}`,
    message: `Version v${semver} of "${(tpl as any).name}" is now available.${effectiveLine}`,
    type: 'info',
    channel: 'in_app',
    delivery_status: 'delivered',
    entity_type: 'form_version',
    entity_id: versionId,
  }));
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: insErr } = await supabase.from('notifications').insert(rows.slice(i, i + CHUNK) as any);
    if (insErr) throw insErr;
  }
  return recipients.length;
}

// Re-export helpers for use in FormBuilder
export { sectionsToFieldRows, fieldRowsToSections };

// ───────────────────────────────────────────────────────────
// Backend resolver: pin & return the form version an
// application should use for a given template.
// ───────────────────────────────────────────────────────────
export interface ResolvedAppFormVersion {
  application_id: string;
  template_id: string;
  version_id: string;
  version_number: number | null;
  semantic_version: string | null;
  assigned_reason: 'latest_at_start' | 'resumed_existing' | 'migrated_from_json';
  was_existing_assignment: boolean;
}

export interface ResolvedReturnFormVersion {
  return_submission_id: string;
  template_id: string;
  version_id: string;
  version_number: number | null;
  semantic_version: string | null;
  assigned_reason: 'latest_at_start' | 'resumed_existing' | 'migrated_from_return_form_data';
  was_existing_assignment: boolean;
}

export interface ResolveAppFormVersionError {
  error: string;
  code: string;
}

/**
 * Calls the `resolve_application_form_version` Postgres RPC. The backend
 * decides which version to use, pins it on first call, and returns it.
 * The frontend never picks the version itself.
 */
export function useResolveAppFormVersion(
  applicationId: string | null | undefined,
  templateId: string | null | undefined,
) {
  return useQuery<ResolvedAppFormVersion | ResolveAppFormVersionError | null>({
    queryKey: ['resolve_app_form_version', applicationId, templateId],
    queryFn: async () => {
      if (!applicationId || !templateId) return null;
      const { data, error } = await (supabase as any).rpc('resolve_application_form_version', {
        _application_id: applicationId,
        _template_id: templateId,
      });
      if (error) throw error;
      return data as unknown as ResolvedAppFormVersion | ResolveAppFormVersionError;
    },
    enabled: !!applicationId && !!templateId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useResolveReturnFormVersion(
  returnSubmissionId: string | null | undefined,
  templateId: string | null | undefined,
) {
  return useQuery<ResolvedReturnFormVersion | ResolveAppFormVersionError | null>({
    queryKey: ['resolve_return_form_version', returnSubmissionId, templateId],
    queryFn: async () => {
      if (!returnSubmissionId || !templateId) return null;
      const { data, error } = await (supabase as any).rpc('resolve_return_form_version', {
        _return_submission_id: returnSubmissionId,
        _template_id: templateId,
      });
      if (error) throw error;
      return data as unknown as ResolvedReturnFormVersion | ResolveAppFormVersionError;
    },
    enabled: !!returnSubmissionId && !!templateId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

