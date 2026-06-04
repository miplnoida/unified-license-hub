import { describe, it, expect } from 'vitest';

/**
 * Encodes the business rule that PPOC status is granted ONLY through an
 * active row in ppoc_entity_mappings, never inferred from profile role /
 * user_type. Primary User access is independent and based on
 * profiles.licensee_id, profiles.user_type='primary', or the
 * 'licensee_primary' role.
 */
function computeStatus(opts: {
  profileLicenseeId: string | null;
  userType: 'primary' | 'secondary' | 'contact' | null;
  appRoles: string[];
  activePpocMappings: { licensee_id: string }[];
  isInternal?: boolean;
}) {
  const isPrimaryUser =
    !!opts.profileLicenseeId ||
    opts.userType === 'primary' ||
    opts.appRoles.includes('licensee_primary');
  const isPpoc = !opts.isInternal && opts.activePpocMappings.length > 0;
  return { isPrimaryUser, isPpoc };
}

/**
 * Mirrors PpocContext.actingAs derivation. The user is "acting as Primary"
 * when their current selection is their own licensee, even if they also hold
 * PPOC mappings. Otherwise, when the selection is a mapped licensee, they
 * act as PPOC.
 */
function computeActingAs(opts: {
  ownLicenseeId: string | null;
  mappedLicenseeIds: string[];
  activeLicenseeId: string | null;
}): 'primary' | 'ppoc' {
  if (opts.mappedLicenseeIds.length === 0) return 'primary';
  if (opts.activeLicenseeId && opts.ownLicenseeId && opts.activeLicenseeId === opts.ownLicenseeId) return 'primary';
  if (opts.activeLicenseeId && opts.mappedLicenseeIds.includes(opts.activeLicenseeId)) return 'ppoc';
  return 'ppoc';
}

describe('Primary User vs PPOC', () => {
  it('Primary User without PPOC mapping is not a PPOC', () => {
    const s = computeStatus({
      profileLicenseeId: 'lic-1',
      userType: 'primary',
      appRoles: ['licensee_primary'],
      activePpocMappings: [],
    });
    expect(s.isPrimaryUser).toBe(true);
    expect(s.isPpoc).toBe(false);
  });

  it('Primary User with PPOC mapping is both', () => {
    const s = computeStatus({
      profileLicenseeId: 'lic-1',
      userType: 'primary',
      appRoles: ['licensee_primary'],
      activePpocMappings: [{ licensee_id: 'lic-2' }],
    });
    expect(s.isPrimaryUser).toBe(true);
    expect(s.isPpoc).toBe(true);
  });

  it('Secondary user with PPOC mapping is PPOC but not Primary User', () => {
    const s = computeStatus({
      profileLicenseeId: null,
      userType: 'secondary',
      appRoles: ['licensee_secondary'],
      activePpocMappings: [{ licensee_id: 'lic-3' }],
    });
    expect(s.isPrimaryUser).toBe(false);
    expect(s.isPpoc).toBe(true);
  });

  it('Secondary user without mapping is neither PPOC nor Primary User', () => {
    const s = computeStatus({
      profileLicenseeId: null,
      userType: 'secondary',
      appRoles: ['licensee_secondary'],
      activePpocMappings: [],
    });
    expect(s.isPrimaryUser).toBe(false);
    expect(s.isPpoc).toBe(false);
  });

  it('Internal admin users are never treated as PPOC', () => {
    const s = computeStatus({
      profileLicenseeId: null,
      userType: null,
      appRoles: ['admin'],
      activePpocMappings: [{ licensee_id: 'lic-x' }],
      isInternal: true,
    });
    expect(s.isPpoc).toBe(false);
  });

  it('Primary-only user with no mappings always acts as Primary', () => {
    expect(computeActingAs({
      ownLicenseeId: 'lic-1', mappedLicenseeIds: [], activeLicenseeId: 'lic-1',
    })).toBe('primary');
  });

  it('Primary+PPOC user defaults to Primary when own entity is selected', () => {
    expect(computeActingAs({
      ownLicenseeId: 'lic-1', mappedLicenseeIds: ['lic-2', 'lic-3'], activeLicenseeId: 'lic-1',
    })).toBe('primary');
  });

  it('Primary+PPOC user acts as PPOC when a mapped entity is selected', () => {
    expect(computeActingAs({
      ownLicenseeId: 'lic-1', mappedLicenseeIds: ['lic-2'], activeLicenseeId: 'lic-2',
    })).toBe('ppoc');
  });

  it('PPOC-only user always acts as PPOC', () => {
    expect(computeActingAs({
      ownLicenseeId: null, mappedLicenseeIds: ['lic-2'], activeLicenseeId: 'lic-2',
    })).toBe('ppoc');
  });
});
