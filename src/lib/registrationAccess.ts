/**
 * Central registration access service — single source of truth for
 * "can this user enter the portal?" decisions.
 *
 * Built on top of the existing status mapping in `registrationStatus.ts`
 * (which mirrors the real values written by
 * `perform_registration_workflow_transition`:
 * pending_verification | pending_review | in_progress |
 * resubmission_required | approved | rejected).
 *
 * Consumers:
 *  - `useRegistrationApprovalStatus` (route gate in `routeHelpers.tsx`)
 *  - `RegistrationStatusPage`
 *  - tests verifying workflow → frontend access integration
 */
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, type AppRole } from '@/types/platform';
import {
  categorizeRegistrationStatus,
  isApprovedCategory,
  REGISTRATION_STATUS_MESSAGES,
  type RegistrationCategory,
} from '@/lib/registrationStatus';

export interface RegistrationRecord {
  id: string;
  status: string | null;
  registration_reference: string | null;
  created_at: string | null;
  updated_at: string | null;
  remarks?: string | null;
}

export interface RegistrationAccessStatus {
  allowed: boolean;
  category: RegistrationCategory | 'internal_user';
  message: string;
  title: string;
  registration: RegistrationRecord | null;
  actionLabel?: string;
  actionUrl?: string;
}

/** Re-export the canonical status classifier. */
export const classifyRegistrationStatus = categorizeRegistrationStatus;

/** True when a raw registration status grants portal access. */
export function canAccessPortalForRegistration(status: string | null | undefined): boolean {
  return isApprovedCategory(categorizeRegistrationStatus(status));
}

/** True when the role is internal staff (never blocked by the gate). */
export function isInternalUser(role: AppRole | string | null | undefined): boolean {
  return !!role && (INTERNAL_ROLES as string[]).includes(role);
}

/** Per-category next action shown on the status page / login messaging. */
const CATEGORY_ACTIONS: Partial<Record<RegistrationCategory, { actionLabel: string; actionUrl: string }>> = {
  approved: { actionLabel: 'Continue to Dashboard', actionUrl: '/dashboard' },
  correction: { actionLabel: 'Update & Resubmit', actionUrl: '/registration/pre-licensee' },
  unverified: { actionLabel: 'Continue Verification', actionUrl: '/registration/pre-licensee' },
};

/** Build the structured access decision from a registration record. */
export function buildAccessStatus(
  registration: RegistrationRecord | null,
  role?: AppRole | string | null,
): RegistrationAccessStatus {
  if (isInternalUser(role)) {
    return {
      allowed: true,
      category: 'internal_user',
      title: 'Internal User',
      message: 'Internal staff are not subject to registration approval.',
      registration: null,
    };
  }
  const category = categorizeRegistrationStatus(registration?.status);
  const msg = REGISTRATION_STATUS_MESSAGES[category];
  const action = CATEGORY_ACTIONS[category];
  return {
    allowed: !!registration && isApprovedCategory(category),
    category,
    title: msg.title,
    message: msg.description,
    registration,
    ...(action ?? {}),
  };
}

export function getRegistrationStatusMessage(
  access: RegistrationAccessStatus,
): { title: string; description: string } {
  return { title: access.title, description: access.message };
}

/**
 * Fetch the latest registration for an auth user (linked via
 * `registrations.user_id = auth.uid()` — enforced by RLS policy
 * "Users can read own registrations") and return the access decision.
 */
export async function getRegistrationAccessStatus(
  userId: string,
  role?: AppRole | string | null,
): Promise<RegistrationAccessStatus> {
  if (isInternalUser(role)) return buildAccessStatus(null, role);

  const { data: reg, error } = await supabase
    .from('registrations')
    .select('id, status, registration_reference, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!reg) return buildAccessStatus(null, role);

  let remarks: string | null = null;
  try {
    const { data: actions } = await supabase
      .from('approval_actions')
      .select('comments, created_at')
      .eq('entity_type', 'registration')
      .eq('entity_id', reg.id)
      .order('created_at', { ascending: false })
      .limit(1);
    remarks = actions?.[0]?.comments ?? null;
  } catch {
    /* remarks best-effort */
  }
  return buildAccessStatus({ ...reg, remarks }, role);
}

/**
 * Status the backend workflow writes for each admin action
 * (mirrors `perform_registration_workflow_transition`). Used by
 * integration tests to prove workflow actions map to access decisions.
 */
export function workflowActionResultStatus(
  action: 'approve' | 'reject' | 'send_back' | 'escalate' | 'request_resubmission',
  isLastStep: boolean,
): string {
  switch (action) {
    case 'approve':
      return isLastStep ? 'approved' : 'in_progress';
    case 'reject':
      return 'rejected';
    case 'request_resubmission':
      return 'resubmission_required';
    default:
      return 'in_progress';
  }
}
