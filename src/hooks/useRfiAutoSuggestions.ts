import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Phase 2.1b — Auto-sufficiency rule engine.
 *
 * Loads active RFI auto-rules that match the application's workflow type
 * (license_type) and/or its regulator's sector, evaluates each rule's
 * condition against the application's form data, and returns the suggested
 * RFI items the reviewer can one-click load into `RaiseRfiDialog`.
 *
 * Condition schema (JSONB):
 *   { field_path: "applicant.paid_up_capital",
 *     operator:   "lt" | "gt" | "eq" | "neq" | "missing" | "present" | "regex",
 *     value:      any }
 */

export interface RfiAutoRule {
  id: string;
  name: string;
  description: string | null;
  workflow_type_key: string | null;
  sector_id: string | null;
  condition: {
    field_path?: string;
    operator?: 'lt' | 'gt' | 'eq' | 'neq' | 'missing' | 'present' | 'regex';
    value?: unknown;
  };
  prompt_template: string;
  question_type: 'text' | 'document' | 'text_and_document';
  required: boolean;
  default_due_days: number;
}

export interface RfiSuggestion {
  ruleId: string;
  name: string;
  prompt: string;
  question_type: 'text' | 'document' | 'both';
  required: boolean;
  default_due_days: number;
}

function getPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluate(rule: RfiAutoRule, formData: unknown): boolean {
  const { field_path, operator, value } = rule.condition ?? {};
  if (!operator) return true; // no condition ⇒ always suggest
  const actual = field_path ? getPath(formData, field_path) : undefined;

  switch (operator) {
    case 'missing':
      return actual === undefined || actual === null || actual === '';
    case 'present':
      return actual !== undefined && actual !== null && actual !== '';
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'regex':
      try {
        return typeof actual === 'string' && new RegExp(String(value)).test(actual);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function interpolate(template: string, formData: unknown): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const v = getPath(formData, path);
    return v === undefined || v === null ? '' : String(v);
  });
}

const questionTypeMap = {
  text: 'text' as const,
  document: 'document' as const,
  text_and_document: 'both' as const,
};

export function useRfiAutoSuggestions(params: {
  applicationId: string | null;
  workflowTypeKey?: string | null;
  sectorId?: string | null;
  formData?: unknown;
}) {
  return useQuery({
    queryKey: [
      'rfi-auto-suggestions',
      params.applicationId,
      params.workflowTypeKey,
      params.sectorId,
    ],
    enabled: !!params.applicationId,
    queryFn: async (): Promise<RfiSuggestion[]> => {
      const query = supabase
        .from('application_rfi_auto_rules' as any)
        .select('*')
        .eq('active', true);

      // OR-filter: match rules that are unscoped OR match workflow_type_key
      // OR match sector. We fetch a superset and filter client-side to keep
      // the SQL simple.
      const { data, error } = await query;
      if (error) throw error;

      const rules = ((data ?? []) as unknown as RfiAutoRule[]).filter((r) => {
        const wfOk =
          !r.workflow_type_key ||
          (params.workflowTypeKey && r.workflow_type_key === params.workflowTypeKey);
        const sectorOk =
          !r.sector_id || (params.sectorId && r.sector_id === params.sectorId);
        return wfOk && sectorOk;
      });

      return rules
        .filter((r) => evaluate(r, params.formData))
        .map((r) => ({
          ruleId: r.id,
          name: r.name,
          prompt: interpolate(r.prompt_template, params.formData),
          question_type: questionTypeMap[r.question_type] ?? 'text',
          required: r.required,
          default_due_days: r.default_due_days,
        }));
    },
  });
}
