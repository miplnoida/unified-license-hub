import { describe, it, expect } from 'vitest';

/**
 * Encodes the business rule that PPOC status is granted ONLY through an
 * active row in ppoc_entity_mappings, never inferred from profile role /
 * user_type. Primary User access is independent and based on
 * profiles.licensee_id.
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
});
