/**
 * F6-X — canonical money presentation.
 *
 * There is no default currency anywhere in this module. A monetary amount
 * without an authoritative currency is *unavailable*, never "probably USD".
 * Symbols and decimal precision come from the governed currency master
 * (`public.currencies`), primed once per session; ISO code is always shown so
 * an ambiguous symbol can never be misread (EC$ 1,500.00 (XCD)).
 */

export const MONEY_UNAVAILABLE = '—';

export interface CurrencyMasterRow {
  code: string;
  display_symbol: string | null;
  decimal_precision: number | null;
  is_active?: boolean;
  name?: string | null;
}

const registry = new Map<string, CurrencyMasterRow>();

/** Prime the presentation registry from the governed currency master. */
export function primeCurrencyRegistry(rows: CurrencyMasterRow[]): void {
  for (const row of rows) {
    if (!row?.code) continue;
    registry.set(row.code.toUpperCase(), row);
  }
}

export function currencyMasterEntry(currency: string): CurrencyMasterRow | undefined {
  return registry.get(String(currency || '').toUpperCase());
}

/** Test/utility hook — the registry is process-level state. */
export function resetCurrencyRegistry(): void {
  registry.clear();
}

function isIsoCode(currency: unknown): currency is string {
  return typeof currency === 'string' && /^[A-Z]{3}$/.test(currency.trim().toUpperCase());
}

/**
 * `EC$ 1,500.00 (XCD)`.
 * Returns `—` when either the amount or the currency is not authoritative.
 */
export function formatMoney(
  amount: unknown,
  currency: unknown,
  opts?: { showCode?: boolean },
): string {
  if (amount === null || amount === undefined || amount === '') return MONEY_UNAVAILABLE;
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return MONEY_UNAVAILABLE;
  if (!isIsoCode(currency)) return MONEY_UNAVAILABLE;

  const code = currency.trim().toUpperCase();
  const entry = registry.get(code);
  const digits = entry?.decimal_precision ?? 2;
  const value = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  const symbol = entry?.display_symbol?.trim();
  const showCode = opts?.showCode ?? true;

  if (symbol) return showCode ? `${symbol} ${value} (${code})` : `${symbol} ${value}`;
  return `${code} ${value}`;
}

/** Amount + currency pair as booked; `—` when the pair is incomplete. */
export function formatBookedMoney(
  amount: unknown,
  currency: unknown,
): string {
  return formatMoney(amount, currency);
}

/** True when a monetary pair is safe to present or submit. */
export function isAuthoritativeMoney(amount: unknown, currency: unknown): boolean {
  return formatMoney(amount, currency) !== MONEY_UNAVAILABLE;
}
