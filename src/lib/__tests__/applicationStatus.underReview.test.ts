import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import {
  isUnderRegulatorReview,
  isApplicantEditable,
  getApplicationDisplayStatus,
} from '@/lib/applicationStatus';

const SUB = '2026-10-30T12:46:00Z';

describe('applicant editability after submission', () => {
  it('unsubmitted draft and in_progress stay editable', () => {
    expect(isApplicantEditable({ status: 'draft', submitted_at: null })).toBe(true);
    expect(isApplicantEditable({ status: 'in_progress', submitted_at: null })).toBe(true);
    expect(getApplicationDisplayStatus({ status: 'in_progress', submitted_at: null })).toBe('In Progress');
  });

  it('submitted in_progress (workflow advanced) is Under Review and locked', () => {
    const app = { status: 'in_progress', submitted_at: SUB };
    expect(isUnderRegulatorReview(app)).toBe(true);
    expect(isApplicantEditable(app)).toBe(false);
    expect(getApplicationDisplayStatus(app)).toBe('Under Review');
  });

  it('submitted is locked and keeps its label', () => {
    expect(isApplicantEditable({ status: 'submitted', submitted_at: SUB })).toBe(false);
    expect(getApplicationDisplayStatus({ status: 'submitted', submitted_at: SUB })).toBe('Submitted');
  });

  it.each([
    'resubmission_requested',
    'resubmission_required',
    'query_raised',
    'returned_for_correction',
    'info_requested',
  ])('returned status %s stays editable even though submitted', (status) => {
    expect(isApplicantEditable({ status, submitted_at: SUB })).toBe(true);
    expect(isUnderRegulatorReview({ status, submitted_at: SUB })).toBe(false);
  });

  it.each(['approved', 'rejected', 'withdrawn', 'cancelled'])('final status %s is locked', (status) => {
    expect(isApplicantEditable({ status, submitted_at: SUB })).toBe(false);
  });
});

import { isApplicantEditable as _ed } from '../applicationStatus';
import { describe as _d, it as _i, expect as _e } from 'vitest';
_d('returned for correction', () => {
  _i('is editable by the applicant even after submission', () => {
    _e(_ed({ status: 'returned_for_correction', submitted_at: '2026-11-01T00:00:00Z' })).toBe(true);
  });
});
