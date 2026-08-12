import { describe, expect, it } from 'vitest';
import { resolveDecisionRationale } from '@/lib/licensing/decisionRationale';

describe('decision rationale resolution', () => {
  it('uses the canonical application rationale when present', () => {
    expect(resolveDecisionRationale('  Board determination  ', [
      { action_type: 'reject', comments: 'Older rejection remark' },
    ])).toBe('Board determination');
  });

  it('restores the latest historical final decision rationale', () => {
    expect(resolveDecisionRationale(null, [
      { action_type: 'save_comment', comments: 'Draft note' },
      { action: 'reject', action_type: 'reject', comments: ' Rejected for incomplete evidence ' },
    ])).toBe('Rejected for incomplete evidence');
  });

  it('does not use ordinary workflow comments as rationale', () => {
    expect(resolveDecisionRationale('', [
      { action_type: 'save_comment', comments: 'Internal review note' },
    ])).toBe('');
  });
});