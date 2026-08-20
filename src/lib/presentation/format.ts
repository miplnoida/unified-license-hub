/**
 * Reusable value formatters for the enterprise presentation layer.
 *
 * Rules:
 *  - never return a raw JSON blob for a structured value (callers render those
 *    with a definition list / nested card / chips instead);
 *  - never invent data: absent values render as an em dash;
 *  - dates and date-times reuse the canonical helpers in `@/lib/datetime`.
 */
import { formatDateOnly, formatDateTime } from '@/lib/datetime';

export const EMPTY = '—';

export const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

export function formatDate(v: unknown): string {
  return isBlank(v) ? EMPTY : formatDateOnly(v as string);
}

export function formatTimestamp(v: unknown): string {
  return isBlank(v) ? EMPTY : formatDateTime(v as string);
}

/** Renders `2026-05-01` as a date and a full ISO instant as a date-time. */
export function formatTemporal(v: unknown): string {
  if (isBlank(v)) return EMPTY;
  const s = String(v);
  if (ISO_DATE.test(s)) return formatDateOnly(s);
  if (ISO_DATETIME.test(s)) return formatDateTime(s);
  return s;
}

export function formatNumber(v: unknown, maximumFractionDigits = 2): string {
  if (isBlank(v)) return EMPTY;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return EMPTY;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(n);
}

export function formatCount(v: unknown): string {
  if (isBlank(v)) return EMPTY;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-GB').format(n) : EMPTY;
}

export function formatCurrency(v: unknown, currency = 'XCD'): string {
  if (isBlank(v)) return EMPTY;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return EMPTY;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${formatNumber(n)}`;
  }
}

/** `12.5%` — accepts a percentage value already expressed 0–100. */
export function formatPercent(v: unknown, fractionDigits = 2): string {
  if (isBlank(v)) return EMPTY;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return EMPTY;
  const trimmed = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(fractionDigits);
  return `${trimmed}%`;
}

export function formatRatio(v: unknown, fractionDigits = 2): string {
  if (isBlank(v)) return EMPTY;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(fractionDigits) : EMPTY;
}

export function formatBoolean(v: unknown, yes = 'Yes', no = 'No'): string {
  if (v === null || v === undefined || v === '') return EMPTY;
  if (typeof v === 'string') {
    if (/^(true|t|yes|y|1)$/i.test(v)) return yes;
    if (/^(false|f|no|n|0)$/i.test(v)) return no;
    return v;
  }
  return v ? yes : no;
}

/** A short, human reference — never a bare UUID. */
export function formatReference(v: unknown, fallback = EMPTY): string {
  if (isBlank(v)) return fallback;
  return String(v);
}

/** `Q1 2025 (due 30 Apr 2025)` style period label. */
export function formatPeriod(label: unknown, dueDate?: unknown): string {
  const base = isBlank(label) ? EMPTY : String(label);
  if (isBlank(dueDate)) return base;
  return `${base} · due ${formatDate(dueDate)}`;
}

/** True when a value looks like a bare UUID (never shown as a primary label). */
export function isUuid(v: unknown): boolean {
  return typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Last-8 shorthand for a technical identifier, for copyable metadata only. */
export function shortId(v: unknown): string {
  return isBlank(v) ? EMPTY : `…${String(v).slice(-8)}`;
}

export interface DueState {
  tone: 'positive' | 'warning' | 'critical' | 'neutral';
  label: string;
  days: number | null;
}

/** Due-date pressure indicator for queues and obligation lists. */
export function dueState(due: unknown, closed?: unknown): DueState {
  if (!isBlank(closed)) return { tone: 'positive', label: 'Closed', days: null };
  if (isBlank(due)) return { tone: 'neutral', label: EMPTY, days: null };
  const d = new Date(String(due));
  if (Number.isNaN(d.getTime())) return { tone: 'neutral', label: EMPTY, days: null };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { tone: 'critical', label: `Overdue by ${Math.abs(days)}d`, days };
  if (days <= 7) return { tone: 'warning', label: `Due in ${days}d`, days };
  return { tone: 'positive', label: `Due in ${days}d`, days };
}

/** Trend between a current and previous numeric value. */
export function trend(current: unknown, previous: unknown): {
  direction: 'up' | 'down' | 'flat' | 'unknown'; delta: number | null; label: string;
} {
  const c = Number(current); const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) {
    return { direction: 'unknown', delta: null, label: 'No comparison' };
  }
  const delta = c - p;
  if (Math.abs(delta) < 1e-9) return { direction: 'flat', delta: 0, label: 'No change' };
  return {
    direction: delta > 0 ? 'up' : 'down',
    delta,
    label: `${delta > 0 ? '+' : ''}${formatNumber(delta)}`,
  };
}
