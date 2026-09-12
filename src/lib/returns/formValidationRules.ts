/**
 * Client mirror of the governed `public.return_form_validation_rules`
 * evaluation performed by `public.returns_validate_filing`.
 *
 * The rule shape is deliberately declarative (one total field that must equal
 * the sum of other total fields, within a tolerance) so no field key is ever
 * hardcoded in a React component. The server remains authoritative at submit
 * time — this mirror exists purely for immediate, applicant-friendly feedback.
 */

export interface ReturnFormRule {
  id: string;
  form_template_id: string;
  rule_code: string;
  label: string;
  message_template: string;
  expression: string;
  lhs_field: string;
  rhs_fields: string[];
  tolerance: number;
  severity: 'ERROR' | 'WARNING';
  is_blocking: boolean;
  is_active: boolean;
}

export interface RuleEvaluation {
  rule: ReturnFormRule;
  lhs: number;
  rhs: number;
  difference: number;
  /** True when every referenced field is still blank — nothing to check yet. */
  empty: boolean;
  passed: boolean;
  message: string;
}

/** Numeric-safe parse: handles thousands separators, currency symbols, blanks, (negatives). */
export function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let text = String(raw).trim();
  if (text === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[^0-9.-]/g, '');
  if (text === '' || text === '-' || text === '.') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fillMessage(template: string, lhs: number, rhs: number, diff: number): string {
  return template
    .replace('{lhs}', formatAmount(lhs))
    .replace('{rhs}', formatAmount(rhs))
    .replace('{diff}', formatAmount(diff));
}

export function evaluateFormRule(rule: ReturnFormRule, data: Record<string, unknown>): RuleEvaluation {
  const lhsRaw = parseNumericValue(data?.[rule.lhs_field]);
  const rhsParts = rule.rhs_fields.map((f) => parseNumericValue(data?.[f]));
  const empty = lhsRaw === null && rhsParts.every((p) => p === null);
  const lhs = lhsRaw ?? 0;
  const rhs = rhsParts.reduce((sum, p) => sum + (p ?? 0), 0);
  const difference = Math.abs(lhs - rhs);
  const tolerance = Number.isFinite(rule.tolerance) ? rule.tolerance : 0.01;
  const passed = empty || difference <= tolerance;
  return {
    rule,
    lhs,
    rhs,
    difference,
    empty,
    passed,
    message: fillMessage(rule.message_template, lhs, rhs, difference),
  };
}

export function evaluateFormRules(
  rules: ReturnFormRule[],
  data: Record<string, unknown>,
): RuleEvaluation[] {
  return rules.filter((r) => r.is_active).map((r) => evaluateFormRule(r, data));
}

export function blockingFailures(evaluations: RuleEvaluation[]): RuleEvaluation[] {
  return evaluations.filter((e) => !e.passed && e.rule.is_blocking);
}
