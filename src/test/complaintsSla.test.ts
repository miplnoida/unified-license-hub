import { describe, it, expect } from 'vitest';
import { computeSlaStatus, slaBucketFromRow, slaStatusLabel, slaStatusVariant } from '@/lib/complaintsSla';

const now = new Date('2026-07-16T12:00:00Z');
const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);

describe('complaintsSla', () => {
  describe('computeSlaStatus', () => {
    it('returns resolved_on_time when resolved before due', () => {
      const created = iso(daysFromNow(-10));
      const due = iso(daysFromNow(-3));
      const resolved = iso(daysFromNow(-5));
      expect(computeSlaStatus(created, due, 7, resolved, now)).toBe('resolved_on_time');
    });

    it('returns resolved_late when resolved after due', () => {
      const created = iso(daysFromNow(-10));
      const due = iso(daysFromNow(-5));
      const resolved = iso(daysFromNow(-1));
      expect(computeSlaStatus(created, due, 5, resolved, now)).toBe('resolved_late');
    });

    it('returns breached when unresolved past due', () => {
      expect(
        computeSlaStatus(iso(daysFromNow(-10)), iso(daysFromNow(-1)), 9, null, now),
      ).toBe('breached');
    });

    it('returns at_risk within the 2-day window', () => {
      expect(
        computeSlaStatus(iso(daysFromNow(-4)), iso(daysFromNow(1)), 5, null, now),
      ).toBe('at_risk');
    });

    it('returns at_risk in the bottom 25% of the SLA window', () => {
      // 30-day SLA, 5 days left (16%) → at_risk
      expect(
        computeSlaStatus(iso(daysFromNow(-25)), iso(daysFromNow(5)), 30, null, now),
      ).toBe('at_risk');
    });

    it('returns on_track otherwise', () => {
      expect(
        computeSlaStatus(iso(daysFromNow(-1)), iso(daysFromNow(29)), 30, null, now),
      ).toBe('on_track');
    });

    it('returns unknown when no due information is available', () => {
      expect(computeSlaStatus(null, null, null, null, now)).toBe('unknown');
    });

    it('derives due from created_at + sla_days when sla_due_at is null', () => {
      expect(
        computeSlaStatus(iso(daysFromNow(-10)), null, 5, null, now),
      ).toBe('breached');
    });
  });

  describe('slaBucketFromRow', () => {
    it('prefers server-provided sla_status when present', () => {
      expect(slaBucketFromRow({ sla_status: 'breached' })).toBe('breached');
      expect(slaBucketFromRow({ sla_status: 'resolved_late' })).toBe('resolved_late');
      expect(slaBucketFromRow({ sla_status: 'resolved_on_time' })).toBe('resolved_on_time');
    });

    it('maps legacy server value "resolved" to resolved_on_time', () => {
      expect(slaBucketFromRow({ sla_status: 'resolved' })).toBe('resolved_on_time');
    });

    it('falls back to computeSlaStatus when server value is missing', () => {
      const row = {
        created_at: iso(daysFromNow(-10)),
        sla_due_at: iso(daysFromNow(-1)),
        sla_days: 9,
        resolved_at: null,
      };
      expect(slaBucketFromRow(row)).toBe('breached');
    });

    it('returns unknown for null/undefined rows', () => {
      expect(slaBucketFromRow(null)).toBe('unknown');
      expect(slaBucketFromRow(undefined)).toBe('unknown');
    });
  });

  describe('labels and variants', () => {
    it('labels every state distinctly', () => {
      expect(slaStatusLabel('resolved_on_time')).toBe('Resolved on time');
      expect(slaStatusLabel('resolved_late')).toBe('Resolved late');
      expect(slaStatusLabel('breached')).toBe('Breached');
      expect(slaStatusLabel('at_risk')).toBe('At risk');
      expect(slaStatusLabel('on_track')).toBe('On track');
      expect(slaStatusLabel('unknown')).toBe('—');
    });

    it('flags both breached and resolved_late as destructive', () => {
      expect(slaStatusVariant('breached')).toBe('destructive');
      expect(slaStatusVariant('resolved_late')).toBe('destructive');
    });
  });
});
