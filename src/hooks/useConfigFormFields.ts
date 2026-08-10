import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cleanLabel } from '@/hooks/useFormulaLabels';

export interface ConfigFormField {
  name: string;
  label: string;
}

export interface ConfigForm {
  id: string;
  name: string;
  fields: ConfigFormField[];
}

/**
 * Forms (and their line items) attached to a return configuration.
 *
 * Resolution mirrors `useFormulaLabels`: return_config_forms -> form_templates,
 * then the latest published form_versions row per template -> form_fields.
 */
export function useConfigFormFields(configId?: string | null) {
  return useQuery({
    queryKey: ['config_form_fields', configId ?? null],
    enabled: !!configId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ConfigForm[]> => {
      const { data: links, error: lErr } = await (supabase as any)
        .from('return_config_forms')
        .select('form_id,display_order')
        .eq('return_configuration_id', configId)
        .order('display_order');
      if (lErr) throw lErr;

      const templateIds = Array.from(
        new Set(((links ?? []) as any[]).map((l) => String(l.form_id)).filter(Boolean)),
      );
      if (templateIds.length === 0) return [];

      const [{ data: templates, error: tErr }, { data: versions, error: vErr }] = await Promise.all([
        (supabase as any).from('form_templates').select('id,name').in('id', templateIds),
        (supabase as any).from('form_versions').select('id,template_id,version,status').in('template_id', templateIds),
      ]);
      if (tErr) throw tErr;
      if (vErr) throw vErr;

      const nameById = new Map<string, string>(
        ((templates ?? []) as any[]).map((t) => [String(t.id), String(t.name ?? 'Form')]),
      );

      // Highest published version per template, falling back to highest overall.
      const best = new Map<string, { id: string; version: number; published: boolean }>();
      for (const v of ((versions ?? []) as any[])) {
        const tid = String(v.template_id);
        const published = v.status === 'published';
        const cur = best.get(tid);
        const better =
          !cur ||
          (published && !cur.published) ||
          (published === cur.published && Number(v.version ?? 0) > cur.version);
        if (better) best.set(tid, { id: String(v.id), version: Number(v.version ?? 0), published });
      }

      const versionIds = Array.from(best.values()).map((v) => v.id);
      // No published version yet: still offer the forms, just with no line items.
      if (versionIds.length === 0) {
        return templateIds.map((id) => ({ id, name: nameById.get(id) ?? 'Form', fields: [] }));
      }


      const { data: fields, error: fErr } = await (supabase as any)
        .from('form_fields')
        .select('version_id,field_name,label,section_order,sort_order')
        .in('version_id', versionIds)
        .order('section_order')
        .order('sort_order');
      if (fErr) throw fErr;

      const byVersion = new Map<string, string>();
      for (const [tid, v] of best.entries()) byVersion.set(v.id, tid);

      const grouped = new Map<string, ConfigFormField[]>();
      for (const f of ((fields ?? []) as any[])) {
        const tid = byVersion.get(String(f.version_id));
        if (!tid || !f.field_name) continue;
        const list = grouped.get(tid) ?? [];
        list.push({ name: String(f.field_name), label: cleanLabel(f.label) || String(f.field_name) });
        grouped.set(tid, list);
      }

      return templateIds.map((id) => ({
        id,
        name: nameById.get(id) ?? 'Form',
        fields: grouped.get(id) ?? [],
      }));
    },
  });
}
