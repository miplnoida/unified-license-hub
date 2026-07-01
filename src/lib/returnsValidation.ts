// Return validation evaluator.
// Rules come from public.return_validation_rules (loaded server-side via
// evaluate_return_validations RPC). Client mirror evaluates the same rules
// for immediate UX feedback; the edge function is authoritative at submit.

import { safeEvaluate } from '@/lib/safeEval';
import { evaluateBoolean, hasBooleanOperator } from '@/lib/booleanExpression';

function safeEval(expr: string): number {
  const { value, error } = safeEvaluate(expr);
  if (error) throw new Error(error);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Non-numeric expression');
  return n;
}

export type RuleSeverity = 'error' | 'warning';
export type RuleType = 'range' | 'comparison' | 'pattern' | 'expression' | 'required_if';
export type RuleScope = 'field' | 'cross_field' | 'cross_form';

export interface ValidationRule {
  id: string;
  return_config_id: string;
  form_id: string | null;
  scope: RuleScope;
  rule_type: RuleType;
  name: string;
  expression: string;
  severity: RuleSeverity;
  error_message: string;
  field_refs: Array<{ form_id?: string; field_key: string; label?: string }>;
  is_active: boolean;
}

export interface ValidationResult {
  rule_id: string;
  rule_name: string;
  severity: RuleSeverity;
  passed: boolean;
  message: string;
  field_refs: ValidationRule['field_refs'];
}

/**
 * Form data is keyed by formTemplateId -> { fieldKey: value }.
 * Rule expressions reference fields as `formId.fieldKey` or `fieldKey`
 * (bare keys resolve against `rule.form_id`).
 */
export type ReturnFormData = Record<string, Record<string, any>>;

const OPS = ['<=', '>=', '==', '!=', '<', '>'] as const;
type CmpOp = (typeof OPS)[number];

function resolveTokens(
  expr: string,
  data: ReturnFormData,
  defaultFormId: string | null,
): string {
  // Replace `formId.fieldKey` and bare `fieldKey` (when defaultFormId set)
  // with their numeric string value, or empty string when missing.
  // Only [A-Za-z0-9_-]+ tokens are considered.
  return expr.replace(/([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?/g, (match, a: string, b?: string) => {
    // Skip pure numbers
    if (/^\d+(\.\d+)?$/.test(match)) return match;
    let fid: string | null;
    let key: string;
    if (b) { fid = a; key = b; } else { fid = defaultFormId; key = a; }
    if (!fid) return match; // leave unresolved — will throw during eval
    const v = data[fid]?.[key];
    if (v === undefined || v === null || v === '') return '0';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '0';
  });
}

function evalArith(expr: string, data: ReturnFormData, defaultFormId: string | null): number {
  const resolved = resolveTokens(expr, data, defaultFormId);
  return safeEval(resolved);
}

function splitComparison(expr: string): { lhs: string; op: CmpOp; rhs: string } | null {
  for (const op of OPS) {
    const idx = expr.indexOf(op);
    if (idx > 0) return { lhs: expr.slice(0, idx), op, rhs: expr.slice(idx + op.length) };
  }
  return null;
}

export function evaluateRule(rule: ValidationRule, data: ReturnFormData): ValidationResult {
  const defaultFormId = rule.form_id;
  const fail = (message: string): ValidationResult => ({
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    passed: false,
    message,
    field_refs: rule.field_refs || [],
  });
  const pass = (): ValidationResult => ({
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    passed: true,
    message: '',
    field_refs: rule.field_refs || [],
  });

  try {
    switch (rule.rule_type) {
      case 'pattern': {
        // expression format: fieldKey =~ /regex/flags
        const m = rule.expression.match(/^\s*([A-Za-z0-9_.-]+)\s*=~\s*\/(.+)\/([a-z]*)\s*$/);
        if (!m) return fail(rule.error_message || 'Invalid pattern expression');
        const [, token, pattern, flags] = m;
        const raw = String(getRaw(token, data, defaultFormId) ?? '');
        return new RegExp(pattern, flags).test(raw) ? pass() : fail(rule.error_message);
      }
      case 'required_if': {
        // expression format: <condition> => <fieldKey>
        // if condition evaluates truthy, fieldKey must be non-empty.
        const [cond, target] = rule.expression.split('=>').map((s) => s.trim());
        if (!cond || !target) return fail(rule.error_message || 'Invalid required_if');
        const condTrue = evalBooleanPredicate(cond, data, defaultFormId);
        if (!condTrue) return pass();
        const val = getRaw(target, data, defaultFormId);
        return val === undefined || val === null || val === '' ? fail(rule.error_message) : pass();
      }
      case 'range':
      case 'comparison':
      case 'expression': {
        return evalBooleanPredicate(rule.expression, data, defaultFormId)
          ? pass()
          : fail(rule.error_message);
      }
      default:
        return fail(`Unknown rule_type: ${rule.rule_type}`);
    }
  } catch (e) {
    return fail(rule.error_message || (e instanceof Error ? e.message : 'Evaluation error'));
  }
}

function getRaw(token: string, data: ReturnFormData, defaultFormId: string | null): unknown {
  const [a, b] = token.split('.');
  const fid = b ? a : defaultFormId;
  const key = b ?? a;
  if (!fid) return undefined;
  return data[fid]?.[key];
}

function compare(l: number, op: CmpOp, r: number): boolean {
  switch (op) {
    case '==': return l === r;
    case '!=': return l !== r;
    case '<': return l < r;
    case '<=': return l <= r;
    case '>': return l > r;
    case '>=': return l >= r;
  }
}

export interface EvaluationSummary {
  results: ValidationResult[];
  errors: ValidationResult[];
  warnings: ValidationResult[];
  passed: boolean;
}

export function evaluateRules(rules: ValidationRule[], data: ReturnFormData): EvaluationSummary {
  const results = rules.filter((r) => r.is_active).map((r) => evaluateRule(r, data));
  const errors = results.filter((r) => !r.passed && r.severity === 'error');
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning');
  return { results, errors, warnings, passed: errors.length === 0 };
}
