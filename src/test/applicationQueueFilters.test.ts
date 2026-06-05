import { describe, expect, it } from 'vitest';
import {
  APPLICATION_QUEUE_PENDING_STATUSES,
  APPLICATION_QUEUE_SLA_BREACH_DAYS,
  APPLICATION_QUEUE_SLA_DUE_SOON_DAYS,
  matchesApplicationQueueSla,
} from '@/lib/applicationQueueFilters';
import { SUBMITTED_APPLICATION_STATUSES } from '@/lib/applicationStatus';

describe('application queue SLA filters', () => {
  const now = new Date('2026-06-05T12:00:00.000Z');

  it('uses only submitted and in_progress as pending queue statuses', () => {
    expect(APPLICATION_QUEUE_PENDING_STATUSES).toEqual(['submitted', 'in_progress']);
    expect(SUBMITTED_APPLICATION_STATUSES).toEqual(APPLICATION_QUEUE_PENDING_STATUSES);
  });

  it('matches pending for submitted and in_progress applications', () => {
    expect(matchesApplicationQueueSla('submitted', '2026-06-01T00:00:00.000Z', 'pending', now)).toBe(true);
    expect(matchesApplicationQueueSla('in_progress', '2026-06-01T00:00:00.000Z', 'pending', now)).toBe(true);
    expect(matchesApplicationQueueSla('under_review', '2026-06-01T00:00:00.000Z', 'pending', now)).toBe(false);
  });

  it('matches breached only after the exact breach cutoff', () => {
    const breachedDate = new Date(now);
    breachedDate.setDate(breachedDate.getDate() - APPLICATION_QUEUE_SLA_BREACH_DAYS - 1);

    const exactCutoff = new Date(now);
    exactCutoff.setDate(exactCutoff.getDate() - APPLICATION_QUEUE_SLA_BREACH_DAYS);

    expect(matchesApplicationQueueSla('submitted', breachedDate.toISOString(), 'breached', now)).toBe(true);
    expect(matchesApplicationQueueSla('submitted', exactCutoff.toISOString(), 'breached', now)).toBe(false);
    expect(matchesApplicationQueueSla('approved', breachedDate.toISOString(), 'breached', now)).toBe(false);
  });

  it('matches due soon only inside the 20-30 day window', () => {
    const insideWindow = new Date(now);
    insideWindow.setDate(insideWindow.getDate() - Math.ceil((APPLICATION_QUEUE_SLA_BREACH_DAYS + APPLICATION_QUEUE_SLA_DUE_SOON_DAYS) / 2));

    const tooRecent = new Date(now);
    tooRecent.setDate(tooRecent.getDate() - APPLICATION_QUEUE_SLA_DUE_SOON_DAYS + 1);

    const tooOld = new Date(now);
    tooOld.setDate(tooOld.getDate() - APPLICATION_QUEUE_SLA_BREACH_DAYS - 1);

    expect(matchesApplicationQueueSla('in_progress', insideWindow.toISOString(), 'due_soon', now)).toBe(true);
    expect(matchesApplicationQueueSla('in_progress', tooRecent.toISOString(), 'due_soon', now)).toBe(false);
    expect(matchesApplicationQueueSla('in_progress', tooOld.toISOString(), 'due_soon', now)).toBe(false);
  });

  it('excludes invalid or legacy statuses from all SLA buckets', () => {
    for (const legacyStatus of ['under_review', 'in_review', 'pending_review', 'review']) {
      expect(matchesApplicationQueueSla(legacyStatus, '2026-05-01T00:00:00.000Z', 'pending', now)).toBe(false);
      expect(matchesApplicationQueueSla(legacyStatus, '2026-05-01T00:00:00.000Z', 'breached', now)).toBe(false);
      expect(matchesApplicationQueueSla(legacyStatus, '2026-05-10T00:00:00.000Z', 'due_soon', now)).toBe(false);
    }
  });
});