import { supabase } from '@/integrations/supabase/client';

/**
 * Shared primitives for the Fit & Proper "Request Declaration" flow — used by
 * RequestDeclarationDialog.tsx and FpaDeclarations.tsx so token/verification-
 * hash generation and entity lookup have exactly one implementation.
 */

export async function generateToken(): Promise<{ raw: string; hash: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const raw = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hash };
}

export async function computeVerificationHash(dob: string, last4: string): Promise<string> {
  const input = `${dob}|${last4.toUpperCase()}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The portal's identity gate accepts either the national ID's or the
 * passport's last 4 digits — `primary` is whichever document is on file,
 * `alt` the second one's hash when both are, so declaration_invitations can
 * store both and verify_declaration_identity() can match either. Returns
 * `primary: null` when neither document (plus DOB) is usable, meaning the
 * caller must fall back to a manually-entered value instead.
 */
export async function computeIdentityHashes(
  dob: string | null | undefined,
  nationalId: string | null | undefined,
  passportNumber: string | null | undefined,
): Promise<{ primary: string | null; alt: string }> {
  const natLast4 = nationalId && nationalId.length >= 4 ? nationalId.slice(-4) : null;
  const passLast4 = passportNumber && passportNumber.length >= 4 ? passportNumber.slice(-4) : null;
  if (!dob || (!natLast4 && !passLast4)) return { primary: null, alt: '' };

  const natHash = natLast4 ? await computeVerificationHash(dob, natLast4) : null;
  const passHash = passLast4 ? await computeVerificationHash(dob, passLast4) : null;
  return { primary: (natHash ?? passHash)!, alt: natHash && passHash ? passHash : '' };
}

/** The licensee/entity an assessment concerns, if any — via its own licensee_id
 *  or, failing that, the fp_individual_role it was raised against. */
export async function getAssessmentEntityName(assessmentId: string): Promise<string | null> {
  const { data: a } = await supabase
    .from('fp_assessments')
    .select('licensee_id, role_id')
    .eq('id', assessmentId)
    .maybeSingle();
  let licenseeId = (a as any)?.licensee_id ?? null;
  if (!licenseeId && (a as any)?.role_id) {
    const { data: role } = await supabase
      .from('fp_individual_roles')
      .select('licensee_id')
      .eq('id', (a as any).role_id)
      .maybeSingle();
    licenseeId = role?.licensee_id ?? null;
  }
  if (!licenseeId) return null;
  const { data: lic } = await supabase.from('licensees').select('name').eq('id', licenseeId).maybeSingle();
  return lic?.name ?? null;
}
