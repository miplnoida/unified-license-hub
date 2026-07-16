export type SlaStatus = 'on_track' | 'at_risk' | 'breached' | 'resolved' | 'unknown';

/**
 * Compute SLA status for a complaint from its timestamps.
 * Matches the SQL implementation in `public.complaint_sla_status`:
 * - resolved AFTER due date → breached
 * - resolved on/before due → resolved
 * - past due unresolved     → breached
 * - within 2 days or bottom 25% of window remaining → at_risk
 * - otherwise               → on_track
 * - no due info             → unknown
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
    if (due && r.getTime() > due.getTime()) return 'breached';
    return 'resolved';
  }
  if (!due || isNaN(due.getTime())) return 'unknown';
  const msLeft = due.getTime() - now.getTime();
  if (msLeft < 0) return 'breached';
  const daysLeft = msLeft / 86400000;
  if (daysLeft <= 2) return 'at_risk';
  if (sla_days && sla_days > 0 && daysLeft / sla_days <= 0.25) return 'at_risk';
  return 'on_track';
}

export function slaStatusLabel(s: SlaStatus): string {
  switch (s) {
    case 'on_track': return 'On track';
    case 'at_risk': return 'At risk';
    case 'breached': return 'Breached';
    case 'resolved': return 'Resolved';
    default: return '—';
  }
}

export function slaStatusVariant(s: SlaStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'breached': return 'destructive';
    case 'at_risk': return 'outline';
    case 'on_track': return 'default';
    case 'resolved': return 'secondary';
    default: return 'outline';
  }
}
