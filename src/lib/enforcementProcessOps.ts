/**
 * EPR-03 — governed Enforcement process operations (P11).
 *
 * Enforcement is an independent regulatory process. Every referral into it and
 * every lifecycle transition inside it runs through one of two server-owned
 * operations:
 *
 *  - `enforcement_referral_create` validates the source record, derives the
 *    regulated entity from it (never from the browser), checks referral
 *    authority and opens the case at the REFERRAL stage;
 *  - `enforcement_case_action` reads the configured stage model, checks the
 *    caller's enforcement authority, enforces rationale / evidence /
 *    maker-checker rules, records the stage-specific facts, writes the case
 *    timeline and the compliance audit trail.
 *
 * The browser holds no lifecycle rules and never writes `enforcement_actions`
 * or `enforcement_case_events` directly. Complaint workflow RPCs are not used.
 */
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Every source a regulatory consequence can legitimately come from. */
export type EnforcementSourceKind =
  | 'COMPLAINT'
  | 'CONDUCT_INVESTIGATION'
  | 'THEMATIC_FINDING'
  | 'PRUDENTIAL_BREACH'
  | 'PRUDENTIAL_ACTION'
  | 'EXAMINATION_FINDING'
  | 'LICENSING_VIOLATION'
  | 'FP_MATTER'
  | 'MANUAL_REFERRAL';

export const ENFORCEMENT_SOURCE_LABEL: Record<EnforcementSourceKind, string> = {
  COMPLAINT: 'Complaint',
  CONDUCT_INVESTIGATION: 'Conduct investigation',
  THEMATIC_FINDING: 'Thematic review finding',
  PRUDENTIAL_BREACH: 'Prudential threshold breach',
  PRUDENTIAL_ACTION: 'Prudential supervisory action',
  EXAMINATION_FINDING: 'Examination finding',
  LICENSING_VIOLATION: 'Licensing matter',
  FP_MATTER: 'Fit and proper matter',
  MANUAL_REFERRAL: 'Manual referral',
};

export interface EnforcementReferralInput {
  sourceKind: EnforcementSourceKind;
  /** Primary key of the source record. The entity is derived from it server-side. */
  sourceId: string;
  referralReason: string;
  enforcementType?: string | null;
  legalBasis?: string | null;
  severity?: 'critical' | 'high' | 'medium' | 'low' | null;
  assignedTo?: string | null;
  assignedTeam?: string | null;
  description?: string | null;
}

/** Refer a source matter into the Enforcement process. Returns the new case id. */
export async function enforcementReferralCreate(input: EnforcementReferralInput): Promise<string> {
  const { data, error } = await sb.rpc('enforcement_referral_create', {
    _payload: {
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      referral_reason: input.referralReason,
      enforcement_type: input.enforcementType ?? null,
      legal_basis: input.legalBasis ?? null,
      severity: input.severity ?? null,
      assigned_to: input.assignedTo ?? null,
      assigned_team: input.assignedTeam ?? null,
      description: input.description ?? null,
    },
  });
  return unwrap(data, error) as string;
}

export interface EnforcementActionResult {
  case_id: string;
  action: string;
  from_stage: string;
  to_stage: string;
}

/** Execute one configured Enforcement transition or record-keeping action. */
export async function enforcementCaseAction(
  caseId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<EnforcementActionResult> {
  const { data, error } = await sb.rpc('enforcement_case_action', {
    _case_id: caseId,
    _action: action,
    _payload: payload,
  });
  return unwrap(data, error) as EnforcementActionResult;
}
