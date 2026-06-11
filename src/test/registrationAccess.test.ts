/**
 * Integration-level tests for the central registration access service:
 * workflow action → registration status → frontend access decision.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAccessStatus,
  canAccessPortalForRegistration,
  classifyRegistrationStatus,
  isInternalUser,
  workflowActionResultStatus,
  type RegistrationRecord,
} from '@/lib/registrationAccess';

const reg = (status: string | null): RegistrationRecord => ({
  id: 'r1',
  status,
  registration_reference: 'REG-001',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
});

describe('classifyRegistrationStatus / canAccessPortalForRegistration', () => {
  it('only approved-family statuses grant portal access', () => {
    for (const s of ['approved', 'final_approved', 'active', 'validated']) {
      expect(canAccessPortalForRegistration(s)).toBe(true);
    }
    for (const s of [
      'pending', 'pending_review', 'submitted', 'in_progress', 'under_review',
      'rejected', 'returned_for_correction', 'resubmission_required',
      'resubmission_requested', 'info_requested', 'more_info_requested',
      'query_raised', 'pending_verification', null, undefined, 'garbage',
    ]) {
      expect(canAccessPortalForRegistration(s as string | null)).toBe(false);
    }
  });

  it('maps real DB statuses to categories', () => {
    expect(classifyRegistrationStatus('pending_review')).toBe('pending');
    expect(classifyRegistrationStatus('in_progress')).toBe('in_review');
    expect(classifyRegistrationStatus('resubmission_required')).toBe('correction');
    expect(classifyRegistrationStatus('rejected')).toBe('rejected');
    expect(classifyRegistrationStatus('pending_verification')).toBe('unverified');
    expect(classifyRegistrationStatus(null)).toBe('missing');
  });
});

describe('workflow action → frontend access (integration mapping)', () => {
  it('final approval unlocks portal access', () => {
    const status = workflowActionResultStatus('approve', true);
    expect(status).toBe('approved');
    const access = buildAccessStatus(reg(status), 'pre_licensee');
    expect(access.allowed).toBe(true);
    expect(access.actionLabel).toBe('Continue to Dashboard');
    expect(access.actionUrl).toBe('/dashboard');
  });

  it('intermediate approval keeps access blocked (in review)', () => {
    const status = workflowActionResultStatus('approve', false);
    const access = buildAccessStatus(reg(status), 'pre_licensee');
    expect(access.allowed).toBe(false);
    expect(access.category).toBe('in_review');
  });

  it('rejection keeps access blocked with rejected message', () => {
    const access = buildAccessStatus(reg(workflowActionResultStatus('reject', true)), 'pre_licensee');
    expect(access.allowed).toBe(false);
    expect(access.category).toBe('rejected');
    expect(access.title).toMatch(/rejected/i);
  });

  it('request_resubmission blocks access and exposes resubmit action', () => {
    const access = buildAccessStatus(
      reg(workflowActionResultStatus('request_resubmission', false)),
      'pre_licensee',
    );
    expect(access.allowed).toBe(false);
    expect(access.category).toBe('correction');
    expect(access.actionLabel).toBe('Update & Resubmit');
    expect(access.actionUrl).toBe('/registration/pre-licensee');
  });

  it('send_back / escalate keep access blocked', () => {
    for (const action of ['send_back', 'escalate'] as const) {
      const access = buildAccessStatus(reg(workflowActionResultStatus(action, false)), 'pre_licensee');
      expect(access.allowed).toBe(false);
    }
  });
});

describe('edge cases', () => {
  it('missing registration → blocked with support message', () => {
    const access = buildAccessStatus(null, 'pre_licensee');
    expect(access.allowed).toBe(false);
    expect(access.category).toBe('missing');
    expect(access.message).toMatch(/contact support/i);
  });

  it('unverified email → blocked with continue-verification action', () => {
    const access = buildAccessStatus(reg('pending_verification'), 'pre_licensee');
    expect(access.allowed).toBe(false);
    expect(access.actionLabel).toBe('Continue Verification');
  });

  it('internal users are never blocked', () => {
    for (const role of ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst', 'developer']) {
      expect(isInternalUser(role)).toBe(true);
      const access = buildAccessStatus(null, role);
      expect(access.allowed).toBe(true);
      expect(access.category).toBe('internal_user');
    }
  });

  it('external roles are not internal', () => {
    for (const role of ['pre_licensee', 'licensee_primary', 'licensee_secondary', 'applicant', null]) {
      expect(isInternalUser(role)).toBe(false);
    }
  });
});
