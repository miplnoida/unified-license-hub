import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Matches `<uuid>.<field_name>` tokens used in ratio / validation expressions. */
export const FORMULA_TOKEN_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]+)/gi;

export interface TokenLabel {
  form: string;
  field: string;
}

export type FormulaLabelMap = Map<string, TokenLabel>;

/** Extract the distinct form template ids referenced by a set of formulas. */
export function extractTemplateIds(formulas: (string | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const f of formulas) {
    if (!f) continue;
    for (const m of f.matchAll(FORMULA_TOKEN_RE)) ids.add(m[1].toLowerCase());
  }
  return Array.from(ids);
}

/**
 * Resolves `formTemplateId.fieldName` tokens to human labels
 * (form template name + field label from its latest published version).
 */
export function useFormulaLabels(formulas: (string | null | undefined)[]) {
  const templateIds = useMemo(() => extractTemplateIds(formulas), [formulas.join('|')]);

  return useQuery({
    queryKey: ['formula_token_labels', templateIds.slice().sort().join(',')],
    enabled: templateIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FormulaLabelMap> => {
      const map: FormulaLabelMap = new Map();

      const [{ data: templates, error: tErr }, { data: versions, error: vErr }] = await Promise.all([
        (supabase as any).from('form_templates').select('id,name').in('id', templateIds),
        (supabase as any).from('form_versions').select('id,template_id,version,status').in('template_id', templateIds),
      ]);
      if (tErr) throw tErr;
      if (vErr) throw vErr;

      const nameById = new Map<string, string>(
        ((templates ?? []) as any[]).map((t) => [String(t.id).toLowerCase(), t.name as string]),
      );

      // Pick, per template, the highest published version (falling back to highest overall).
      const best = new Map<string, { id: string; version: number; published: boolean }>();
      for (const v of ((versions ?? []) as any[])) {
        const tid = String(v.template_id).toLowerCase();
        const published = v.status === 'published';
        const cur = best.get(tid);
        const better =
          !cur ||
          (published && !cur.published) ||
          (published === cur.published && Number(v.version ?? 0) > cur.version);
        if (better) best.set(tid, { id: v.id, version: Number(v.version ?? 0), published });
      }

      const versionIds = Array.from(best.values()).map((v) => v.id);
      if (versionIds.length === 0) return map;

      const { data: fields, error: fErr } = await (supabase as any)
        .from('form_fields')
        .select('version_id,field_name,label')
        .in('version_id', versionIds);
      if (fErr) throw fErr;

      const templateByVersion = new Map<string, string>();
      for (const [tid, v] of best.entries()) templateByVersion.set(v.id, tid);

      for (const f of ((fields ?? []) as any[])) {
        const tid = templateByVersion.get(f.version_id);
        if (!tid || !f.field_name) continue;
        map.set(`${tid}.${f.field_name}`, {
          form: nameById.get(tid) ?? 'Form',
          field: cleanLabel(f.label) || f.field_name,
        });
      }

      return map;
    },
  });
}

/** Tidy imported field labels: collapse whitespace and drop trailing form suffixes. */
export function cleanLabel(label?: string | null): string {
  if (!label) return '';
  return String(label)
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–]\s*(BS|P&L|PL)\s*$/i, '')
    .trim();
}
