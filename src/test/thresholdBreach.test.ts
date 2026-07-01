import { describe, it, expect } from 'vitest';

// Mirror of public.classify_ratio_risk for client-side unit coverage.
function classifyRisk(value: number | null, warn: number | null, breach: number | null, comparator: string): 'green' | 'amber' | 'red' {
  if (value == null) return 'green';
  if (comparator === '>=' || comparator === '>') {
    if (breach != null && value >= breach) return 'red';
    if (warn != null && value >= warn) return 'amber';
    return 'green';
  }
  if (comparator === '<=' || comparator === '<') {
    if (breach != null && value <= breach) return 'red';
    if (warn != null && value <= warn) return 'amber';
    return 'green';
  }
  return 'green';
}

describe('threshold breach risk classification', () => {
  it('classifies red when value meets or exceeds breach with >=', () => {
    expect(classifyRisk(15, 10, 12, '>=')).toBe('red');
    expect(classifyRisk(12, 10, 12, '>=')).toBe('red');
  });
  it('classifies amber when between warn and breach', () => {
    expect(classifyRisk(11, 10, 12, '>=')).toBe('amber');
  });
  it('classifies green when below warn', () => {
    expect(classifyRisk(9, 10, 12, '>=')).toBe('green');
  });
  it('handles <= comparator inversely', () => {
    expect(classifyRisk(5, 10, 6, '<=')).toBe('red');
    expect(classifyRisk(8, 10, 6, '<=')).toBe('amber');
    expect(classifyRisk(12, 10, 6, '<=')).toBe('green');
  });
  it('treats null value as green', () => {
    expect(classifyRisk(null, 10, 12, '>=')).toBe('green');
  });
});
