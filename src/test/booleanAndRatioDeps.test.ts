import { describe, it, expect } from 'vitest';
import { evaluateRule, type ValidationRule } from '@/lib/returnsValidation';
import { computeAllRatios, topologicallyOrderRatios, type PrudentialRatio } from '@/lib/returnsRatios';
import { evaluateBoolean, splitTopLevel, stripOuterParens, hasBooleanOperator } from '@/lib/booleanExpression';

const rule = (over: Partial<ValidationRule>): ValidationRule => ({
  id: 'r', return_config_id: 'c', form_id: 'formA', scope: 'field',
  rule_type: 'expression', name: 't', expression: '',
  severity: 'error', error_message: 'fail', field_refs: [], is_active: true,
  ...over,
});

const ratio = (over: Partial<PrudentialRatio>): PrudentialRatio => ({
  id: over.ratio_key ?? 'r', return_config_id: 'c', ratio_key: 'k', label: 'L',
  formula: '', display_format: 'decimal', metric_key: null, is_active: true,
  ...over,
});

describe('boolean expression utilities', () => {
  it('strips outer parens without breaking nested arithmetic', () => {
    expect(stripOuterParens('((a + b))')).toBe('a + b');
    expect(stripOuterParens('(a + b) * (c + d)')).toBe('(a + b) * (c + d)');
  });

  it('splits only at top-level operators', () => {
    expect(splitTopLevel('a > 1 AND b < 2', /\s+AND\s+/i)).toEqual(['a > 1', 'b < 2']);
    expect(splitTopLevel('(a > 1 OR c) AND b < 2', /\s+AND\s+/i)).toEqual(['(a > 1 OR c)', 'b < 2']);
  });

  it('detects boolean operators reliably', () => {
    expect(hasBooleanOperator('a > 1 AND b < 2')).toBe(true);
    expect(hasBooleanOperator('a > 1')).toBe(false);
    expect(hasBooleanOperator('a && b')).toBe(true);
  });

  it('respects AND precedence over OR', () => {
    // false OR (true AND true) => true
    const preds: Record<string, boolean> = { A: false, B: true, C: true };
    const result = evaluateBoolean('A OR B AND C', (p) => preds[p.trim()]);
    expect(result).toBe(true);
  });
});

describe('validation rules with AND/OR composition', () => {
  const data = { formA: { assets: '150', liabilities: '80', equity: '70' } };

  it('AND requires all predicates to pass', () => {
    const r = rule({ expression: 'assets > 100 AND liabilities < 100' });
    expect(evaluateRule(r, data).passed).toBe(true);
    const r2 = rule({ expression: 'assets > 100 AND liabilities < 50' });
    expect(evaluateRule(r2, data).passed).toBe(false);
  });

  it('OR passes when any predicate holds', () => {
    const r = rule({ expression: 'assets > 1000 OR liabilities < 100' });
    expect(evaluateRule(r, data).passed).toBe(true);
  });

  it('supports && and || operators', () => {
    const r = rule({ expression: 'assets > 100 && (liabilities < 100 || equity > 200)' });
    expect(evaluateRule(r, data).passed).toBe(true);
  });

  it('boolean composition works in required_if condition', () => {
    const r = rule({
      rule_type: 'required_if',
      expression: 'assets > 100 AND equity > 50 => notes',
      error_message: 'notes required',
    });
    // condition true, notes missing -> fails
    expect(evaluateRule(r, data).passed).toBe(false);
    // condition false -> passes without requiring notes
    const r2 = rule({
      rule_type: 'required_if',
      expression: 'assets > 100 AND equity > 500 => notes',
    });
    expect(evaluateRule(r2, data).passed).toBe(true);
  });
});

describe('ratio-of-ratio topological resolution', () => {
  it('orders ratios so dependencies compute first', () => {
    const rs = [
      ratio({ id: 'a', ratio_key: 'car_scaled', formula: '$car * 100' }),
      ratio({ id: 'b', ratio_key: 'car', formula: 'balance.capital / balance.rwa' }),
    ];
    const ordered = topologicallyOrderRatios(rs);
    expect(ordered.map((r) => r.ratio_key)).toEqual(['car', 'car_scaled']);
  });

  it('detects circular ratio dependencies', () => {
    const rs = [
      ratio({ id: 'a', ratio_key: 'a', formula: '$b + 1' }),
      ratio({ id: 'b', ratio_key: 'b', formula: '$a + 1' }),
    ];
    expect(() => topologicallyOrderRatios(rs)).toThrow(/Circular/i);
  });

  it('substitutes referenced ratio values into dependants', () => {
    const data = { balance: { capital: '80', rwa: '400' } };
    const rs = [
      // depends on $car and multiplies by 100
      ratio({ id: 'a', ratio_key: 'car_pct', formula: '$car * 100', display_format: 'percent' }),
      ratio({ id: 'b', ratio_key: 'car', formula: 'balance.capital / balance.rwa' }),
    ];
    const computed = computeAllRatios(rs, data);
    const carPct = computed.find((c) => c.ratio_key === 'car_pct');
    const car = computed.find((c) => c.ratio_key === 'car');
    expect(car?.value).toBeCloseTo(0.2, 5);
    expect(carPct?.value).toBeCloseTo(20, 5);
  });

  it('surfaces circular dependency error in results without throwing', () => {
    const rs = [
      ratio({ id: 'a', ratio_key: 'a', formula: '$b + 1' }),
      ratio({ id: 'b', ratio_key: 'b', formula: '$a + 1' }),
    ];
    const results = computeAllRatios(rs, {});
    expect(results.every((r) => r.value === null)).toBe(true);
    expect(results.every((r) => (r.error || '').match(/Circular/i))).toBeTruthy();
  });
});
