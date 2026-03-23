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
}

export interface FormVersion {
  id: string;
  template_id: string;
  version: number;
  schema_snapshot: FormSection[];
  status: string;
  published_at: string | null;
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

// ─── Queries ───

export function useFormTemplates(formType?: string, regulatorId?: string | null) {
  return useQuery({
    queryKey: ['form_templates', formType, regulatorId],
    queryFn: async () => {
      let query = supabase
        .from('form_templates')
        .select('*, sectors:sector_id(name), sub_sectors:sub_sector_id(name), categories:category_id(name), services:service_id(name)')
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
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FormTemplate | null;
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
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FormVersion | null;
    },
    enabled: !!templateId,
  });
}

export function useLatestPublishedVersion(templateId: string | null) {
  return useQuery({
    queryKey: ['form_versions', 'latest-published', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const { data, error } = await supabase
        .from('form_versions')
        .select('*')
        .eq('template_id', templateId)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FormVersion | null;
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
  const { data: version } = useFormVersion(versionId);
  const { data: fieldRows = [] } = useFormFields(versionId);
  const { data: conditionRows = [] } = useFieldConditions(versionId);

  return useQuery({
    queryKey: ['version_sections', versionId, fieldRows.length, conditionRows.length],
    queryFn: () => {
      // Prefer normalized fields if available, fall back to snapshot
      if (fieldRows.length > 0) {
        return fieldRowsToSections(fieldRows, conditionRows);
      }
      if (version?.schema_snapshot) {
        return version.schema_snapshot as unknown as FormSection[];
      }
      return [];
    },
    enabled: !!versionId && (!!version || fieldRows.length > 0),
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
    }) => {
      const { template, sections, versionId, version = 1, changeNotes } = params;

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
        regulator_id: template.regulator_id || null,
        is_reusable: template.is_reusable,
        status: template.status,
        created_by: template.created_by,
      } as any);
      if (tErr) throw tErr;

      // Upsert version
      const vid = versionId || crypto.randomUUID();
      const { error: vErr } = await supabase.from('form_versions').upsert({
        id: vid,
        template_id: template.id,
        version,
        schema_snapshot: JSON.parse(JSON.stringify(sections)),
        status: template.status,
        published_at: template.status === 'published' ? new Date().toISOString() : null,
        created_by: template.created_by,
        change_notes: changeNotes || null,
      } as any);
      if (vErr) throw vErr;

      // Delete old fields & conditions for this version, then insert new
      const { error: delFieldsErr } = await supabase.from('form_fields').delete().eq('version_id', vid);
      if (delFieldsErr) console.warn('Could not delete old fields:', delFieldsErr);

      const { fields, conditions } = sectionsToFieldRows(vid, sections);

      // Delete old conditions for fields that belong to this version
      if (fields.length > 0) {
        const fieldIds = fields.map(f => f.id);
        await supabase.from('field_conditions').delete().in('field_id', fieldIds);
      }

      if (fields.length > 0) {
        // Use upsert to handle cases where delete didn't remove old rows
        const { error: fErr } = await supabase.from('form_fields').upsert(fields as any);
        if (fErr) throw fErr;
      }
      if (conditions.length > 0) {
        const { error: cErr } = await supabase.from('field_conditions').insert(conditions as any);
        if (cErr) throw cErr;
      }

      return { templateId: template.id, versionId: vid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_templates'] });
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
      queryClient.invalidateQueries({ queryKey: ['form_fields'] });
      queryClient.invalidateQueries({ queryKey: ['field_conditions'] });
    },
  });
}

export function useCreateNewFormVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { templateId: string; sections: FormSection[]; changeNotes?: string }) => {
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
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('form_templates').update({ status } as any).eq('id', id);
      if (error) throw error;
      // Also update latest version status
      const { data: versions } = await supabase
        .from('form_versions')
        .select('id')
        .eq('template_id', id)
        .order('version', { ascending: false })
        .limit(1);
      if (versions?.[0]) {
        await supabase.from('form_versions').update({
          status,
          published_at: status === 'published' ? new Date().toISOString() : null,
        } as any).eq('id', (versions[0] as any).id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form_templates'] });
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
    },
  });
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

// Re-export helpers for use in FormBuilder
export { sectionsToFieldRows, fieldRowsToSections };
