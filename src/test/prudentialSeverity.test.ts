import { describe, it, expect } from 'vitest';
import {
  normalizeSeverity,
  severityLabel,
  worstSeverity,
  isEscalatable,
} from '@/lib/prudentialSeverity';

describe('prudential breach severity', () => {
  it('normalises traffic-light and legacy tokens', () => {
    expect(normalizeSeverity('red')).toBe('breach');
    expect(normalizeSeverity('breach')).toBe('breach');
    expect(normalizeSeverity('critical')).toBe('breach');
    expect(normalizeSeverity('AMBER')).toBe('warn');
    expect(normalizeSeverity('warn')).toBe('warn');
    expect(normalizeSeverity('green')).toBe('ok');
    expect(normalizeSeverity(null)).toBe(null);
    expect(normalizeSeverity('nonsense')).toBe(null);
  });

  it('labels severities for supervisors instead of raw tokens', () => {
    expect(severityLabel('red')).toBe('Breach');
    expect(severityLabel('amber')).toBe('Warning');
    expect(severityLabel('green')).toBe('Within limits');
    expect(severityLabel(undefined)).toBe('—');
  });

  it('picks the worst severity in a mixed list', () => {
    expect(worstSeverity(['green', 'amber', 'red'])).toBe('breach');
    expect(worstSeverity(['green', 'warn'])).toBe('warn');
    expect(worstSeverity([null, undefined])).toBe(null);
  });

  it('only escalates breach-level severities', () => {
    expect(isEscalatable('red')).toBe(true);
    expect(isEscalatable('amber')).toBe(false);
  });
});
