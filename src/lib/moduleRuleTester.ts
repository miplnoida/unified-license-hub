import { supabase } from '@/integrations/supabase/client';

/**
 * Specialised (module-specific) rule testers — ADM-RE-003.
 *
 * Each of the eight module-owned families is tested in its own context using
 * that module's own rule row, never forced through the shared-engine evaluator.
 * Every run is a dry run: the backend RPC `rule_module_test` reads production
 * configuration, writes one immutable row into `module_rule_tests`, and creates
 * no alerts, tasks, notifications, escalations, RFIs or workflow records.
 */

export type ModuleFamily =
  | 'return_validation' | 'prudential' | 'conduct' | 'complaint_triage'
  | 'sufficiency' | 'rfi_auto' | 'correspondence' | 'escalation';

export type FieldType = 'text' | 'number' | 'boolean' | 'json' | 'date';

export interface FieldSpec {
  /** Dotted path written into the RPC input payload, e.g. `facts.attachments`. */
  path: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  /** false = recorded as context only, not evaluated by the rule. */
  evaluated?: boolean;
}

export interface FamilySpec {
  family: ModuleFamily;
  label: string;
  blurb: string;
  runtimeOwner: string;
  fields: FieldSpec[];
}

export const MODULE_TESTER_SPECS: Record<ModuleFamily, FamilySpec> = {
  return_validation: {
    family: 'return_validation',
    label: 'Return Validation Tester',
    blurb:
      'Evaluates the rule’s referenced fields against sample values and reports the field-level result, '
      + 'severity and the exact message the filer would see. Nothing is submitted.',
    runtimeOwner: 'evaluate_return_validations()',
    fields: [
      { path: 'form_id', label: 'Form', type: 'text', placeholder: 'form id or name', evaluated: false },
      { path: 'form_version', label: 'Form version', type: 'text', placeholder: 'e.g. 3', evaluated: false },
      { path: 'period', label: 'Return period', type: 'text', placeholder: 'e.g. 2025-Q2', evaluated: false },
      {
        path: 'values', label: 'Sample field values', type: 'json', evaluated: true,
        placeholder: '{"total_assets": 1200, "total_liabilities": 900}',
        help: 'Keys must match the field references stored on the rule.',
      },
      { path: 'operator', label: 'Comparison operator', type: 'text', placeholder: 'is_present, >=, <=, =, contains', evaluated: true },
      { path: 'expected', label: 'Expected value', type: 'json', placeholder: '0', evaluated: true },
    ],
  },
  prudential: {
    family: 'prudential',
    label: 'Prudential Threshold Tester',
    blurb:
      'Compares an actual ratio against the rule’s warning and breach thresholds and previews the breach '
      + 'record, assessment flag and notification that the monitoring sweep would raise.',
    runtimeOwner: 'prudential-monitoring-sweep',
    fields: [
      { path: 'entity', label: 'Entity', type: 'text', placeholder: 'licensee name or id', evaluated: false },
      { path: 'return_id', label: 'Return', type: 'text', placeholder: 'return filed id', evaluated: false },
      { path: 'period', label: 'Period', type: 'text', placeholder: 'e.g. 2025-Q2', evaluated: false },
      { path: 'actual', label: 'Actual metric value', type: 'number', placeholder: 'e.g. 0.065', evaluated: true },
    ],
  },
  conduct: {
    family: 'conduct',
    label: 'Conduct Monitoring Tester',
    blurb:
      'Evaluates the rule’s monitored metric over its own window and previews the conduct alert and risk '
      + 'delta the 15-minute sweep would produce.',
    runtimeOwner: 'evaluate-conduct-monitoring',
    fields: [
      { path: 'entity', label: 'Entity', type: 'text', placeholder: 'licensee name or id', evaluated: false },
      { path: 'period', label: 'Period', type: 'text', placeholder: 'e.g. 2025-06', evaluated: false },
      {
        path: 'metrics', label: 'Indicator values', type: 'json', evaluated: true,
        placeholder: '{"open_complaints_rolling": 7}',
        help: 'Key must match the metric named in the rule definition.',
      },
      { path: 'actual', label: 'Fallback metric value', type: 'number', placeholder: 'used when no keyed metric matches', evaluated: true },
    ],
  },
  complaint_triage: {
    family: 'complaint_triage',
    label: 'Complaint Triage Tester',
    blurb:
      'Checks a sample complaint against the variant’s intake requirements and previews classification, '
      + 'SLA application, workflow start and notification in action order. No complaint is created.',
    runtimeOwner: 'classify_complaint()',
    fields: [
      {
        path: 'facts', label: 'Complaint facts', type: 'json', evaluated: true,
        placeholder: '{"complainant_name":"A. Brown","subject":"Fees","attachments":2,"anonymous":false}',
        help: 'Keys must match the variant’s required fields; `anonymous` and `attachments` are checked against the rule.',
      },
      { path: 'category', label: 'Category', type: 'text', evaluated: false },
      { path: 'channel', label: 'Channel', type: 'text', placeholder: 'portal, email, phone', evaluated: false },
      { path: 'urgency', label: 'Urgency', type: 'text', placeholder: 'low, medium, high', evaluated: false },
      { path: 'vulnerability', label: 'Vulnerability indicated', type: 'boolean', evaluated: false },
    ],
  },
  sufficiency: {
    family: 'sufficiency',
    label: 'Sufficiency Tester',
    blurb:
      'Evaluates the sufficiency rule against a sample application and reports the missing information and '
      + 'the RFI the officer would be offered. No RFI is created.',
    runtimeOwner: 'evaluate-application-sufficiency',
    fields: [
      { path: 'application', label: 'Application', type: 'text', placeholder: 'APP-2026-000123', evaluated: false },
      {
        path: 'facts', label: 'Application facts / document inventory', type: 'json', evaluated: true,
        placeholder: '{"business_plan":"", "documents_count":3}',
      },
      { path: 'actual', label: 'Fallback value', type: 'text', evaluated: true },
    ],
  },
  rfi_auto: {
    family: 'rfi_auto',
    label: 'RFI Auto Rule Tester',
    blurb:
      'Evaluates the auto-RFI condition and shows the suggested question plus the duplicate check against '
      + 'open RFI items. Suggestions only — officer confirmation creates the real RFI.',
    runtimeOwner: 'application RFI suggestion path (officer-confirmed)',
    fields: [
      { path: 'application', label: 'Application', type: 'text', placeholder: 'APP-2026-000123', evaluated: false },
      {
        path: 'facts', label: 'Application facts', type: 'json', evaluated: true,
        placeholder: '{"audited_accounts":"", "open_item_exists": false}',
        help: '`open_item_exists: true` proves the duplicate suppression path.',
      },
      { path: 'actual', label: 'Fallback value', type: 'text', evaluated: true },
    ],
  },
  correspondence: {
    family: 'correspondence',
    label: 'Correspondence Routing Tester',
    blurb:
      'Matches a sample inbound message against this routing rule and previews the destination unit, owner, '
      + 'priority and SLA. Nothing is routed or assigned.',
    runtimeOwner: 'classify_correspondence()',
    fields: [
      { path: 'direction', label: 'Direction', type: 'text', placeholder: 'inbound / outbound', evaluated: false },
      { path: 'thread_type', label: 'Thread type', type: 'text', evaluated: false },
      { path: 'source_record', label: 'Source record', type: 'text', evaluated: false },
      {
        path: 'message', label: 'Message attributes', type: 'json', evaluated: true,
        placeholder: '{"sender":"ops@bank.com","subject":"Licence query","body":"..."}',
        help: 'The key matching the rule’s match type is the one compared.',
      },
    ],
  },
  escalation: {
    family: 'escalation',
    label: 'Escalation Rule Tester',
    blurb:
      'Evaluates elapsed time and acknowledgement against the rule’s tier thresholds and previews the next '
      + 'tier, recipients, channels and task/case creation. No escalation is raised.',
    runtimeOwner: 'escalation_sweep()',
    fields: [
      { path: 'source_record', label: 'Source record', type: 'text', evaluated: false },
      { path: 'tier', label: 'Current tier', type: 'number', placeholder: '0, 1, 2, 3', evaluated: false },
      {
        path: 'elapsed_minutes', label: 'Elapsed minutes', type: 'number', evaluated: true,
        help: 'Use business minutes when the rule is business-hours only.',
      },
      { path: 'acknowledged', label: 'Acknowledged', type: 'boolean', evaluated: true },
    ],
  },
};

export const MODULE_FAMILIES = Object.keys(MODULE_TESTER_SPECS) as ModuleFamily[];

export function isModuleFamily(v: string | undefined | null): v is ModuleFamily {
  return !!v && (MODULE_FAMILIES as string[]).includes(v);
}

export interface ModuleCondition {
  label: string;
  metric: string | null;
  actual: unknown;
  operator: string;
  expected: unknown;
  passed: boolean | null;
  reason: string | null;
}

export interface ModuleTestResult {
  family: ModuleFamily;
  rule_id: string;
  rule_code: string;
  rule_name: string | null;
  mode: string;
  inputs: Record<string, unknown>;
  conditions: ModuleCondition[];
  matched: boolean;
  expected_actions: Record<string, unknown>[];
  notes: string | null;
  correlation_id: string;
  duration_ms: number;
  side_effects: string;
}

/** Writes `value` into `target` at a dotted path, skipping blank input. */
export function assignPath(target: Record<string, any>, path: string, value: unknown): void {
  if (value === '' || value === null || value === undefined) return;
  const parts = path.split('.');
  let node = target;
  for (const p of parts.slice(0, -1)) {
    if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
    node = node[p];
  }
  node[parts[parts.length - 1]] = value;
}

/** Coerces one raw form value according to its field spec. Throws on bad JSON. */
export function coerceField(spec: FieldSpec, raw: string | boolean): unknown {
  if (spec.type === 'boolean') return raw === true || raw === 'true';
  const text = typeof raw === 'string' ? raw.trim() : raw;
  if (text === '' ) return '';
  if (spec.type === 'number') {
    const n = Number(text);
    if (!Number.isFinite(n)) throw new Error(`${spec.label} must be a number`);
    return n;
  }
  if (spec.type === 'json') {
    try {
      return JSON.parse(String(text));
    } catch {
      throw new Error(`${spec.label} must be valid JSON`);
    }
  }
  return text;
}

/** Builds the RPC payload from raw form state for a family. */
export function buildInputs(family: ModuleFamily, values: Record<string, string | boolean>): Record<string, unknown> {
  const spec = MODULE_TESTER_SPECS[family];
  const inputs: Record<string, unknown> = {};
  for (const f of spec.fields) {
    const raw = values[f.path];
    if (raw === undefined) continue;
    const coerced = coerceField(f, raw);
    if (f.type === 'boolean') assignPath(inputs, f.path, coerced);
    else assignPath(inputs, f.path, coerced);
  }
  return inputs;
}

export async function runModuleTest(
  family: ModuleFamily, ruleId: string, inputs: Record<string, unknown>,
): Promise<ModuleTestResult> {
  const { data, error } = await supabase.rpc('rule_module_test' as any, {
    _family: family, _rule_id: ruleId, _inputs: inputs as never,
  } as any);
  if (error) throw error;
  return data as unknown as ModuleTestResult;
}

export interface ModuleTestHistoryRow {
  id: string;
  family: string;
  rule_id: string;
  rule_code: string | null;
  inputs: Record<string, unknown>;
  output: ModuleTestResult;
  passed: boolean;
  matched: boolean | null;
  duration_ms: number | null;
  correlation_id: string;
  created_at: string;
}

export async function fetchModuleTestHistory(
  family: ModuleFamily, ruleId: string, limit = 20,
): Promise<ModuleTestHistoryRow[]> {
  const { data, error } = await supabase
    .from('module_rule_tests' as any)
    .select('*')
    .eq('family', family)
    .eq('rule_id', ruleId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as ModuleTestHistoryRow[]) || [];
}

/** Evidence export: flat CSV of every evaluated condition. */
export function moduleTestCsv(result: ModuleTestResult): string {
  const head = [
    'rule_code', 'family', 'condition', 'metric', 'actual', 'operator', 'expected',
    'passed', 'reason', 'matched', 'correlation_id', 'duration_ms',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const c of result.conditions || []) {
    lines.push([
      result.rule_code, result.family, c.label, c.metric, JSON.stringify(c.actual ?? null),
      c.operator, JSON.stringify(c.expected ?? null), c.passed, c.reason,
      result.matched, result.correlation_id, result.duration_ms,
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

export function moduleTestJson(result: ModuleTestResult): string {
  return JSON.stringify(result, null, 2);
}
