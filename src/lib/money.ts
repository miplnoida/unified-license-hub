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

/* ------------------------------------------------------------------ *
 * Configured base currency (jurisdiction configuration)
 *
 * The base currency is server-authoritative: it comes from
 * `monetary_configs.base_currency` via `monetary_config_resolve` and is primed
 * once per session. It is NEVER derived from the browser or user locale, so an
 * operator working from another country can never re-denominate a local
 * amount. When it is unknown, base-currency amounts render as `—` rather than
 * guessing.
 * ------------------------------------------------------------------ */

let configuredBaseCurrency: string | null = null;
let configuredReportingCurrency: string | null = null;

export function primeConfiguredCurrencies(input: {
  baseCurrency?: string | null;
  reportingCurrency?: string | null;
}): void {
  const base = input.baseCurrency?.trim().toUpperCase();
  const reporting = input.reportingCurrency?.trim().toUpperCase();
  if (base && isIsoCode(base)) configuredBaseCurrency = base;
  if (reporting && isIsoCode(reporting)) configuredReportingCurrency = reporting;
}

export function baseCurrency(): string | null {
  return configuredBaseCurrency;
}

export function reportingCurrency(): string | null {
  return configuredReportingCurrency ?? configuredBaseCurrency;
}

export function resetConfiguredCurrencies(): void {
  configuredBaseCurrency = null;
  configuredReportingCurrency = null;
}

/**
 * Rule B — a local monetary amount whose record carries no currency of its own
 * is presented in the configured base currency (Saint Lucia: XCD → `EC$ …`).
 */
export function formatBaseMoney(amount: unknown, opts?: { showCode?: boolean }): string {
  return formatMoney(amount, configuredBaseCurrency, opts);
}

/** Regulatory reporting presentation (falls back to base currency). */
export function formatReportingMoney(amount: unknown, opts?: { showCode?: boolean }): string {
  return formatMoney(amount, reportingCurrency(), opts);
}

/**
 * Rule A + Rule B — use the record's own currency when it has one, otherwise
 * the configured base currency. Never substitutes a hardcoded currency.
 */
export function formatRecordMoney(
  amount: unknown,
  currency?: unknown,
  opts?: { showCode?: boolean },
): string {
  if (isIsoCode(currency)) return formatMoney(amount, currency, opts);
  return formatBaseMoney(amount, opts);
}

/**
 * Rule E — mixed-currency data is never summed into one figure. Returns one
 * formatted total per currency, in stable currency order.
 */
export function formatTotalsByCurrency(
  rows: Array<{ amount: unknown; currency?: unknown }>,
  opts?: { showCode?: boolean },
): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const code = isIsoCode(row.currency)
      ? row.currency.trim().toUpperCase()
      : configuredBaseCurrency;
    if (!code) continue;
    const n = typeof row.amount === 'number' ? row.amount : Number(row.amount);
    if (!Number.isFinite(n)) continue;
    totals.set(code, (totals.get(code) ?? 0) + n);
  }
  if (totals.size === 0) return MONEY_UNAVAILABLE;
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, sum]) => formatMoney(sum, code, opts))
    .join(' + ');
}
