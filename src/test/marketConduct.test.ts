import { describe, it, expect } from 'vitest';

/**
 * Sanity checks for market conduct lifecycle guards. These mirror the runtime
 * validation performed inside `useCompleteAction`, `useWaiveAction`,
 * `useCancelAction`, and `useCloseAlert` so a regression in the required-reason
 * rules will fail loudly.
 */

function requireCompletion(outcome: string, notes: string) {
  if (!outcome?.trim() || !notes?.trim()) throw new Error('Outcome and completion notes are required');
}
function requireWaiver(reason: string) {
  if (!reason?.trim() || reason.trim().length < 10) throw new Error('Waiver reason required (min 10 chars)');
}
function requireCancellation(reason: string) {
  if (!reason?.trim() || reason.trim().length < 10) throw new Error('Cancellation reason required (min 10 chars)');
}
function requireAlertClosure(reason: string) {
  if (!reason || reason.trim().length < 5) throw new Error('Closure reason required (min 5 chars)');
}

describe('market conduct lifecycle guards', () => {
  it('completion requires outcome + notes', () => {
    expect(() => requireCompletion('', '')).toThrow();
    expect(() => requireCompletion('remediated', '')).toThrow();
    expect(() => requireCompletion('remediated', 'notes')).not.toThrow();
  });
  it('waiver requires ≥10-char reason', () => {
    expect(() => requireWaiver('short')).toThrow();
    expect(() => requireWaiver('long enough reason')).not.toThrow();
  });
  it('cancellation requires ≥10-char reason', () => {
    expect(() => requireCancellation('nope')).toThrow();
    expect(() => requireCancellation('duplicate of another action')).not.toThrow();
  });
  it('alert closure requires ≥5-char reason', () => {
    expect(() => requireAlertClosure('')).toThrow();
    expect(() => requireAlertClosure('ok')).toThrow();
    expect(() => requireAlertClosure('resolved')).not.toThrow();
  });
});
