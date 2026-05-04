import { describe, it, expect } from 'vitest';
import {
  resolveAvailableActions,
  isRemarksRequired,
  REMARKS_REQUIRED_ACTIONS,
} from '@/lib/workflowActionFilter';

describe('resolveAvailableActions', () => {
  it('first step (not last): forward + escalate + request_resubmission, no send_back/reject', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: true,
      isLastLevel: false,
      allowedActions: ['approve', 'reject', 'send_back', 'escalate', 'request_resubmission'],
    });
    expect(actions).toEqual(['approve', 'escalate', 'request_resubmission']);
  });

  it('middle step: forward + send_back + escalate + request_resubmission', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: ['approve', 'reject', 'send_back', 'escalate', 'request_resubmission'],
    });
    expect(actions).toEqual(['approve', 'send_back', 'escalate', 'request_resubmission']);
  });

  it('last step: approve + reject + request_resubmission, no escalate/send_back/forward', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: true,
      allowedActions: ['approve', 'reject', 'send_back', 'escalate', 'request_resubmission'],
    });
    expect(actions).toEqual(['approve', 'reject', 'request_resubmission']);
  });

  it('respects allowed_actions: hides actions the step does not permit', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: ['approve'], // only approve is allowed
    });
    expect(actions).toEqual(['approve']);
  });

  it('falls back to legacy default when allowed_actions is missing', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: undefined,
    });
    // legacy default: ['approve','reject','send_back']
    expect(actions).toEqual(['approve', 'send_back']);
  });

  it('falls back to legacy default when allowed_actions is empty', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: [],
    });
    expect(actions).toEqual(['approve', 'send_back']);
  });

  it('never includes synthetic actions (request_info / delegate)', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: true,
      // even if a malformed step asks for these, the candidate list never proposes them
      allowedActions: ['approve', 'reject', 'request_info', 'delegate'] as any,
    });
    expect(actions).not.toContain('request_info' as any);
    expect(actions).not.toContain('delegate' as any);
  });
});

describe('isRemarksRequired', () => {
  it.each(REMARKS_REQUIRED_ACTIONS)('requires remarks for %s', (action) => {
    expect(isRemarksRequired(action)).toBe(true);
  });

  it('does not require remarks for send_back / escalate', () => {
    expect(isRemarksRequired('send_back')).toBe(false);
    expect(isRemarksRequired('escalate')).toBe(false);
  });
});
