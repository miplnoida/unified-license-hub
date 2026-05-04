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
