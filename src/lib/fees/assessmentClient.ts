import { supabase } from '@/integrations/supabase/client';

/**
 * Client adapter for the server-authoritative fee & payment engine (F6).
 *
 * The browser NEVER prices anything. Every number rendered by the payment
 * surfaces comes from `fee_assessment_state` / `fee_assessment_overview`, which
 * read the immutable assessment of record and the append-only ledger.
 */

export interface FeeAssessmentLine {
  fee_type_code?: string | null;
  description?: string | null;
  amount?: number | string | null;
  unit_amount?: number | string | null;
  quantity?: number | string | null;
  currency?: string | null;
  blocking?: boolean | null;
  source?: string | null;
}

export interface FeeAssessmentState {
  found: boolean;
  assessment_id?: string | null;
  assessment_number?: string | null;
  application_id?: string | null;
  basis?: string | null;
  resolution_source?: string | null;
  status?: string | null;
  currency?: string | null;
  assessed_total?: number | null;
  assessed_at?: string | null;
  lines?: FeeAssessmentLine[] | null;
  paid_total?: number | null;
  waived_total?: number | null;
  refunded_total?: number | null;
  reversed_total?: number | null;
  outstanding?: number | null;
  requires_payment?: boolean | null;
}

export interface FeeAssessmentOverview extends FeeAssessmentState {
  is_internal?: boolean;
  payments?: Record<string, unknown>[];
  allocations?: Record<string, unknown>[];
  waivers?: Record<string, unknown>[];
  refunds?: Record<string, unknown>[];
  ledger?: Record<string, unknown>[];
  reconciliation_exceptions?: Record<string, unknown>[];
  audit?: Record<string, unknown>[];
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> })
    .rpc(fn, args);

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const money = (amount: unknown, currency?: string | null): string =>
  `${currency || ''} ${num(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

/** Thrown when the server returns a financial payload the UI must not interpret. */
export class MalformedFinancialStateError extends Error {
  constructor(detail: string) {
    super(`FEE_MALFORMED_STATE: ${detail}`);
    this.name = 'MalformedFinancialStateError';
  }
}

const finiteMoney = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

/**
 * Fails closed on any malformed / partial financial payload. Missing
 * authoritative money fields are NEVER coerced into a silent zero — a broken
 * response must surface as "financial record unavailable", not as "nothing to
 * pay".
 */
function assertAssessmentState<T extends FeeAssessmentState>(raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MalformedFinancialStateError('response is not an object');
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.found !== 'boolean') {
    throw new MalformedFinancialStateError('missing "found" flag');
  }
  if (s.found === false) return s as T;

  if (typeof s.assessment_id !== 'string' || s.assessment_id.length < 10) {
    throw new MalformedFinancialStateError('missing assessment identifier');
  }
  if (typeof s.currency !== 'string' || s.currency.trim() === '') {
    throw new MalformedFinancialStateError('missing assessment currency');
  }
  if (finiteMoney(s.assessed_total) === null) {
    throw new MalformedFinancialStateError('missing or invalid assessed total');
  }
  if (finiteMoney(s.outstanding) === null) {
    throw new MalformedFinancialStateError('missing or invalid outstanding balance');
  }
  for (const key of ['paid_total', 'waived_total', 'refunded_total'] as const) {
    if (s[key] !== undefined && s[key] !== null && finiteMoney(s[key]) === null) {
      throw new MalformedFinancialStateError(`invalid ${key}`);
    }
  }
  if (!Array.isArray(s.lines)) {
    throw new MalformedFinancialStateError('assessment lines are not an array');
  }
  for (const line of s.lines as unknown[]) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw new MalformedFinancialStateError('malformed assessment line');
    }
    if (finiteMoney((line as Record<string, unknown>).amount) === null) {
      throw new MalformedFinancialStateError('malformed assessment line amount');
    }
  }
  return s as T;
}

/** Read-only assessment state. Fails closed when the caller has no access. */
export const fetchFeeAssessmentState = async (applicationId: string) =>
  assertAssessmentState<FeeAssessmentState>(
    await call<unknown>('fee_assessment_state', { _application_id: applicationId }),
  );

/** Read-only regulator/entity overview (payments, ledger, waivers, refunds…). */
export const fetchFeeAssessmentOverview = async (applicationId: string) =>
  assertAssessmentState<FeeAssessmentOverview>(
    await call<unknown>('fee_assessment_overview', { _application_id: applicationId }),
  );

export interface FeeAssessmentPreview {
  preview: true;
  found: boolean;
  application_id: string;
  basis?: string | null;
  resolution_source?: string | null;
  currency: string;
  lines: FeeAssessmentLine[];
  assessed_total: number;
  config_snapshot?: Record<string, unknown> | null;
}

/**
 * Server-resolved, NON-persisting preview of what would be assessed. Creates no
 * financial history. The browser still performs no pricing — the ranking and
 * resolution live in `fee_assessment_resolve_lines`.
 */
export const fetchFeeAssessmentPreview = async (applicationId: string): Promise<FeeAssessmentPreview> => {
  const raw = await call<unknown>('fee_assessment_preview', { _application_id: applicationId });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MalformedFinancialStateError('preview response is not an object');
  }
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.lines)) throw new MalformedFinancialStateError('preview lines are not an array');
  if (typeof p.currency !== 'string' || p.currency.trim() === '') {
    throw new MalformedFinancialStateError('preview currency missing');
  }
  if (finiteMoney(p.assessed_total) === null) {
    throw new MalformedFinancialStateError('preview total missing or invalid');
  }
  return p as unknown as FeeAssessmentPreview;
};

/** Creates the assessment of record if one does not exist yet (idempotent). */
export const ensureFeeAssessment = async (applicationId: string, reason?: string) =>
  assertAssessmentState<FeeAssessmentState>(
    await call<unknown>('fee_assessment_ensure', { _application_id: applicationId, _reason: reason ?? null }),
  );


export const requestFeeWaiver = (
  applicationId: string,
  amount: number,
  reason: string,
  kind: 'WAIVER' | 'EXEMPTION' = 'WAIVER',
) => call<{ ok: boolean; waiver_id: string }>('fee_waiver_request', {
  _application_id: applicationId, _amount: amount, _reason: reason, _kind: kind,
});

export const decideFeeWaiver = (
  waiverId: string,
  approve: boolean,
  reason: string,
  approvedAmount?: number | null,
) => call<Record<string, unknown>>('fee_waiver_decide', {
  _waiver_id: waiverId, _approve: approve, _reason: reason, _approved_amount: approvedAmount ?? null,
});

export const requestFeeRefund = (paymentId: string, amount: number, reason: string) =>
  call<{ ok: boolean; refund_id: string }>('fee_refund_request', {
    _payment_id: paymentId, _amount: amount, _reason: reason,
  });

export const decideFeeRefund = (refundId: string, decision: 'approved' | 'rejected', reason: string) =>
  call<Record<string, unknown>>('payment_refund_decide', {
    _refund_id: refundId, _decision: decision, _reason: reason,
  });

export const executeFeeRefund = (refundId: string, reference: string, method?: string | null) =>
  call<Record<string, unknown>>('fee_refund_execute', {
    _refund_id: refundId, _reference: reference, _method: method ?? null,
  });

export const reverseFeePayment = (paymentId: string, reason: string) =>
  call<{ ok: boolean; allocations_reversed: number }>('fee_payment_reverse', {
    _payment_id: paymentId, _reason: reason,
  });

export interface ReconciliationItemInput {
  reference: string;
  amount: number;
  currency?: string;
  value_date?: string;
  notes?: string;
}

export const ingestReconciliation = (
  source: string,
  statementReference: string,
  items: ReconciliationItemInput[],
) => call<{ run_id: string; matched: number; unmatched: number; exceptions: number }>(
  'fee_reconciliation_ingest',
  { _source: source, _statement_reference: statementReference, _items: items },
);

export const resolveReconciliationItem = (itemId: string, resolution: string, note?: string) =>
  call<{ ok: boolean }>('fee_reconciliation_resolve', {
    _item_id: itemId, _resolution: resolution, _note: note ?? null,
  });

/** Governed fee-component maintenance. Direct table DML is revoked. */
export const feeComponentOperation = (
  applicationId: string,
  operation: 'add' | 'update' | 'remove',
  payload: Record<string, unknown>,
) => call<{ ok: boolean; component_id?: string }>('fee_component_operation', {
  _application_id: applicationId, _operation: operation, _payload: payload,
});

/** Turns a Postgres error into an operator-readable message. */
export const feeErrorMessage = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/FEE_MALFORMED_STATE/i.test(msg)) {
    return 'Financial record unavailable — the server returned an incomplete financial state.';
  }
  if (/FEE_FORBIDDEN|permission denied|42501/i.test(msg)) {
    return 'You do not have permission to perform this financial action.';
  }

  if (/MAKER_CHECKER/i.test(msg)) return 'The requester of this action cannot approve it.';
  if (/DUPLICATE_PAYMENT_REFERENCE/i.test(msg)) return 'That payment reference has already been recorded.';
  if (/ASSESSMENT_SETTLED/i.test(msg)) return 'This assessment is settled and can no longer be re-itemised.';
  return msg || 'The financial operation could not be completed.';
};
