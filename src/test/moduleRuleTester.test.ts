import { describe, it, expect } from 'vitest';
import {
  MODULE_FAMILIES, MODULE_TESTER_SPECS, assignPath, buildInputs, coerceField,
  isModuleFamily, moduleTestCsv,
} from '@/lib/moduleRuleTester';

describe('specialised module testers', () => {
  it('covers exactly the eight module-owned families', () => {
    expect([...MODULE_FAMILIES].sort()).toEqual([
      'complaint_triage', 'conduct', 'correspondence', 'escalation',
      'prudential', 'return_validation', 'rfi_auto', 'sufficiency',
    ]);
    // The shared engine is tested by the shared tester, not a module tester.
    expect(isModuleFamily('shared_engine')).toBe(false);
  });

  it('names a runtime owner and at least one evaluated input per family', () => {
    for (const f of MODULE_FAMILIES) {
      const spec = MODULE_TESTER_SPECS[f];
      expect(spec.runtimeOwner.trim().length).toBeGreaterThan(0);
      expect(spec.blurb.trim().length).toBeGreaterThan(0);
      expect(spec.fields.some((x) => x.evaluated === true)).toBe(true);
    }
  });

  it('writes nested input paths and skips blanks', () => {
    const t: Record<string, any> = {};
    assignPath(t, 'facts.attachments', 2);
    assignPath(t, 'facts.anonymous', false);
    assignPath(t, 'period', '');
    expect(t).toEqual({ facts: { attachments: 2, anonymous: false } });
  });

  it('coerces numbers, booleans and JSON, and rejects bad input', () => {
    expect(coerceField({ path: 'a', label: 'A', type: 'number' }, '1.5')).toBe(1.5);
    expect(coerceField({ path: 'a', label: 'A', type: 'boolean' }, true)).toBe(true);
    expect(coerceField({ path: 'a', label: 'A', type: 'json' }, '{"x":1}')).toEqual({ x: 1 });
    expect(() => coerceField({ path: 'a', label: 'A', type: 'number' }, 'abc')).toThrow(/must be a number/);
    expect(() => coerceField({ path: 'a', label: 'A', type: 'json' }, '{oops')).toThrow(/valid JSON/);
  });

  it('builds an escalation payload the RPC can evaluate', () => {
    const inputs = buildInputs('escalation', {
      elapsed_minutes: '120', acknowledged: false, tier: '1', source_record: 'ESC-1',
    });
    expect(inputs).toEqual({
      elapsed_minutes: 120, acknowledged: false, tier: 1, source_record: 'ESC-1',
    });
  });

  it('exports one CSV row per evaluated condition', () => {
    const csv = moduleTestCsv({
      family: 'prudential', rule_id: 'r1', rule_code: 'PTH-CAR', rule_name: 'CAR',
      mode: 'dry_run', inputs: {}, matched: true, expected_actions: [], notes: null,
      correlation_id: 'c1', duration_ms: 3, side_effects: 'none',
      conditions: [
        { label: 'warning threshold', metric: 'car', actual: 0.06, operator: '>=', expected: 0.09, passed: true, reason: 'r' },
        { label: 'breach threshold', metric: 'car', actual: 0.06, operator: '>=', expected: 0.07, passed: true, reason: 'r' },
      ],
    } as any);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('rule_code,family,condition');
    expect(lines[1]).toContain('PTH-CAR');
  });
});
