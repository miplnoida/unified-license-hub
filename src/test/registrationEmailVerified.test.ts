import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearEmailVerifiedLocally,
  isEmailVerifiedLocally,
  markEmailVerifiedLocally,
  normalizeVerificationEmail,
  verifiedEmailMarkerKey,
} from '@/lib/registrationEmailVerified';

describe('registration email verified marker', () => {
  beforeEach(() => sessionStorage.clear());

  it('persists verification per email so later steps / refreshes stay verified', () => {
    markEmailVerifiedLocally('User@Example.com');
    expect(isEmailVerifiedLocally('user@example.com')).toBe(true);
    // Simulates a refresh: a fresh read of the same store still sees it.
    expect(sessionStorage.getItem(verifiedEmailMarkerKey('user@example.com'))).toBe('true');
  });

  it('does not leak verification to a different email', () => {
    markEmailVerifiedLocally('a@example.com');
    expect(isEmailVerifiedLocally('b@example.com')).toBe(false);
  });

  it('clears verification when the email changes', () => {
    markEmailVerifiedLocally('a@example.com');
    clearEmailVerifiedLocally('a@example.com');
    expect(isEmailVerifiedLocally('a@example.com')).toBe(false);
  });

  it('normalises casing and whitespace', () => {
    expect(normalizeVerificationEmail('  Foo@Bar.com ')).toBe('foo@bar.com');
  });
});
