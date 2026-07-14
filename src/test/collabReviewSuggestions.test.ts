import { describe, it, expect } from 'vitest';

/**
 * Pure test of the suggestion-apply logic that mirrors accept_review_suggestion()
 * in Postgres. If either the SQL or this simulation drifts, update both.
 */
type Suggestion = {
  type: 'insert' | 'delete' | 'replace';
  selection_start: number | null;
  selection_end: number | null;
  original_text: string | null;
  suggested_text: string | null;
};

function apply(current: string, s: Suggestion): string {
  const c = current ?? '';
  if (s.type === 'insert') {
    if (s.selection_start == null || s.selection_start < 0 || s.selection_start > c.length)
      throw new Error('REVIEW_SUGGESTION_STALE');
    return c.slice(0, s.selection_start) + (s.suggested_text ?? '') + c.slice(s.selection_start);
  }
  if (s.selection_start == null || s.selection_end == null
      || s.selection_start < 0 || s.selection_end > c.length
      || s.selection_end < s.selection_start)
    throw new Error('REVIEW_SUGGESTION_STALE');
  const slice = c.slice(s.selection_start, s.selection_end);
  if (s.original_text != null && slice !== s.original_text)
    throw new Error('REVIEW_SUGGESTION_STALE');
  if (s.type === 'delete') return c.slice(0, s.selection_start) + c.slice(s.selection_end);
  return c.slice(0, s.selection_start) + (s.suggested_text ?? '') + c.slice(s.selection_end);
}

describe('suggestion apply', () => {
  const base = 'The quick brown fox';
  it('inserts at position', () => {
    expect(apply(base, { type: 'insert', selection_start: 4, selection_end: null, original_text: null, suggested_text: 'very ' }))
      .toBe('The very quick brown fox');
  });
  it('deletes a range', () => {
    expect(apply(base, { type: 'delete', selection_start: 4, selection_end: 10, original_text: 'quick ', suggested_text: null }))
      .toBe('The brown fox');
  });
  it('replaces a range', () => {
    expect(apply(base, { type: 'replace', selection_start: 16, selection_end: 19, original_text: 'fox', suggested_text: 'dog' }))
      .toBe('The quick brown dog');
  });
  it('rejects stale suggestions when text changed', () => {
    expect(() => apply('The slow brown fox', { type: 'replace', selection_start: 4, selection_end: 9, original_text: 'quick', suggested_text: 'fast' }))
      .toThrow(/REVIEW_SUGGESTION_STALE/);
  });
  it('rejects out-of-range indexes', () => {
    expect(() => apply(base, { type: 'delete', selection_start: 100, selection_end: 200, original_text: null, suggested_text: null }))
      .toThrow(/REVIEW_SUGGESTION_STALE/);
  });
});
