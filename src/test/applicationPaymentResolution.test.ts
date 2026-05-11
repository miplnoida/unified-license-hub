import { describe, expect, it } from 'vitest';

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paid_at?: string | null;
  created_at: string;
}

function resolvePaymentSummary(payments: PaymentRow[]) {
  const normalized = payments.map((payment) => {
    const status = payment.status.toLowerCase();
    const resolvedStatus = ['completed', 'success', 'paid'].includes(status)
      ? 'paid'
      : ['pending', 'processing', 'initiated'].includes(status)
        ? 'pending'
        : status === 'failed'
          ? 'failed'
          : status;

    const priority = resolvedStatus === 'paid'
      ? 1
      : resolvedStatus === 'pending'
        ? 2
        : resolvedStatus === 'failed'
          ? 3
          : 4;

    return { ...payment, resolvedStatus, priority };
  });

  return normalized.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.paid_at || b.created_at).localeCompare(a.paid_at || a.created_at);
  })[0] || null;
}

describe('application payment summary resolution', () => {
  it('Case F: shows paid when payment details indicate completed', () => {
    const summary = resolvePaymentSummary([
      { id: 'p1', amount: 100, currency: 'USD', status: 'completed', paid_at: '2026-05-10T10:00:00Z', created_at: '2026-05-10T09:00:00Z' },
    ]);

    expect(summary?.resolvedStatus).toBe('paid');
  });

  it('Case G: prefers a successful payment over a stale pending row', () => {
    const summary = resolvePaymentSummary([
      { id: 'p1', amount: 100, currency: 'USD', status: 'pending', created_at: '2026-05-10T11:00:00Z' },
      { id: 'p2', amount: 100, currency: 'USD', status: 'success', paid_at: '2026-05-10T10:30:00Z', created_at: '2026-05-10T10:00:00Z' },
    ]);

    expect(summary?.id).toBe('p2');
    expect(summary?.resolvedStatus).toBe('paid');
  });

  it('shows pending only when no successful payment exists', () => {
    const summary = resolvePaymentSummary([
      { id: 'p1', amount: 100, currency: 'USD', status: 'initiated', created_at: '2026-05-10T10:00:00Z' },
    ]);

    expect(summary?.resolvedStatus).toBe('pending');
  });
});