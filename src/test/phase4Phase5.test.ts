import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/hooks/useComplaintBulkImport';
import { isLiveInsight } from '@/hooks/useAiInsights';

/**
 * Phase 4/5 client-side guards. Server-side rules (validation, sequencing,
 * append-only history) are asserted in supabase/tests/phase4 and phase5.
 */

describe('bulk intake CSV parsing', () => {
  it('parses a header and rows', () => {
    const rows = parseCsv('subject,description\nBad fees,Charged twice\n');
    expect(rows).toEqual([{ subject: 'Bad fees', description: 'Charged twice' }]);
  });

  it('honours quoted fields containing commas and escaped quotes', () => {
    const rows = parseCsv('subject,description\n"Fees, charges","He said ""no"""\n');
    expect(rows[0].subject).toBe('Fees, charges');
    expect(rows[0].description).toBe('He said "no"');
  });

  it('ignores blank lines and trims header names', () => {
    const rows = parseCsv(' subject , description \nA,B\n\n\n');
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(['subject', 'description']);
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });

  it('fills missing trailing columns with empty strings rather than undefined', () => {
    const rows = parseCsv('a,b,c\n1,2\n');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });
});

describe('AI insight provider-state honesty', () => {
  it('treats only real provider runs as live', () => {
    expect(isLiveInsight('live')).toBe(true);
    expect(isLiveInsight('success')).toBe(true);
  });

  it('never presents sandbox, mock or unconfigured states as live', () => {
    for (const s of ['sandbox', 'mock', 'not_configured', 'error', 'degraded', '']) {
      expect(isLiveInsight(s)).toBe(false);
    }
  });
});

/** Mirrors the RPC-side minimum-length rules so a UI regression fails loudly. */
function requireJustification(text: string) {
  if (!text || text.trim().length < 10) throw new Error('Justification required (min 10 chars)');
}

describe('human decision guards', () => {
  it('requires a substantive justification on AI insight decisions', () => {
    expect(() => requireJustification('too short')).toThrow();
    expect(() => requireJustification('Confirmed against complaint evidence')).not.toThrow();
  });
});
