/**
 * DCI-01 — canonical "is this still open?" predicates.
 *
 * The same business figure (open prudential actions, open escalations, open
 * complaints) is rendered on several screens. Screens must never invent their
 * own status allow-list, because a status value that nobody remembered to add
 * silently disappears from one KPI while still counting on another. These
 * predicates mirror, exactly, the server-side definitions used by the canonical
 * work-queue / dashboard RPCs:
 *
 *  - prudential actions   -> public.prudential_work_queue (SUPERVISORY_ACTION leg)
 *  - prudential escalations -> public.prudential_work_queue (ESCALATION leg)
 *  - complaints           -> public.complaints_dashboard_counts
 *
 * If a server definition changes, change it here in the same wave.
 */

/** Terminal prudential action statuses (canonical: NOT IN these = open). */
export const PRUDENTIAL_ACTION_TERMINAL_STATUSES = ['completed', 'waived', 'cancelled'] as const;

/** Canonical open prudential escalation statuses. */
export const PRUDENTIAL_ESCALATION_OPEN_STATUSES = ['open', 'under_review'] as const;

/** Terminal complaint statuses (canonical: NOT IN these = open). */
export const COMPLAINT_TERMINAL_STATUSES = ['closed', 'resolved'] as const;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export function isOpenPrudentialAction(status: unknown): boolean {
  const s = norm(status);
  return s.length > 0 && !(PRUDENTIAL_ACTION_TERMINAL_STATUSES as readonly string[]).includes(s);
}

export function isOverduePrudentialAction(status: unknown): boolean {
  const s = norm(status);
  return s === 'overdue' || s === 'breached';
}

export function isOpenPrudentialEscalation(status: unknown): boolean {
  return (PRUDENTIAL_ESCALATION_OPEN_STATUSES as readonly string[]).includes(norm(status));
}

export function isOpenComplaint(status: unknown): boolean {
  const s = norm(status);
  return s.length > 0 && !(COMPLAINT_TERMINAL_STATUSES as readonly string[]).includes(s);
}
