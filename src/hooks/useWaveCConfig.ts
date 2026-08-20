/**
 * RDM-ENTITY-001 Wave C — configuration-surface hooks for the "Reporting &
 * Metrics" workspace (return definitions, definition forms, obligation
 * rules, obligation-rule testing, regulatory metrics and their calculation
 * rules). Reads are plain `.from()` selects; every write goes through a
 * governed SECURITY DEFINER RPC — never mutate these tables directly.
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

const KEY = ['wave-c-config'] as const;

/* ------------------------------------------------------------------ */
/* Master-data lookups (read-only)                                     */
/* ------------------------------------------------------------------ */

export interface LookupOption { id: string; label: string; }

function useLookup(table: string, labelCol: string, extraSelect = '', order = labelCol) {
  return useQuery({
    queryKey: [...KEY, 'lookup', table],
    queryFn: async (): Promise<LookupOption[]> => {
      const { data, error } = await db().from(table)
        .select(`id, ${labelCol}${extraSelect ? `, ${extraSelect}` : ''}`)
        .order(order);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => ({ id: r.id, label: r[labelCol], ...r }));
    },
    staleTime: 60_000,
  });
}

export function useRegulatorOptions() { return useLookup('regulators', 'name'); }
export function useSectorOptions() { return useLookup('sectors', 'name'); }
export function useSubSectorOptions() { return useLookup('sub_sectors', 'name', 'sector_id'); }
export function useCategoryOptions() { return useLookup('categories', 'name', 'sector_id, sub_sector_id'); }
export function useLifecycleStageOptions() { return useLookup('lifecycle_stages', 'label'); }
export function useDataDomainOptions() { return useLookup('data_domains', 'label'); }

export function useClassificationValueOptions() {
  return useQuery({
    queryKey: [...KEY, 'lookup', 'classification_values'],
    queryFn: async (): Promise<LookupOption[]> => {
      const { data, error } = await db().from('classification_values')
        .select('id, label, code').order('label');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => ({ id: r.id, label: r.code ? `${r.label} (${r.code})` : r.label }));
    },
    staleTime: 60_000,
  });
}

export interface FormTemplateOption {
  id: string;
  name: string;
  latest_published_version: number | null;
}

export function useFormTemplateOptions() {
  return useQuery({
    queryKey: [...KEY, 'lookup', 'form_templates'],
    queryFn: async (): Promise<FormTemplateOption[]> => {
      const { data: templates, error } = await db().from('form_templates')
        .select('id, name').order('name');
      if (error) throw new Error(error.message);
      const { data: versions, error: vErr } = await db().from('form_versions')
        .select('template_id, version, status').eq('status', 'published');
      if (vErr) throw new Error(vErr.message);
      const latest = new Map<string, number>();
      for (const v of versions ?? []) {
        const cur = latest.get(v.template_id);
        if (!cur || v.version > cur) latest.set(v.template_id, v.version);
      }
      return (templates ?? []).map((t: any) => ({
        id: t.id, name: t.name, latest_published_version: latest.get(t.id) ?? null,
      }));
    },
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Return definition forms                                             */
/* ------------------------------------------------------------------ */

export interface DefinitionFormRow {
  id: string;
  return_definition_id: string;
  form_template_id: string;
  sequence: number;
  is_required: boolean;
  section_label: string | null;
  tab_name: string | null;
}

export function useDefinitionFormRows(definitionId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'definition-forms', definitionId],
    enabled: !!definitionId,
    queryFn: async (): Promise<DefinitionFormRow[]> => {
      const { data, error } = await db().from('return_definition_forms')
        .select('*').eq('return_definition_id', definitionId).order('sequence');
      if (error) throw new Error(error.message);
      return (data ?? []) as DefinitionFormRow[];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Metric calculation rules (already read via useMetricCalculationRules  */
/* in useWaveC — re-exposed here filtered by metric for convenience)     */
/* ------------------------------------------------------------------ */

export interface CalcRule {
  id: string;
  regulatory_metric_id: string;
  version: number;
  expression: string;
  dependency_metric_codes: string[];
  on_missing_dependency: 'ERROR' | 'NOT_AVAILABLE';
  is_active: boolean;
}

export function useMetricCalcRule(metricId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'metric-calc-rule', metricId],
    enabled: !!metricId,
    queryFn: async (): Promise<CalcRule | null> => {
      const { data, error } = await db().from('metric_calculation_rules')
        .select('*').eq('regulatory_metric_id', metricId).eq('is_active', true)
        .order('version', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as CalcRule | null;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Obligation rule test result                                         */
/* ------------------------------------------------------------------ */

export interface ObligationTestReason { dimension: string; pass: boolean; detail: string; }

export interface ObligationTestResult {
  matches: boolean;
  entity_id: string;
  entity_name: string | null;
  rule_code: string;
  rule_name: string;
  priority: number;
  definition_code: string;
  definition_name: string;
  frequency: string;
  frequency_source: 'RULE_OVERRIDE' | 'DEFINITION';
  due_days_after_period_end: number;
  due_days_source: 'RULE_OVERRIDE' | 'DEFINITION';
  example_period_end: string;
  example_due_date: string;
  already_obliged: boolean;
  reasons: ObligationTestReason[];
}

/* ------------------------------------------------------------------ */
/* Mutations — every write is a governed RPC                           */
/* ------------------------------------------------------------------ */

export function useWaveCConfigMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['wave-c'] });
  };

  return {
    setDefinitionStatus: useMutation({
      mutationFn: (v: { definitionId: string; status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED' }) =>
        rpc<{ id: string; status: string }>('returns_set_definition_status', {
          _definition_id: v.definitionId, _status: v.status,
        }),
      onSuccess: invalidate,
    }),
    saveDefinitionForm: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        rpc<string>('returns_save_definition_form', { _payload: payload }),
      onSuccess: invalidate,
    }),
    deleteDefinitionForm: useMutation({
      mutationFn: (id: string) => rpc<void>('returns_delete_definition_form', { _id: id }),
      onSuccess: invalidate,
    }),
    testObligationRule: useMutation({
      mutationFn: (v: { ruleId: string; entityId: string }) =>
        rpc<ObligationTestResult>('returns_test_obligation_rule', {
          _rule_id: v.ruleId, _entity_id: v.entityId,
        }),
    }),
  };
}
