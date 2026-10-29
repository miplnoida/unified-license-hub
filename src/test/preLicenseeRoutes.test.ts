import { describe, it, expect } from 'vitest';
import { isPreLicenseeAllowedRoute } from '@/hooks/useUserPermissions';
import { pathRequiresLicensedInstitution, pathRequiresLicenceEntitlement } from '@/lib/licenceEntitlementNav';
import { canUsePostLicenceServices } from '@/lib/postLicenceAccess';

describe('pre-licensee allowed routes', () => {
  it.each([
    '/dashboard', '/notifications', '/help/user-manual', '/support', '/entity/correspondence',
    '/entity/correspondence/abc', '/entity/profile', '/licenses', '/applications', '/appeals', '/payments', '/documents',
  ])('allows %s', (p) => expect(isPreLicenseeAllowedRoute(p)).toBe(true));

  it.each(['/admin', '/entity/complaint-rfis', '/entity/supervisory-actions', '/helpdesk', '/supporting'])(
    'does not allow %s', (p) => expect(isPreLicenseeAllowedRoute(p)).toBe(false));
});

describe('licensed-institution-only surfaces', () => {
  it.each(['/entity/complaint-rfis', '/entity/supervisory-actions', '/entity/returns', '/post-license/new', '/applications?type=post'])(
    '%s is licensed-only', (p) => expect(pathRequiresLicensedInstitution(p)).toBe(true));
  it.each(['/entity/correspondence', '/entity/profile', '/help/user-manual', '/support', '/documents', '/applications?type=pre'])(
    '%s is not licensed-only', (p) => expect(pathRequiresLicensedInstitution(p)).toBe(false));
  it('RFIs are not disabled by licence-eligibility lock', () => {
    expect(pathRequiresLicenceEntitlement('/entity/complaint-rfis')).toBe(false);
  });
});

describe('licensed entitlement source', () => {
  it('pre-licensee linked to a licence is not entitled', () => {
    expect(canUsePostLicenceServices({ role: 'pre_licensee', licenseeId: 'x' })).toBe(false);
  });
  it('licensee primary is entitled', () => {
    expect(canUsePostLicenceServices({ role: 'licensee_primary' })).toBe(true);
  });
  it('PPOC mapping entitles', () => {
    expect(canUsePostLicenceServices({ role: 'pre_licensee', isPpoc: true })).toBe(true);
  });
});
