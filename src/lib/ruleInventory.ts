import { supabase } from '@/integrations/supabase/client';

/**
 * Unified rule inventory (ADM-RE-001 oversight layer).
 *
 * The `public.rule_inventory` view UNIONs the shared rule engine
 * (`engine_rules`) with every module-specific rule family. Module families keep
 * their own editors and runtime owners — the library is governance/oversight
 * only, which is expressed by the per-row `capabilities` flags.
 */
export interface RuleCapabilities {
  edit_central: boolean;
  module_editor: boolean;
  versions: boolean;
  test: boolean;
  activate: boolean;
  clone: boolean;
  executions: boolean;
  alerts: boolean;
  tasks: boolean;
  export: boolean;
}

export interface InventoryRule {
  rule_id: string;
  rule_code: string;
  name: string;
  description: string | null;
  family: string;
  family_label: string;
  module: string | null;
  sub_module: string | null;
  rule_type: string;
  severity: string | null;
  status: string;
  tags: string[];
  version: number | null;
  active_version: number | null;
  trigger_count: number | null;
  last_triggered_at: string | null;
  last_tested_at: string | null;
  last_modified_at: string | null;
  last_modified_by: string | null;
  modified_by_name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  runtime_owner: string | null;
  source_screen: string | null;
  capabilities: RuleCapabilities;
}

export interface RuleInventoryKpis {
  total: number;
  active: number;
  draft: number;
  inactive: number;
  never_executed: number;
  never_tested: number;
  stale_tests: number;
  failing: number;
  families: Record<string, number> | null;
}

export interface RuleInventoryFilters {
  search?: string;
  family?: string;
  module?: string;
  sub_module?: string;
  rule_type?: string;
  status?: string;
  severity?: string;
  tag?: string;
  triggered_from?: string | null;
  triggered_to?: string | null;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface RuleInventoryResult {
  rows: InventoryRule[];
  total: number;
  kpis: RuleInventoryKpis;
}

export const FAMILY_LABELS: Record<string, string> = {
  shared: 'Shared Rule Engine',
  prudential: 'Prudential Thresholds',
  conduct: 'Conduct Monitoring',
  complaint_triage: 'Complaint Triage',
  correspondence: 'Correspondence Routing',
  escalation: 'Escalation Rules',
  return_validation: 'Return Validation',
  sufficiency: 'Sufficiency Rules',
  rfi_auto: 'RFI Auto-Rules',
};

export async function searchRuleInventory(f: RuleInventoryFilters): Promise<RuleInventoryResult> {
  const { data, error } = await supabase.rpc('rule_inventory_search' as any, {
    _search: f.search?.trim() || null,
    _family: f.family && f.family !== 'all' ? f.family : null,
    _module: f.module && f.module !== 'all' ? f.module : null,
    _sub_module: f.sub_module && f.sub_module !== 'all' ? f.sub_module : null,
    _rule_type: f.rule_type && f.rule_type !== 'all' ? f.rule_type : null,
    _status: f.status && f.status !== 'all' ? f.status : null,
    _severity: f.severity && f.severity !== 'all' ? f.severity : null,
    _tag: f.tag && f.tag !== 'all' ? f.tag : null,
    _triggered_from: f.triggered_from || null,
    _triggered_to: f.triggered_to || null,
    _sort: f.sort || 'last_modified_at',
    _dir: f.dir || 'desc',
    _limit: f.limit ?? 50,
    _offset: f.offset ?? 0,
  } as any);
  if (error) throw error;
  const payload = (data as any) || {};
  return {
    rows: (payload.rows as InventoryRule[]) || [],
    total: Number(payload.total || 0),
    kpis: (payload.kpis as RuleInventoryKpis) || {
      total: 0, active: 0, draft: 0, inactive: 0,
      never_executed: 0, never_tested: 0, stale_tests: 0, failing: 0, families: null,
    },
  };
}

export function inventoryCsv(rows: InventoryRule[]): string {
  const head = [
    'Rule ID', 'Name', 'Family', 'Module', 'Sub-module', 'Type', 'Severity', 'Status',
    'Version', 'Trigger count', 'Last triggered', 'Last tested', 'Owner', 'Runtime owner',
    'Last modified by', 'Last modified at',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [
    r.rule_code, r.name, r.family_label, r.module, r.sub_module, r.rule_type, r.severity,
    r.status, r.version, r.trigger_count, r.last_triggered_at, r.last_tested_at,
    r.owner_name, r.runtime_owner, r.modified_by_name, r.last_modified_at,
  ].map(esc).join(','));
  return [head.map(esc).join(','), ...lines].join('\n');
}
