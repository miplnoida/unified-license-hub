import { describe, it, expect } from 'vitest';
import { evaluateRule, evaluateRules, type ValidationRule } from '@/lib/returnsValidation';

const baseRule = (over: Partial<ValidationRule>): ValidationRule => ({
  id: 'r', return_config_id: 'c', form_id: 'formA', scope: 'field',
  rule_type: 'comparison', name: 't', expression: '',
  severity: 'error', error_message: 'fail', field_refs: [], is_active: true,
  ...over,
});

describe('returns validation evaluator', () => {
  const data = { formA: { total_assets: '150', current_assets: '50', fixed_assets: '100', name: 'x' } };

  it('passes a satisfied comparison', () => {
    const r = baseRule({ expression: 'total_assets == current_assets + fixed_assets' });
    expect(evaluateRule(r, data).passed).toBe(true);
  });

  it('fails an unsatisfied comparison with error severity', () => {
    const r = baseRule({ expression: 'total_assets >= 500' });
    const res = evaluateRule(r, data);
    expect(res.passed).toBe(false);
    expect(res.severity).toBe('error');
  });

  it('cross-form reference resolves via formId.fieldKey', () => {
    const cross = { formA: { a: '10' }, formB: { b: '20' } };
    const r = baseRule({ scope: 'cross_form', form_id: null, expression: 'formA.a + formB.b >= 30' });
    expect(evaluateRule(r, cross).passed).toBe(true);
  });

  it('required_if triggers only when condition truthy', () => {
    const r = baseRule({ rule_type: 'required_if', expression: 'total_assets > 100 => name' });
    expect(evaluateRule(r, data).passed).toBe(true);
    const missing = { formA: { total_assets: '150' } };
    expect(evaluateRule(r, missing).passed).toBe(false);
  });

  it('pattern matches regex', () => {
    const emailRule = baseRule({ rule_type: 'pattern', expression: 'name =~ /^[a-z]+$/i' });
    expect(evaluateRule(emailRule, data).passed).toBe(true);
  });

  it('summary splits errors and warnings', () => {
    const rules = [
      baseRule({ id: '1', expression: 'total_assets >= 500', severity: 'error' }),
      baseRule({ id: '2', expression: 'total_assets >= 10000', severity: 'warning' }),
      baseRule({ id: '3', expression: 'total_assets == 150', severity: 'error' }),
    ];
    const s = evaluateRules(rules, data);
    expect(s.errors).toHaveLength(1);
    expect(s.warnings).toHaveLength(1);
    expect(s.passed).toBe(false);
  });
});
