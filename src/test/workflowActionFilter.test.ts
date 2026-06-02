import { describe, it, expect } from 'vitest';
import {
  resolveAvailableActions,
  isRemarksRequired,
  hasNoAllowedActions,
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
      allowedActions: ['approve'],
    });
    expect(actions).toEqual(['approve']);
  });

  it('returns empty array when allowed_actions is missing (matches backend)', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: undefined,
    });
    expect(actions).toEqual([]);
  });

  it('returns empty array when allowed_actions is empty (matches backend)', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: [],
    });
    expect(actions).toEqual([]);
  });

  it('returns empty array when allowed_actions is null', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: null as any,
    });
    expect(actions).toEqual([]);
  });

  it('never includes synthetic actions (request_info / delegate)', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: true,
      allowedActions: ['approve', 'reject', 'request_info', 'delegate'] as any,
    });
    expect(actions).not.toContain('request_info' as any);
    expect(actions).not.toContain('delegate' as any);
  });

  // Regression: super_admin or admin viewing an application they are not
  // assigned to must NOT see "Forward to Next Level". Backend returns
  // can_act=false → frontend passes an empty allowedActions list → no buttons.
  it('admin/regulator not assigned to current step: zero buttons (incl. no Forward to Next Level)', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: [], // backend says: this user has no allowed actions here
    });
    expect(actions).toEqual([]);
    expect(actions).not.toContain('approve');
  });

  // Correct approver on a non-final step where approve is allowed:
  // sees Forward to Next Level (approve), no Reject.
  it('current-step approver on non-final step with approve allowed → forward only, no reject', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: false,
      allowedActions: ['approve', 'send_back'],
    });
    expect(actions).toContain('approve'); // rendered as "Forward to Next Level"
    expect(actions).not.toContain('reject');
  });

  // Final-level approver with approve allowed sees Approve (not Forward),
  // plus reject if configured.
  it('final-level approver sees approve + reject, no forward semantics', () => {
    const actions = resolveAvailableActions({
      isFirstLevel: false,
      isLastLevel: true,
      allowedActions: ['approve', 'reject'],
    });
    expect(actions).toEqual(['approve', 'reject']);
  });
});

describe('hasNoAllowedActions', () => {
  it('true for undefined / null / empty', () => {
    expect(hasNoAllowedActions(undefined)).toBe(true);
    expect(hasNoAllowedActions(null as any)).toBe(true);
    expect(hasNoAllowedActions([])).toBe(true);
  });
  it('false when at least one action is configured', () => {
    expect(hasNoAllowedActions(['approve'])).toBe(false);
    expect(hasNoAllowedActions(['send_back', 'escalate'])).toBe(false);
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

  it('REMARKS_REQUIRED_ACTIONS exactly matches backend rule (approve/reject/request_resubmission)', () => {
    expect(new Set(REMARKS_REQUIRED_ACTIONS)).toEqual(
      new Set(['approve', 'reject', 'request_resubmission'])
    );
  });
});
