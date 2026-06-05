import { describe, expect, it } from 'vitest';
import {
  ADMIN_RETURN_DRILLDOWNS,
  applyAdminReturnServerFilter,
  getAdminReturnDisplayStatus,
  isAdminReturnOverdue,
  matchesAdminReturnFilter,
} from '@/lib/adminReturnFilters';

describe('admin return visibility filters', () => {
  const today = '2026-06-05';

  it('excludes draft, pending, not_submitted, and in_progress from admin-visible overdue counts', () => {
    expect(getAdminReturnDisplayStatus({ status: 'draft', due_date: '2026-05-01', reviewed_at: null }, today)).toBeNull();
    expect(getAdminReturnDisplayStatus({ status: 'pending', due_date: '2026-05-01', reviewed_at: null }, today)).toBeNull();
    expect(getAdminReturnDisplayStatus({ status: 'not_submitted', due_date: '2026-05-01', reviewed_at: null }, today)).toBeNull();
    expect(getAdminReturnDisplayStatus({ status: 'in_progress', due_date: '2026-05-01', reviewed_at: null }, today)).toBeNull();
  });

  it('marks only submitted and unreviewed late returns as overdue for admin', () => {
    expect(isAdminReturnOverdue({ status: 'submitted', due_date: '2026-05-01', reviewed_at: null }, today)).toBe(true);
    expect(isAdminReturnOverdue({ status: 'submitted', due_date: '2026-05-01', reviewed_at: '2026-05-03T10:00:00Z' }, today)).toBe(false);
    expect(isAdminReturnOverdue({ status: 'accepted', due_date: '2026-05-01', reviewed_at: null }, today)).toBe(false);
  });

  it('keeps overdue and pending-review groups mutually exclusive', () => {
    const overdue = { status: 'submitted', due_date: '2026-05-01', reviewed_at: null };
    const pendingReview = { status: 'submitted', due_date: '2026-06-10', reviewed_at: null };

    expect(matchesAdminReturnFilter(overdue, 'overdue', today)).toBe(true);
    expect(matchesAdminReturnFilter(overdue, 'submitted', today)).toBe(false);
    expect(matchesAdminReturnFilter(pendingReview, 'submitted', today)).toBe(true);
    expect(matchesAdminReturnFilter(pendingReview, 'overdue', today)).toBe(false);
  });

  it('builds server-side overdue filters that match the drill-down contract', () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const query = {
      not: (...args: unknown[]) => { calls.push(['not', ...args]); return query; },
      eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
      lt: (...args: unknown[]) => { calls.push(['lt', ...args]); return query; },
      is: (...args: unknown[]) => { calls.push(['is', ...args]); return query; },
      or: (...args: unknown[]) => { calls.push(['or', ...args]); return query; },
    };

    const result = applyAdminReturnServerFilter(query, ADMIN_RETURN_DRILLDOWNS.overdue.filter, today);

    expect(result).toBe(query);
    expect(calls).toEqual([
      ['not', 'status', 'in', '("draft","pending","not_submitted","in_progress")'],
      ['eq', 'status', 'submitted'],
      ['lt', 'due_date', today],
      ['is', 'reviewed_at', null],
    ]);
  });
});