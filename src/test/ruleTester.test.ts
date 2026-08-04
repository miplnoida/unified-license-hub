import { describe, it, expect } from 'vitest';
import { parseOverrides, overridesToText, testRunCsv, testRunJson, TEST_MODES, type TesterRunResult } from '@/lib/ruleTester';

const sampleRun: TesterRunResult = {
  ok: true,
  passed: true,
  test_id: 't-1',
  mode: 'current_snapshot',
  correlation_id: 'c-1',
  candidates: 4,
  matched: 1,
  unmatched: 3,
  duration_ms: 42,
  errors: [],
  results: [
    {
      rule_id: 'r1',
      rule_code: 'RULE-000042',
      rule_name: 'CAR floor',
      version: 3,
      effective_from: null,
      effective_to: null,
      executable_as_of: true,
      on_action_failure: 'continue',
      candidates: 4,
      matched: 1,
      unmatched: 3,
      error: null,
      preview: [
        {
          entity_id: null,
          entity_label: 'FinCorp Commercial Bank Limited',
          entity_key: 'ent-a',
          matched: true,
          metrics: { car: 8 },
          reason: 'car 8 < 10',
          conditions: [
            {
              index: 0,
              metric: 'car',
              operator: 'lt',
              operator_symbol: '<',
              expected: 10,
              actual: 8,
              passed: true,
              reason: 'car 8 < 10',
            },
          ],
          suppression: { suppressed: false, suppressed_until: null, expired: false },
          would_do: [{ type: 'alert', severity: 'high' }],
        },
      ],
    },
  ],
};

describe('rule tester modes', () => {
  it('offers the four FRD run modes', () => {
    expect(TEST_MODES.map((m) => m.value).sort()).toEqual(
      ['batch', 'current_snapshot', 'historical_replay', 'override'].sort(),
    );
  });
});

describe('rule tester metric overrides', () => {
  it('parses key=value overrides', () => {
    expect(parseOverrides('car=8\nnpl_ratio=12.5')).toEqual({ car: 8, npl_ratio: 12.5 });
  });

  it('accepts a JSON override object', () => {
    expect(parseOverrides('{"car": 8, "label": "x"}')).toEqual({ car: 8, label: 'x' });
  });

  it('ignores blank and malformed lines', () => {
    expect(parseOverrides('\n  \ncar=8\nnonsense\n')).toEqual({ car: 8 });
  });

  it('returns an empty object for empty input', () => {
    expect(parseOverrides('')).toEqual({});
    expect(parseOverrides('   ')).toEqual({});
  });

  it('round-trips overrides through text', () => {
    expect(parseOverrides(overridesToText({ car: 8, npl: 3 }))).toEqual({ car: 8, npl: 3 });
  });
});

describe('rule tester export', () => {
  it('writes one CSV row per condition with actual, operator and expected', () => {
    const lines = testRunCsv(sampleRun).trim().split('\n');
    expect(lines[0]).toContain('Rule Code');
    expect(lines[0]).toContain('Actual');
    expect(lines[0]).toContain('Expected');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('RULE-000042');
    expect(lines[1]).toContain('ent-a');
    expect(lines[1]).toContain('car');
    expect(lines[1]).toContain('current_snapshot');
  });

  it('writes JSON carrying mode, correlation id and counts', () => {
    const parsed = JSON.parse(testRunJson(sampleRun));
    expect(parsed.mode).toBe('current_snapshot');
    expect(parsed.correlation_id).toBe('c-1');
    expect(parsed.candidates).toBe(4);
    expect(parsed.matched).toBe(1);
    expect(parsed.unmatched).toBe(3);
    expect(parsed.results[0].version).toBe(3);
  });
});
