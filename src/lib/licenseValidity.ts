/**
 * Single source of truth for license validity + renewal eligibility.
 *
 * Business rules:
 *  - The grace period EXTENDS license validity. During grace, the license is
 *    still usable; renewal is NOT yet available.
 *  - Renewal opens only once the grace period has fully ended.
 *  - After grace ends, renewal stays available indefinitely.
 *
 * All date math normalizes to start-of-day so the flip happens at midnight
 * local time consistently across the app, regardless of which screen is
 * computing it.
 */

export interface LicenseValidityInput {
  status?: string | null;
  valid_until?: string | null;
  grace_period_days?: number | null;
}

export type EffectiveLicenseStatus =
  | 'active'
  | 'active_grace'
  | 'expired'
  | 'suspended'
  | 'revoked'
  | 'cancelled'
  | 'inactive'
  | 'pending'
  | string;

export interface LicenseValidity {
  status_raw: string;
  effective_status: EffectiveLicenseStatus;
  valid_until_ms: number | null;
  grace_ends_on_ms: number | null;
  /** ISO date string (YYYY-MM-DD) for grace end, or null when not applicable. */
  grace_ends_on: string | null;
  /** Days until valid_until (start-of-day delta). Negative once expired. Null when no valid_until. */
  days_until_expiry: number | null;
  /** Past valid_until but still inside the grace window. */
  in_grace_period: boolean;
  /** Grace fully elapsed (or no grace and past validity / status flagged expired). */
  is_past_grace: boolean;
  /** Renewal allowed (= is_past_grace). */
  can_renew: boolean;
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseDayMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return startOfDay(new Date(t));
}

function isoDay(ms: number | null): string | null {
  if (ms === null) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

const BLOCKING_STATUSES = new Set(['suspended', 'revoked', 'cancelled', 'canceled', 'inactive']);

export function getLicenseValidity(input: LicenseValidityInput): LicenseValidity {
  const status_raw = String(input.status || '').toLowerCase() || 'pending';
  const graceDays = Math.max(0, Number(input.grace_period_days) || 0);
  const validUntilMs = parseDayMs(input.valid_until);
  const todayMs = startOfDay(new Date());

  const graceEndsMs = validUntilMs !== null ? validUntilMs + graceDays * 86_400_000 : null;
  const daysUntilExpiry = validUntilMs !== null
    ? Math.ceil((validUntilMs - todayMs) / 86_400_000)
    : null;

  const inGrace = validUntilMs !== null
    && graceEndsMs !== null
    && validUntilMs < todayMs
    && graceEndsMs >= todayMs;

  const pastGraceByDate = graceEndsMs !== null && graceEndsMs < todayMs;
  // If status already says expired but there is no grace configured, treat as past grace.
  const pastGraceByStatus = status_raw === 'expired' && graceDays === 0;
  const isPastGrace = pastGraceByDate || pastGraceByStatus;

  let effective_status: EffectiveLicenseStatus = status_raw;
  if (BLOCKING_STATUSES.has(status_raw)) {
    effective_status = status_raw;
  } else if (inGrace) {
    effective_status = 'active_grace';
  } else if (isPastGrace) {
    effective_status = 'expired';
  } else if (status_raw === 'active' || status_raw === 'issued' || status_raw === 'valid') {
    effective_status = 'active';
  }

  return {
    status_raw,
    effective_status,
    valid_until_ms: validUntilMs,
    grace_ends_on_ms: graceEndsMs,
    grace_ends_on: isoDay(graceEndsMs),
    days_until_expiry: daysUntilExpiry,
    in_grace_period: inGrace,
    is_past_grace: isPastGrace,
    can_renew: isPastGrace,
  };
}
