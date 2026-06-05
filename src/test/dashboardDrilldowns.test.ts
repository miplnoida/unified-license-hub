import { describe, expect, it } from 'vitest';
import { APPLICATION_DRILLDOWNS, RETURN_DRILLDOWNS, drilldownTo, drilldownRpcParams, returnDrilldownTo } from '@/lib/dashboardDrilldowns';
import {
  APPLICATION_QUEUE_PENDING_STATUSES,
  APPLICATION_QUEUE_RETURNED_STATUSES,
} from '@/lib/applicationQueueFilters';
import { ADMIN_RETURN_DRILLDOWNS } from '@/lib/adminReturnFilters';

/**
 * The dashboard drill-down registry is the single source of truth for:
 *  - which URL each metric opens
 *  - which RPC params the count behind that metric is computed with
 *
 * These tests guard the contract so that no future "patch this one link"
 * change silently breaks count ↔ list parity.
 */
describe('dashboard application drill-down registry', () => {
  it('exposes the expected metric keys', () => {
    expect(Object.keys(APPLICATION_DRILLDOWNS).sort()).toEqual([
      'all', 'approved', 'draft', 'inProgress', 'pending', 'rejected',
      'returned', 'slaBreached', 'slaDueSoon', 'submitted',
    ]);
  });

  it('encodes URL params exactly as ApplicationsList parses them', () => {
    expect(drilldownTo('pending')).toBe('/applications/queue?sla=pending');
    expect(drilldownTo('slaBreached')).toBe('/applications/queue?sla=breached');
    expect(drilldownTo('slaDueSoon')).toBe('/applications/queue?sla=due_soon');
    expect(drilldownTo('submitted')).toBe('/applications/queue?status=submitted');
    expect(drilldownTo('inProgress')).toBe('/applications/queue?status=in_progress');
    expect(drilldownTo('draft')).toBe('/applications/queue?status=draft');
    expect(drilldownTo('approved')).toBe('/applications/queue?statusGroup=approved');
    expect(drilldownTo('rejected')).toBe('/applications/queue?statusGroup=rejected');
    expect(drilldownTo('returned')).toBe('/applications/queue?statusGroup=returned');
    expect(drilldownTo('all')).toBe('/applications/queue');
  });

  it('returns RPC params that match the URL params for each metric', () => {
    expect(drilldownRpcParams('pending')).toEqual({ _sla: 'pending' });
    expect(drilldownRpcParams('slaBreached')).toEqual({ _sla: 'breached' });
    expect(drilldownRpcParams('returned')).toEqual({ _status_group: 'returned' });
    expect(drilldownRpcParams('approved')).toEqual({ _status_group: 'approved' });
    expect(drilldownRpcParams('inProgress')).toEqual({ _status: 'in_progress' });
  });

  it('keeps drill-down status sets aligned with shared queue constants', () => {
    expect(APPLICATION_DRILLDOWNS.pending.statuses).toEqual(APPLICATION_QUEUE_PENDING_STATUSES);
    expect(APPLICATION_DRILLDOWNS.slaBreached.statuses).toEqual(APPLICATION_QUEUE_PENDING_STATUSES);
    expect(APPLICATION_DRILLDOWNS.returned.statuses).toEqual(APPLICATION_QUEUE_RETURNED_STATUSES);
  });
});

describe('dashboard return drill-down registry', () => {
  it('encodes the admin returns URLs used by dashboard cards', () => {
    expect(returnDrilldownTo('overdue')).toBe('/returns-management?status=overdue');
    expect(returnDrilldownTo('pendingReview')).toBe('/returns-management?status=submitted');
    expect(returnDrilldownTo('submitted')).toBe('/returns-management');
  });

  it('reuses the canonical admin return drill-down contract', () => {
    expect(RETURN_DRILLDOWNS.overdue.filter).toBe(ADMIN_RETURN_DRILLDOWNS.overdue.filter);
    expect(RETURN_DRILLDOWNS.pendingReview.filter).toBe(ADMIN_RETURN_DRILLDOWNS.pendingReview.filter);
    expect(RETURN_DRILLDOWNS.submitted.filter).toBe(ADMIN_RETURN_DRILLDOWNS.all.filter);
  });
});
