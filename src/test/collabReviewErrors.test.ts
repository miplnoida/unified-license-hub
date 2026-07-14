import { describe, it, expect } from 'vitest';

// Lightweight test of the frontend error-mapping table without full hook setup.
// Duplicated inline to avoid pulling React-Query into a unit test.
function humanError(msg: string): string {
  if (msg.includes('REVIEW_SUGGESTION_STALE'))
    return 'This suggestion is based on an older version of the narrative. Refresh and review it again.';
  if (msg.includes('REVIEW_BLOCKED:')) {
    const m = msg.match(/REVIEW_BLOCKED:(\d+)/);
    return `Approval cannot continue because ${m ? m[1] : ''} blocking comments are unresolved.`;
  }
  if (msg.includes('REVIEW_FORBIDDEN_ENTITY')) return 'You do not have access to this review.';
  if (msg.includes('REVIEW_FORBIDDEN_ACTION')) return 'You are not permitted to perform this action.';
  if (msg.includes('REVIEW_INVALID_ROLE')) return 'Selected role is not assigned to you.';
  if (msg.includes('REVIEW_UNKNOWN_FIELD')) return 'This narrative field is not configured for suggestions.';
  if (msg.includes('REVIEW_ALREADY_DECIDED')) return 'This suggestion has already been decided.';
  return msg;
}

describe('collab review error mapping', () => {
  it('maps stale suggestions to a user-friendly message', () => {
    expect(humanError('REVIEW_SUGGESTION_STALE')).toMatch(/older version/i);
  });
  it('maps blocking approvals with count', () => {
    expect(humanError('REVIEW_BLOCKED:3')).toBe('Approval cannot continue because 3 blocking comments are unresolved.');
  });
  it('maps entity access denial', () => {
    expect(humanError('REVIEW_FORBIDDEN_ENTITY')).toMatch(/do not have access/i);
  });
  it('passes through unknown errors', () => {
    expect(humanError('boom')).toBe('boom');
  });
});
