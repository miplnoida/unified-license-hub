import { describe, it, expect } from 'vitest';
import {
  categorizeRegistrationStatus,
  isApprovedCategory,
  REGISTRATION_STATUS_MESSAGES,
} from '@/lib/registrationStatus';

describe('registrationStatus mapping', () => {
  it('maps real DB statuses to the right categories', () => {
    expect(categorizeRegistrationStatus('approved')).toBe('approved');
    expect(categorizeRegistrationStatus('pending_review')).toBe('pending');
    expect(categorizeRegistrationStatus('in_progress')).toBe('in_review');
    expect(categorizeRegistrationStatus('resubmission_required')).toBe('correction');
    expect(categorizeRegistrationStatus('returned_for_correction')).toBe('correction');
    expect(categorizeRegistrationStatus('info_requested')).toBe('correction');
    expect(categorizeRegistrationStatus('rejected')).toBe('rejected');
    expect(categorizeRegistrationStatus('pending_verification')).toBe('unverified');
    expect(categorizeRegistrationStatus(null)).toBe('missing');
    expect(categorizeRegistrationStatus(undefined)).toBe('missing');
  });

  it('only `approved` category grants portal access', () => {
    expect(isApprovedCategory('approved')).toBe(true);
    for (const c of ['pending', 'in_review', 'correction', 'rejected', 'missing', 'unverified'] as const) {
      expect(isApprovedCategory(c)).toBe(false);
    }
  });

  it('every category has a user-facing title + description', () => {
    for (const key of Object.keys(REGISTRATION_STATUS_MESSAGES)) {
      const m = (REGISTRATION_STATUS_MESSAGES as any)[key];
      expect(m.title).toBeTruthy();
      expect(m.description).toBeTruthy();
    }
  });
});
