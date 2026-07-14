/**
 * Shared human-readable mapping for collaborative-review server errors.
 * Kept in a leaf module so any detail page can import it without pulling
 * the whole useCollabReview hook.
 */
export function humanizeReviewError(input: unknown): string {
  const msg: string = (input as any)?.message ?? (typeof input === 'string' ? input : '') ?? '';
  if (!msg) return 'Request failed.';
  if (msg.includes('REVIEW_SUGGESTION_STALE'))
    return 'This suggestion is based on an older version of the narrative. Refresh and review it again.';
  if (msg.startsWith('REVIEW_BLOCKED') || msg.includes('REVIEW_BLOCKED:')) {
    const m = msg.match(/REVIEW_BLOCKED:(\d+)/);
    const n = m ? m[1] : '';
    return `Approval blocked: ${n} unresolved blocking review comment(s). Resolve them before proceeding.`;
  }
  if (msg.includes('REVIEW_FORBIDDEN_ENTITY')) return 'You do not have access to this review.';
  if (msg.includes('REVIEW_FORBIDDEN_ACTION')) return 'You are not permitted to perform this action.';
  if (msg.includes('REVIEW_INVALID_ROLE')) return 'Selected role is not assigned to you.';
  if (msg.includes('REVIEW_UNKNOWN_FIELD')) return 'This narrative field is not configured for suggestions.';
  if (msg.includes('REVIEW_ALREADY_DECIDED')) return 'This suggestion has already been decided.';
  if (msg.includes('REVIEW_UNAUTHENTICATED')) return 'You must be signed in.';
  return msg;
}

export function isReviewBlockedError(input: unknown): boolean {
  const msg: string = (input as any)?.message ?? (typeof input === 'string' ? input : '') ?? '';
  return msg.includes('REVIEW_BLOCKED');
}
