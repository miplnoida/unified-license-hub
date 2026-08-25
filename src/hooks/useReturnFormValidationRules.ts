/**
 * Reads the configured financial checks (`public.return_form_validation_rules`)
 * for the form templates pinned to a filing. Read-only for filers; the same
 * rows drive the server-side check inside `returns_validate_filing`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ReturnFormRule } from '@/lib/returns/formValidationRules';

const db = () => supabase as unknown as { from: (t: string) => any };

export function useReturnFormValidationRules(templateIds: string[]) {
  const ids = Array.from(new Set(templateIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['return-form-validation-rules', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, ReturnFormRule[]>> => {
      const { data, error } = await db()
        .from('return_form_validation_rules')
        .select('id, form_template_id, rule_code, label, message_template, expression, lhs_field, rhs_fields, tolerance, severity, is_blocking, is_active')
        .in('form_template_id', ids)
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      const out: Record<string, ReturnFormRule[]> = {};
      for (const raw of (data ?? []) as any[]) {
        const rule: ReturnFormRule = {
          ...raw,
          rhs_fields: Array.isArray(raw.rhs_fields) ? raw.rhs_fields : [],
          tolerance: Number(raw.tolerance ?? 0.01),
        };
        out[rule.form_template_id] = [...(out[rule.form_template_id] ?? []), rule];
      }
      return out;
    },
  });
}
