import { describe, it, expect } from 'vitest';
import { parseOverrides, testRunToCsv, testRunToJson, type RuleTestRunResult } from '@/lib/ruleTester';

const sampleRun: RuleTestRunResult = {
  ruleId: 'r1',
  ruleCode: 'RULE-000042',
  version: 3,
  mode: 'current_snapshot',
  ranAt: '2026-08-04T05:00:00.000Z',
  correlationId: 'c-1',
  durationMs: 42,
  evaluated: 4,
  matched: 1,
  unmatched: 3,
  passed: true,
  rows: [
    {
      entityKey: 'ent-a',
      entityLabel: 'FinCorp Commercial Bank Limited',
      matched: true,
      suppressed: false,
      suppressedUntil: null,
      reason: 'car 8 < 10',
      conditions: [
        { metric: 'car', operator: 'lt', expected: 10, actual: 8, passed: true, reason: 'car 8 < 10' },
      ],
      expectedActions: [{ index: 0, type: 'alert', summary: 'alert (high)' }],
      error: null,
    },
  ],
  error: null,
};

describe('ruleTester overrides parsing', () => {
  it('parses key=value metric overrides', () => {
    expect(parseOverrides('car=8\nnpl_ratio=12.5')).toEqual({ car: 8, npl_ratio: 12.5 });
  });

  it('accepts JSON override objects', () => {
    expect(parseOverrides('{"car": 8, "label": "x"}')).toEqual({ car: 8, label: 'x' });
  });

  it('ignores blank lines and malformed rows', () => {
    expect(parseOverrides('\n  \ncar=8\nnonsense\n')).toEqual({ car: 8 });
  });

  it('returns an empty object for empty input', () => {
    expect(parseOverrides('')).toEqual({});
    expect(parseOverrides('   ')).toEqual({});
  });
});

describe('ruleTester export', () => {
  it('exports a CSV row per condition with actual, operator and expected', () => {
    const csv = testRunToCsv(sampleRun);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Rule Code');
    expect(lines[0]).toContain('Actual');
    expect(lines[0]).toContain('Expected');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('RULE-000042');
    expect(lines[1]).toContain('ent-a');
    expect(lines[1]).toContain('car');
  });

  it('exports JSON carrying mode, version, correlation id and counts', () => {
    const parsed = JSON.parse(testRunToJson(sampleRun));
    expect(parsed.version).toBe(3);
    expect(parsed.mode).toBe('current_snapshot');
    expect(parsed.correlationId).toBe('c-1');
    expect(parsed.evaluated).toBe(4);
    expect(parsed.matched).toBe(1);
    expect(parsed.unmatched).toBe(3);
  });
});
