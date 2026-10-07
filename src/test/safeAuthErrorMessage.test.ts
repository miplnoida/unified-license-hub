import { describe, it, expect } from 'vitest';
import { safeAuthErrorMessage } from '@/contexts/AuthContext';

const FALLBACK = 'Sign-in could not be completed. Please try again.';

describe('safeAuthErrorMessage (AML-CLOSE-08D)', () => {
  it('never shows "{}" from a gateway failure', () => {
    expect(safeAuthErrorMessage('{}', 504)).toBe(FALLBACK);
    expect(safeAuthErrorMessage('{}')).toBe(FALLBACK);
    expect(safeAuthErrorMessage('')).toBe(FALLBACK);
    expect(safeAuthErrorMessage(undefined)).toBe(FALLBACK);
  });
  it('hides server-side 5xx detail', () => {
    expect(safeAuthErrorMessage('upstream request timeout', 503)).toBe(FALLBACK);
  });
  it('keeps meaningful client errors such as wrong credentials', () => {
    expect(safeAuthErrorMessage('Invalid login credentials', 400)).toBe('Invalid login credentials');
  });
});
