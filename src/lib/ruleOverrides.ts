import { supabase } from '@/integrations/supabase/client';

/**
 * Modules recognised by the universal Rule Override framework.
 * Add a new key here when a new module needs to record overrides.
 * The value MUST match the label used on the corresponding admin surface
 * so filtering in /admin/overrides stays consistent.
 */
export const OVERRIDE_MODULES = [
  'licensing',
  'fit_and_proper',
  'prudential_returns',
  'complaints',
  'enforcement',
  'supervisory_plans',
  'ai_assessments',
  'rule_engine',
  'decision_records',
] as const;
export type OverrideModule = (typeof OVERRIDE_MODULES)[number] | string;

export interface RuleOverrideInput {
  module: OverrideModule;
  entity_type: string;
  entity_id: string;
  rule_key: string;
  original_value?: unknown;
  overridden_value?: unknown;
  reason: string;
  metadata?: Record<string, unknown> | null;
}

export interface RuleOverrideRow {
  id: string;
  module: string;
  entity_type: string;
  entity_id: string;
  rule_key: string;
  original_value: unknown;
  overridden_value: unknown;
  reason: string;
  user_id: string | null;
  user_role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Records a rule / recommendation override.
 *
 * Writes to `public.rule_overrides` and mirrors the event into
 * `public.audit_logs` (action = `RULE_OVERRIDE`) atomically via the
 * `log_rule_override` security-definer RPC.
 */
export async function logRuleOverride(input: RuleOverrideInput): Promise<string> {
  const reason = (input.reason ?? '').trim();
  if (reason.length < 10) {
    throw new Error('Override reason must be at least 10 characters.');
  }
  if (!input.module || !input.entity_type || !input.entity_id || !input.rule_key) {
    throw new Error('module, entity_type, entity_id and rule_key are required.');
  }
  const metadata = {
    ...(input.metadata ?? {}),
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    captured_at: new Date().toISOString(),
  } as Record<string, unknown>;

  const { data, error } = await supabase.rpc('log_rule_override' as any, {
    _module: input.module,
    _entity_type: input.entity_type,
    _entity_id: input.entity_id,
    _rule_key: input.rule_key,
    _original_value: (input.original_value ?? null) as any,
    _overridden_value: (input.overridden_value ?? null) as any,
    _reason: reason,
    _metadata: metadata as any,
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Overrides for a single entity — used by ChangeHistoryDrawer. */
export async function fetchOverridesForEntity(
  entity_type: string,
  entity_id: string,
): Promise<RuleOverrideRow[]> {
  const { data, error } = await (supabase as any)
    .from('rule_overrides')
    .select('*')
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RuleOverrideRow[];
}
