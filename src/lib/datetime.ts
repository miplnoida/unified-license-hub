/**
 * Shared display formatters for timestamps.
 *
 * Display-only helpers: they never mutate the underlying value and never apply
 * manual timezone offsets — `Intl.DateTimeFormat` renders the instant in the
 * viewer's local timezone. Use `formatDateTime` for event timestamps
 * (created/submitted/reviewed/...) and `formatDateOnly` for genuine date-only
 * business values (due dates, reporting periods, effective/expiry dates, DOB).
 */

export const DATE_TIME_PLACEHOLDER = '—';

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `08 Aug 2026, 12:34 pm` — event timestamps. Falls back to `—`. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  placeholder: string = DATE_TIME_PLACEHOLDER,
): string {
  const d = toDate(value);
  if (!d) return placeholder;
  try {
    return DATE_TIME_FMT.format(d);
  } catch {
    return placeholder;
  }
}

/** `08 Aug 2026` — date-only business values. Falls back to `—`. */
export function formatDateOnly(
  value: string | number | Date | null | undefined,
  placeholder: string = DATE_TIME_PLACEHOLDER,
): string {
  const d = toDate(value);
  if (!d) return placeholder;
  try {
    return DATE_FMT.format(d);
  } catch {
    return placeholder;
  }
}

/** ISO-8601 instants (with time) and plain ISO dates found inside free text. */
const ISO_INSTANT_RE = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const ISO_DATE_RE = /(?<![\d-])\d{4}-\d{2}-\d{2}(?![\d:T-])/g;

/**
 * Rewrites machine timestamps embedded in text (AI narrative, evidence values,
 * raw field dumps) into the same readable form used across list pages.
 * Non-timestamp text is returned untouched.
 */
export function humanizeTimestamps(text: string | null | undefined): string {
  if (!text) return text ?? '';
  return text
    .replace(ISO_INSTANT_RE, (m) => formatDateTime(m, m))
    .replace(ISO_DATE_RE, (m) => formatDateOnly(m, m));
}
