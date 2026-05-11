import { describe, it, expect } from 'vitest';

type GuardAction =
  | { action: 'continue_draft'; application_id: string }
  | { action: 'block'; code: 'DUPLICATE_ACTIVE' | 'DUPLICATE_APPROVED' | 'DUPLICATE_REJECTED'; application_id: string }
  | { action: 'redirect_payment'; application_id: string }
  | { action: 'allow' };

interface AppRow {
  id: string;
  applicant_id: string;
  status: string;
  updated_at: string;
  data: {
    sector_id?: string;
    sub_sector_id?: string;
    category_id?: string;
  };
}

interface PaymentRow {
  application_id: string;
  status: string;
  created_at: string;
}

const ACTIVE_APPLICATION_STATUSES = new Set([
  'submitted',
  'in_progress',
  'in_review',
  'pending_review',
  'under_review',
  'forwarded',
  'query_raised',
  'resubmission_requested',
  'awaiting_approval',
]);

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['completed', 'success', 'paid']);
const PENDING_APPLICATION_STATUSES = new Set(['payment_pending', 'awaiting_payment', 'pending_payment']);
const PENDING_PAYMENT_STATUSES = new Set(['pending', 'processing', 'initiated']);

function resolveGuard(
  apps: AppRow[],
  payments: PaymentRow[],
  applicantId: string,
  sectorId: string,
  subSectorId: string,
  categoryId: string,
  allowReapplication: boolean,
): GuardAction {
  const matching = apps
    .filter(app => app.applicant_id === applicantId)
    .filter(app => app.data.sector_id === sectorId)
    .filter(app => app.data.sub_sector_id === subSectorId)
    .filter(app => app.data.category_id === categoryId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const draft = matching.find(app => app.status === 'draft');
  if (draft) return { action: 'continue_draft', application_id: draft.id };

  const paymentSummary = new Map<string, { hasSuccessful: boolean; latestStatus: string | null }>();
  for (const payment of payments.sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const current = paymentSummary.get(payment.application_id) || { hasSuccessful: false, latestStatus: null };
    const normalizedStatus = payment.status.toLowerCase();
    if (!current.latestStatus) current.latestStatus = normalizedStatus;
    if (SUCCESSFUL_PAYMENT_STATUSES.has(normalizedStatus)) current.hasSuccessful = true;
    paymentSummary.set(payment.application_id, current);
  }

  const active = matching.find(app => {
    const normalizedStatus = app.status.toLowerCase();
    const summary = paymentSummary.get(app.id);
    return ACTIVE_APPLICATION_STATUSES.has(normalizedStatus)
      || (PENDING_APPLICATION_STATUSES.has(normalizedStatus) && !!summary?.hasSuccessful);
  });
  if (active) {
    return { action: 'block', code: 'DUPLICATE_ACTIVE', application_id: active.id };
  }

  const pending = matching.find(app => {
    const normalizedStatus = app.status.toLowerCase();
    const summary = paymentSummary.get(app.id);
    if (summary?.hasSuccessful) return false;
    return PENDING_APPLICATION_STATUSES.has(normalizedStatus)
      || PENDING_PAYMENT_STATUSES.has(summary?.latestStatus || '');
  });
  if (pending) return { action: 'redirect_payment', application_id: pending.id };

  if (!allowReapplication) {
    const approved = matching.find(app => app.status.toLowerCase() === 'approved');
    if (approved) return { action: 'block', code: 'DUPLICATE_APPROVED', application_id: approved.id };

    const rejected = matching.find(app => app.status.toLowerCase() === 'rejected');
    if (rejected) return { action: 'block', code: 'DUPLICATE_REJECTED', application_id: rejected.id };
  }

  return { action: 'allow' };
}

describe('duplicate application guard precedence', () => {
  const key = {
    applicantId: 'u1',
    sectorId: 's1',
    subSectorId: 'ss1',
    categoryId: 'c1',
  };

  const app = (id: string, status: string, updated_at = '2026-05-11T12:00:00Z'): AppRow => ({
    id,
    applicant_id: key.applicantId,
    status,
    updated_at,
    data: {
      sector_id: key.sectorId,
      sub_sector_id: key.subSectorId,
      category_id: key.categoryId,
    },
  });

  const payment = (application_id: string, status: string, created_at: string): PaymentRow => ({
    application_id,
    status,
    created_at,
  });

  it('Case A: continues an existing draft first', () => {
    expect(resolveGuard([app('draft-1', 'draft')], [], key.applicantId, key.sectorId, key.subSectorId, key.categoryId, true)).toEqual({
      action: 'continue_draft',
      application_id: 'draft-1',
    });
  });

  it('Case B: blocks an active submitted application with successful payment as duplicate active, not pending payment', () => {
    expect(
      resolveGuard(
        [app('app-1', 'submitted')],
        [payment('app-1', 'pending', '2026-05-10T09:00:00Z'), payment('app-1', 'completed', '2026-05-10T10:00:00Z')],
        key.applicantId,
        key.sectorId,
        key.subSectorId,
        key.categoryId,
        true,
      ),
    ).toEqual({ action: 'block', code: 'DUPLICATE_ACTIVE', application_id: 'app-1' });
  });

  it('Case C: redirects to pending payment when payment is truly still pending and no success exists', () => {
    expect(
      resolveGuard(
        [app('app-2', 'payment_pending')],
        [payment('app-2', 'initiated', '2026-05-10T10:00:00Z')],
        key.applicantId,
        key.sectorId,
        key.subSectorId,
        key.categoryId,
        true,
      ),
    ).toEqual({ action: 'redirect_payment', application_id: 'app-2' });
  });

  it('Case D: payment-pending status with a successful payment is treated as active, not pending payment', () => {
    expect(
      resolveGuard(
        [app('app-3', 'payment_pending')],
        [payment('app-3', 'completed', '2026-05-10T10:00:00Z'), payment('app-3', 'pending', '2026-05-10T09:00:00Z')],
        key.applicantId,
        key.sectorId,
        key.subSectorId,
        key.categoryId,
        true,
      ),
    ).toEqual({ action: 'block', code: 'DUPLICATE_ACTIVE', application_id: 'app-3' });
  });

  it('Case E1: allows approved duplicates when re-application is enabled', () => {
    expect(resolveGuard([app('app-4', 'approved')], [], key.applicantId, key.sectorId, key.subSectorId, key.categoryId, true)).toEqual({ action: 'allow' });
  });

  it('Case E2: blocks approved duplicates when re-application is disabled', () => {
    expect(resolveGuard([app('app-4', 'approved')], [], key.applicantId, key.sectorId, key.subSectorId, key.categoryId, false)).toEqual({
      action: 'block',
      code: 'DUPLICATE_APPROVED',
      application_id: 'app-4',
    });
  });

  it('Case E3: blocks rejected duplicates when re-application is disabled', () => {
    expect(resolveGuard([app('app-5', 'rejected')], [], key.applicantId, key.sectorId, key.subSectorId, key.categoryId, false)).toEqual({
      action: 'block',
      code: 'DUPLICATE_REJECTED',
      application_id: 'app-5',
    });
  });
});