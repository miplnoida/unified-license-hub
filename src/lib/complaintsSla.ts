export type SlaStatus =
  | 'on_track'
  | 'at_risk'
  | 'breached'
  | 'resolved_on_time'
  | 'resolved_late'
  | 'unknown';

const KNOWN_STATES: readonly SlaStatus[] = [
  'on_track',
  'at_risk',
  'breached',
  'resolved_on_time',
  'resolved_late',
  'unknown',
];

/**
 * Compute SLA status for a complaint from its timestamps.
 * Matches the SQL implementation in `public.complaint_sla_status`:
 * - resolved AFTER due date → resolved_late
 * - resolved on/before due  → resolved_on_time
 * - past due unresolved     → breached
 * - within 2 days or bottom 25% of window remaining → at_risk
 * - otherwise               → on_track
 * - no due info             → unknown
 *
 * This is the ONLY place SLA math lives in the frontend. Callers should prefer
 * `slaBucketFromRow(row)` and let this helper stay internal.
 */
export function computeSlaStatus(
  created_at?: string | null,
  sla_due_at?: string | null,
  sla_days?: number | null,
  resolved_at?: string | null,
  now: Date = new Date(),
): SlaStatus {
  let due: Date | null = null;
  if (sla_due_at) due = new Date(sla_due_at);
  else if (created_at && sla_days) {
    due = new Date(new Date(created_at).getTime() + sla_days * 86400000);
  }
  if (resolved_at) {
    const r = new Date(resolved_at);
    if (due && r.getTime() > due.getTime()) return 'resolved_late';
    return 'resolved_on_time';
  }
  if (!due || isNaN(due.getTime())) return 'unknown';
  const msLeft = due.getTime() - now.getTime();
  if (msLeft < 0) return 'breached';
  const daysLeft = msLeft / 86400000;
  if (daysLeft <= 2) return 'at_risk';
  if (sla_days && sla_days > 0 && daysLeft / sla_days <= 0.25) return 'at_risk';
  return 'on_track';
}

/**
 * Normalize a legacy `resolved` value from the older server implementation to
 * `resolved_on_time` so UI enums stay consistent while the migration rolls
 * out.
 */
function normalizeLegacy(s: string): SlaStatus {
  if (s === 'resolved') return 'resolved_on_time';
  return (KNOWN_STATES as readonly string[]).includes(s) ? (s as SlaStatus) : 'unknown';
}

/**
 * Canonical entrypoint for components. Prefers the server-computed
 * `sla_status` returned by `list_complaints` / `get_complaint`; falls back to
 * the JS helper for optimistic UI on locally-mutated rows.
 */
export function slaBucketFromRow(row: {
  sla_status?: string | null;
  created_at?: string | null;
  sla_due_at?: string | null;
  sla_days?: number | null;
  resolved_at?: string | null;
} | null | undefined): SlaStatus {
  if (!row) return 'unknown';
  const server = row.sla_status;
  if (server) return normalizeLegacy(server);
  return computeSlaStatus(row.created_at, row.sla_due_at, row.sla_days, row.resolved_at);
}

export function slaStatusLabel(s: SlaStatus): string {
  switch (s) {
    case 'on_track': return 'On track';
    case 'at_risk': return 'At risk';
    case 'breached': return 'Breached';
    case 'resolved_on_time': return 'Resolved on time';
    case 'resolved_late': return 'Resolved late';
    default: return '—';
  }
}

export function slaStatusVariant(s: SlaStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'breached': return 'destructive';
    case 'resolved_late': return 'destructive';
    case 'at_risk': return 'outline';
    case 'on_track': return 'default';
    case 'resolved_on_time': return 'secondary';
    default: return 'outline';
  }
}

export const SLA_FILTER_OPTIONS: { value: SlaStatus; label: string }[] = [
  { value: 'on_track', label: 'On track' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'breached', label: 'Breached' },
  { value: 'resolved_on_time', label: 'Resolved on time' },
  { value: 'resolved_late', label: 'Resolved late' },
];
