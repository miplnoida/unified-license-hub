import { supabase } from '@/integrations/supabase/client';

/**
 * Shared Rule Tester client (ADM-RE-003).
 *
 * Every run is a dry run: the runner writes only an `engine_rule_tests` row and
 * its `RULE_TEST_RUN` audit row. No alerts, tasks, notifications, workflows,
 * risk rows or suppression records are created, and the rule's trigger counters
 * are untouched.
 */
export const TEST_MODES = [
  { value: 'current_snapshot', label: 'Current snapshot', blurb: 'Evaluate against the data as it stands right now.' },
  { value: 'historical_replay', label: 'Historical replay', blurb: 'Evaluate as at a chosen date, using the data available then.' },
  { value: 'batch', label: 'Batch test', blurb: 'Evaluate a larger sample of entities in one run.' },
  { value: 'override', label: 'Manual metric override', blurb: 'Supply metric values by hand to exercise the logic directly.' },
] as const;

export type TestMode = (typeof TEST_MODES)[number]['value'];

export type VersionTarget = 'draft' | 'active' | number;

export interface TesterConditionResult {
  index: number;
  metric: string;
  operator: string;
  operator_symbol: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  reason: string;
}

export interface TesterSuppression {
  suppressed?: boolean;
  suppressed_until?: string | null;
  suppressed_count?: number;
  expired?: boolean;
  critical_bypass?: boolean;
  record_exists?: boolean;
  error?: string;
}

export interface TesterPreviewRow {
  entity_id: string | null;
  entity_label: string | null;
  entity_key: string;
  matched: boolean;
  metrics: Record<string, unknown>;
  reason: string;
  conditions: TesterConditionResult[];
  suppression: TesterSuppression | null;
  would_do: Record<string, unknown>[];
}

export interface TesterRuleResult {
  rule_id: string;
  rule_code: string;
  rule_name: string;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  executable_as_of: boolean;
  on_action_failure: string;
  candidates: number;
  matched: number;
  unmatched: number;
  error: string | null;
  preview: TesterPreviewRow[];
}

export interface TesterRunResult {
  ok: boolean;
  passed?: boolean;
  test_id?: string | null;
  mode: TestMode | string;
  correlation_id: string;
  candidates: number;
  matched: number;
  unmatched: number;
  duration_ms: number;
  errors: string[];
  results: TesterRuleResult[];
  error?: string;
}

export interface TesterRunParams {
  ruleId: string;
  mode: TestMode;
  version: VersionTarget;
  entityId?: string | null;
  asOf?: string | null;
  limit?: number;
  label?: string | null;
  overrides?: Record<string, unknown>;
}

export async function runRuleTest(p: TesterRunParams): Promise<TesterRunResult> {
  const { data, error } = await supabase.functions.invoke('evaluate-engine-rules', {
    body: {
      dry_run: true,
      rule_id: p.ruleId,
      mode: p.mode,
      version: p.version === 'draft' ? undefined : p.version,
      entity_id: p.entityId || null,
      as_of: p.asOf || null,
      limit: p.mode === 'batch' ? (p.limit ?? 100) : (p.limit ?? 25),
      label: p.label || null,
      overrides: p.overrides ?? {},
    },
  });
  if (error) throw error;
  return data as TesterRunResult;
}

/**
 * Parses manual metric overrides. Accepts either a JSON object
 * (`{"car": 8}`) or `metric_key=value` lines / comma-separated pairs.
 */
export function parseOverrides(text: string): Record<string, unknown> {
  const trimmed = (text || '').trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through to key=value parsing */
    }
  }
  const out: Record<string, unknown> = {};
  for (const line of trimmed.split(/[\n,]/)) {
    const [k, ...rest] = line.split('=');
    const key = (k || '').trim();
    if (!key || !rest.length) continue;
    const raw = rest.join('=').trim();
    const n = Number(raw);
    out[key] = raw !== '' && Number.isFinite(n) ? n : raw;
  }
  return out;
}


export function overridesToText(o: Record<string, unknown>): string {
  return Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join('\n');
}

/** Full test output as downloadable JSON (evidence export). */
export function testRunJson(result: TesterRunResult): string {
  return JSON.stringify(result, null, 2);
}

/** Flat CSV of the evaluated rows, one line per condition. */
export function testRunCsv(result: TesterRunResult): string {
  const head = [
    'Rule Code', 'Version', 'Mode', 'Correlation ID', 'Entity', 'Entity Key', 'Matched',
    'Condition', 'Metric', 'Actual', 'Operator', 'Expected', 'Condition Passed',
    'Suppressed', 'Suppressed Until', 'Reason',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [];
  for (const r of result.results || []) {
    for (const row of r.preview || []) {
      const conds = row.conditions?.length ? row.conditions : [null];
      for (const c of conds) {
        lines.push([
          r.rule_code, r.version, result.mode, result.correlation_id,
          row.entity_label, row.entity_key, row.matched,
          c ? c.index + 1 : '', c?.metric, c?.actual, c?.operator_symbol, c?.expected, c?.passed,
          row.suppression?.suppressed ?? false, row.suppression?.suppressed_until ?? '',
          c?.reason ?? row.reason,
        ].map(esc).join(','));
      }
    }
  }
  return [head.map(esc).join(','), ...lines].join('\n');
}

export function download(filename: string, content: string, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
