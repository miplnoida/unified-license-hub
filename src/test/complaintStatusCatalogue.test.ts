import { describe, it, expect } from 'vitest';
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  complaintStatusLabel,
  complaintStatusVariant,
  isOpenComplaint,
  canTransitionComplaint,
} from '@/lib/complaintStatus';

/**
 * These assertions lock the client-side status map to the canonical catalogue
 * seeded in the database migration. If a status is added on either side, both
 * must be updated together — the mismatch will fail this test.
 */
describe('complaintStatus catalogue parity', () => {
  it('exposes the six canonical statuses in the expected order', () => {
    expect(COMPLAINT_STATUSES).toEqual([
      'submitted',
      'under_investigation',
      'resolved',
      'closed',
      'rejected',
      'duplicate',
    ]);
  });

  it('gives a human label for every canonical status', () => {
    for (const s of COMPLAINT_STATUSES) {
      expect(COMPLAINT_STATUS_LABELS[s]).toBeTruthy();
      expect(complaintStatusLabel(s)).toBe(COMPLAINT_STATUS_LABELS[s]);
    }
  });

  it('falls back gracefully for unknown/empty status', () => {
    expect(complaintStatusLabel(undefined)).toBe('—');
    expect(complaintStatusLabel(null)).toBe('—');
    expect(complaintStatusLabel('mystery' as any)).toBe('mystery');
    expect(complaintStatusVariant(undefined)).toBe('outline');
    expect(complaintStatusVariant('mystery' as any)).toBe('outline');
  });

  it('treats only submitted + under_investigation as open', () => {
    expect(isOpenComplaint('submitted')).toBe(true);
    expect(isOpenComplaint('under_investigation')).toBe(true);
    for (const terminal of ['resolved', 'closed', 'rejected', 'duplicate'] as const) {
      expect(isOpenComplaint(terminal)).toBe(false);
    }
    expect(isOpenComplaint(null)).toBe(false);
  });

  it('blocks moving out of terminal states', () => {
    for (const terminal of ['closed', 'rejected', 'duplicate'] as const) {
      expect(canTransitionComplaint(terminal, 'under_investigation')).toBe(false);
    }
  });

  it('allows the documented forward transitions', () => {
    expect(canTransitionComplaint('submitted', 'under_investigation')).toBe(true);
    expect(canTransitionComplaint('under_investigation', 'resolved')).toBe(true);
    expect(canTransitionComplaint('resolved', 'closed')).toBe(true);
  });
});
