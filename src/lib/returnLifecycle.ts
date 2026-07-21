/**
 * Canonical submitted / post-submission return status allow-list.
 *
 * Used everywhere access decisions depend on whether a return has cleared
 * intake: the permission hook (assignment-only regulator gate), Return Queue
 * filters, Return Detail read gate, attachment/storage helpers, dashboards,
 * reports/exports, and the SQL side (mirror this list in
 * `public.return_status_is_submitted_lifecycle`).
 *
 * Anything NOT in this list — TEMP, WIP, draft, incomplete, pending
 * submission, due-soon, null, unknown — is denied to assignment-only users
 * and treated as "pre-submission" everywhere else.
 */
export const SUBMITTED_LIFECYCLE_STATUSES = [
  'submitted',
  'under_review',
  'in_review',
  'reviewed',
  'approved',
  'accepted',
  'rejected',
  'returned',
  'resubmission_required',
  'closed',
  'archived',
] as const;

export type SubmittedLifecycleStatus = (typeof SUBMITTED_LIFECYCLE_STATUSES)[number];

const NORMALIZED = new Set<string>(SUBMITTED_LIFECYCLE_STATUSES.map((s) => s.toLowerCase()));

/** True if the given status counts as "submitted or later". */
export function isSubmittedLifecycle(status?: string | null): boolean {
  if (!status) return false;
  return NORMALIZED.has(String(status).trim().toLowerCase());
}
