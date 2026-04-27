import { describe, it, expect } from 'vitest';

/**
 * Mirrors the server-side rules in
 *   - public.prevent_duplicate_active_application (Postgres trigger)
 *   - verify-and-submit edge function (1b. duplicate guard)
 *
 * Active = NOT in (draft, cancelled, rejected, withdrawn)
 */
const INACTIVE_STATUSES = new Set(['draft', 'cancelled', 'rejected', 'withdrawn']);

interface AppRow {
  id: string;
  applicant_id: string;
  status: string;
  data: { sector_id?: string };
}

function findActiveDuplicate(
  apps: AppRow[],
  applicantId: string,
  sectorId: string,
  selfId?: string,
): AppRow | undefined {
  return apps.find(
    a =>
      a.applicant_id === applicantId &&
      a.id !== selfId &&
      a.data.sector_id === sectorId &&
      !INACTIVE_STATUSES.has(a.status),
  );
}

describe('Server-side duplicate-application guard', () => {
  const baseApps: AppRow[] = [
    { id: 'a1', applicant_id: 'u1', status: 'submitted', data: { sector_id: 's1' } },
    { id: 'a2', applicant_id: 'u1', status: 'rejected', data: { sector_id: 's1' } },
    { id: 'a3', applicant_id: 'u1', status: 'cancelled', data: { sector_id: 's1' } },
    { id: 'a4', applicant_id: 'u1', status: 'withdrawn', data: { sector_id: 's1' } },
  ];

  it('blocks new application when an active one exists for the sector', () => {
    expect(findActiveDuplicate(baseApps, 'u1', 's1')).toBeDefined();
  });

  it('allows re-application after rejection', () => {
    const apps = baseApps.filter(a => a.status === 'rejected');
    expect(findActiveDuplicate(apps, 'u1', 's1')).toBeUndefined();
  });

  it('allows re-application after cancellation', () => {
    const apps = baseApps.filter(a => a.status === 'cancelled');
    expect(findActiveDuplicate(apps, 'u1', 's1')).toBeUndefined();
  });

  it('allows re-application after withdrawal', () => {
    const apps = baseApps.filter(a => a.status === 'withdrawn');
    expect(findActiveDuplicate(apps, 'u1', 's1')).toBeUndefined();
  });

  it('does not block other users', () => {
    expect(findActiveDuplicate(baseApps, 'u2', 's1')).toBeUndefined();
  });

  it('does not block other sectors', () => {
    expect(findActiveDuplicate(baseApps, 'u1', 's2')).toBeUndefined();
  });

  it('excludes self when re-checking same row (UPDATE path)', () => {
    expect(findActiveDuplicate(baseApps, 'u1', 's1', 'a1')).toBeUndefined();
  });

  it('treats pending_review / in_progress / approved as active', () => {
    for (const status of ['pending_review', 'in_progress', 'approved']) {
      const apps: AppRow[] = [{ id: 'x', applicant_id: 'u1', status, data: { sector_id: 's1' } }];
      expect(findActiveDuplicate(apps, 'u1', 's1')).toBeDefined();
    }
  });
});
