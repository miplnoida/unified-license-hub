/**
 * Registration approval status mapping.
 *
 * Mirrors the real status values used by `public.registrations.status` (see
 * `perform_registration_workflow_transition`):
 *   pending_verification | pending_review | in_progress |
 *   resubmission_required | approved | rejected
 */
export type RegistrationCategory =
  | 'approved'
  | 'pending'
  | 'in_review'
  | 'correction'
  | 'rejected'
  | 'missing'
  | 'unverified';

export const APPROVED_STATUSES = new Set(['approved', 'final_approved', 'active', 'validated']);
export const PENDING_STATUSES = new Set(['submitted', 'pending', 'pending_review']);
export const IN_REVIEW_STATUSES = new Set(['under_review', 'in_progress', 'in_review']);
export const CORRECTION_STATUSES = new Set([
  'returned_for_correction',
  'resubmission_requested',
  'resubmission_required',
  'info_requested',
  'more_info_requested',
  'query_raised',
]);
export const REJECTED_STATUSES = new Set(['rejected']);
export const UNVERIFIED_STATUSES = new Set(['pending_verification']);

export function categorizeRegistrationStatus(
  status: string | null | undefined,
): RegistrationCategory {
  if (!status) return 'missing';
  const s = status.toLowerCase();
  if (APPROVED_STATUSES.has(s)) return 'approved';
  if (REJECTED_STATUSES.has(s)) return 'rejected';
  if (CORRECTION_STATUSES.has(s)) return 'correction';
  if (UNVERIFIED_STATUSES.has(s)) return 'unverified';
  if (IN_REVIEW_STATUSES.has(s)) return 'in_review';
  if (PENDING_STATUSES.has(s)) return 'pending';
  return 'pending';
}

export const REGISTRATION_STATUS_MESSAGES: Record<RegistrationCategory, { title: string; description: string }> = {
  approved: {
    title: 'Registration Approved',
    description: 'Your registration has been approved. You can now access the portal.',
  },
  pending: {
    title: 'Pending Approval',
    description:
      'Your registration is submitted and pending approval. You will be able to access the portal once it is approved.',
  },
  in_review: {
    title: 'Under Review',
    description: 'Your registration is currently under review by the regulator.',
  },
  rejected: {
    title: 'Registration Rejected',
    description: 'Your registration has been rejected. Please review the remarks below.',
  },
  correction: {
    title: 'Action Required',
    description:
      'Your registration was returned for correction or more information was requested. Please update and resubmit.',
  },
  unverified: {
    title: 'Email Verification Pending',
    description: 'Please verify your email to continue. After verification, your registration will be reviewed.',
  },
  missing: {
    title: 'Registration Not Found',
    description:
      'We could not find an approved registration for this account. Please contact support.',
  },
};

export function isApprovedCategory(c: RegistrationCategory): boolean {
  return c === 'approved';
}
