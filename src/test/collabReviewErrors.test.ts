import { describe, it, expect } from 'vitest';
import { humanizeReviewError, isReviewBlockedError } from '@/lib/reviewErrors';

describe('collab review error mapping', () => {
  it('maps stale suggestions to a user-friendly message', () => {
    expect(humanizeReviewError(new Error('REVIEW_SUGGESTION_STALE'))).toMatch(/older version/i);
  });
  it('maps blocking approvals with count', () => {
    expect(humanizeReviewError(new Error('REVIEW_BLOCKED:3')))
      .toBe('Approval blocked: 3 unresolved blocking review comment(s). Resolve them before proceeding.');
  });
  it('maps entity access denial', () => {
    expect(humanizeReviewError(new Error('REVIEW_FORBIDDEN_ENTITY'))).toMatch(/do not have access/i);
  });
  it('passes through unknown errors', () => {
    expect(humanizeReviewError(new Error('boom'))).toBe('boom');
  });
  it('detects blocked errors', () => {
    expect(isReviewBlockedError(new Error('REVIEW_BLOCKED:2'))).toBe(true);
    expect(isReviewBlockedError(new Error('unrelated'))).toBe(false);
  });
});
