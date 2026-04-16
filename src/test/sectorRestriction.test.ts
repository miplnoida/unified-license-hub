import { describe, it, expect } from 'vitest';

// Simulate the sector restriction logic from NewApplication.tsx
function canApplyForSector(
  existingApplications: { license_type: string; status: string }[],
  sectorId: string,
  allowReapplication: boolean
): { allowed: boolean; reason?: string } {
  const existing = existingApplications.filter(a => a.license_type === `pre_license`);
  const sectorApps = existing.filter(a => {
    // In real code, data.sector_id is checked — here we simulate
    return true; // same sector
  });

  const activeApp = sectorApps.find(a => !['cancelled', 'rejected'].includes(a.status));
  if (activeApp) {
    return { allowed: false, reason: 'You already have an active application for this sector.' };
  }

  if (!allowReapplication && sectorApps.length > 0) {
    return { allowed: false, reason: 'Re-application is not allowed for this sector.' };
  }

  return { allowed: true };
}

describe('Sector Restriction Logic', () => {
  it('allows first-time application', () => {
    const result = canApplyForSector([], 'sector-1', true);
    expect(result.allowed).toBe(true);
  });

  it('blocks duplicate active application', () => {
    const apps = [{ license_type: 'pre_license', status: 'submitted' }];
    const result = canApplyForSector(apps, 'sector-1', true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('active application');
  });

  it('allows re-application when previous was cancelled', () => {
    const apps = [{ license_type: 'pre_license', status: 'cancelled' }];
    const result = canApplyForSector(apps, 'sector-1', true);
    expect(result.allowed).toBe(true);
  });

  it('allows re-application when previous was rejected', () => {
    const apps = [{ license_type: 'pre_license', status: 'rejected' }];
    const result = canApplyForSector(apps, 'sector-1', true);
    expect(result.allowed).toBe(true);
  });

  it('blocks re-application when setting is disabled', () => {
    const apps = [{ license_type: 'pre_license', status: 'rejected' }];
    const result = canApplyForSector(apps, 'sector-1', false);
    expect(result.allowed).toBe(false);
  });
});
