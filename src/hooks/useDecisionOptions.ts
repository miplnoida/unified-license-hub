import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DecisionOption {
  id: string;
  code: string;
  label: string;
  outcome:
    | 'approve'
    | 'reject'
    | 'return'
    | 'defer'
    | 'conditional_approve'
    | 'withdraw'
    | 'escalate'
    | 'info_request';
  color: string;
  icon: string | null;
  requires_conditions: boolean;
  requires_reason: boolean;
  min_reason_length: number;
  rationale_template_id: string | null;
  applies_to: Record<string, any>;
  sort_order: number;
  is_active: boolean;
}

export interface DecisionRationaleTemplate {
  id: string;
  code: string;
  name: string;
  outcome: string | null;
  body: string;
  variables: unknown;
}

export interface DecisionContext {
  application_type?: string | null;
  license_type?: string | null;
  sector_id?: string | null;
  status?: string | null;
  workflow_step?: string | null;
}

const DEFAULT_OPTIONS: DecisionOption[] = [
  {
    id: 'default-approve',
    code: 'approve',
    label: 'Approve',
    outcome: 'approve',
    color: 'default',
    icon: null,
    requires_conditions: false,
    requires_reason: true,
    min_reason_length: 3,
    rationale_template_id: null,
    applies_to: {},
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'default-reject',
    code: 'reject',
    label: 'Reject',
    outcome: 'reject',
    color: 'destructive',
    icon: null,
    requires_conditions: false,
    requires_reason: true,
    min_reason_length: 10,
    rationale_template_id: null,
    applies_to: {},
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'default-return',
    code: 'return',
    label: 'Request Resubmission',
    outcome: 'return',
    color: 'outline',
    icon: null,
    requires_conditions: false,
    requires_reason: true,
    min_reason_length: 10,
    rationale_template_id: null,
    applies_to: {},
    sort_order: 30,
    is_active: true,
  },
];

/**
 * Loads active decision_options filtered by `applies_to` against the given
 * application context. When no option matches, returns the built-in
 * Approve / Reject / Return defaults so the UI is never empty.
 */
export function useDecisionOptions(context: DecisionContext) {
  const query = useQuery({
    queryKey: ['decision_options', context],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decision_options' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as any[]) as DecisionOption[];
    },
  });

  const all = query.data ?? [];
  const matched = all.filter((opt) => appliesTo(opt.applies_to, context));
  const options = matched.length ? matched : all.length === 0 ? DEFAULT_OPTIONS : all;

  return { ...query, options, isFallback: matched.length === 0 };
}

function appliesTo(rule: Record<string, any> | null | undefined, ctx: DecisionContext): boolean {
  if (!rule || Object.keys(rule).length === 0) return true;
  const check = (key: keyof DecisionContext, ruleKey?: string) => {
    const k = ruleKey ?? key;
    if (rule[k] === undefined || rule[k] === null) return true;
    const target = ctx[key];
    if (Array.isArray(rule[k])) return target != null && rule[k].includes(target);
    return rule[k] === target;
  };
  return (
    check('application_type') &&
    check('license_type') &&
    check('sector_id') &&
    check('status') &&
    check('workflow_step')
  );
}

export async function fetchRationaleTemplate(id: string | null | undefined) {
  if (!id) return null;
  const { data } = await supabase
    .from('decision_rationale_templates' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data as any) as DecisionRationaleTemplate | null;
}

/** Substitute `{{key}}` tokens with values from `vars`. */
export function renderRationaleTemplate(body: string, vars: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const val = key.split('.').reduce((acc: any, k: string) => (acc == null ? acc : acc[k]), vars);
    return val == null ? '' : String(val);
  });
}
