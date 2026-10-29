import { describe, it, expect } from 'vitest';
import { getEffectivePortalContext, getEffectiveUserRoleLabel } from '@/lib/effectiveRole';
import { canUsePostLicenceServices } from '@/lib/postLicenceAccess';
import { resolvePortalReturnsRedirect } from '@/lib/returnsAudienceRoute';
import { pickDefaultAnswerVersion, formsForVersion } from '@/lib/returns/submittedAnswers';

describe('pre-licensee vs licensee', () => {
  it('pre-licensee linked to an issued licence stays pre-licensee', () => {
    const c = getEffectivePortalContext({ baseRole: 'pre_licensee', hasPrimaryUserAccess: true, resolvedLicenseeId: 'L1' });
    expect(c.isLicensee).toBe(false);
    expect(c.isPreLicensee).toBe(true);
    expect(canUsePostLicenceServices({ role: 'pre_licensee', licenseeId: 'L1' })).toBe(false);
  });
  it('applicant linked to licence is not a licensee', () => {
    expect(getEffectivePortalContext({ baseRole: 'applicant', resolvedLicenseeId: 'L1' }).isLicensee).toBe(false);
  });
  it('explicit PPOC mapping still grants licensee context', () => {
    expect(getEffectivePortalContext({ baseRole: 'applicant', isPpoc: true, resolvedLicenseeId: 'L1' }).isLicensee).toBe(true);
  });
  it('licensee primary keeps access', () => {
    expect(getEffectivePortalContext({ baseRole: 'licensee_primary' }).isLicensee).toBe(true);
    expect(canUsePostLicenceServices({ role: 'licensee_primary' })).toBe(true);
  });
  it('approved primary-user association keeps access', () => {
    expect(canUsePostLicenceServices({ role: null, userType: 'primary' })).toBe(true);
  });
});

describe('returns staff', () => {
  it('analyst and supervisor resolve internal with their labels', () => {
    expect(getEffectivePortalContext({ baseRole: 'analyst' }).isInternal).toBe(true);
    expect(getEffectiveUserRoleLabel({ baseRole: 'analyst' })).toBe('Analyst');
    expect(getEffectiveUserRoleLabel({ baseRole: 'supervisor' })).toBe('Supervisor');
  });
  it('staff opening entity returns go to the regulator workspace', () => {
    expect(resolvePortalReturnsRedirect('/entity/returns')).toBe('/returns/queue');
    expect(resolvePortalReturnsRedirect('/entity/returns/filings/abc')).toBe('/returns/filings/abc');
    expect(resolvePortalReturnsRedirect('/applications')).toBeNull();
  });
});

describe('submitted answers', () => {
  const versions = [
    { id: 'v1', version_number: 1, submitted_at: '2026-10-24' },
    { id: 'v2', version_number: 2, submitted_at: null },
  ];
  it('defaults to latest submitted version', () => {
    expect(pickDefaultAnswerVersion(versions)).toBe('v1');
  });
  it('shows only forms of the selected version', () => {
    const forms = [
      { id: 'a', return_filing_version_id: 'v1', sequence: 2 },
      { id: 'b', return_filing_version_id: 'v2', sequence: 1 },
      { id: 'c', return_filing_version_id: 'v1', sequence: 1 },
    ];
    expect(formsForVersion(forms, 'v1').map((f) => f.id)).toEqual(['c', 'a']);
  });
});
