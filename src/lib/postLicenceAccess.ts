/**
 * Post-licence services belong to a licensed institution's portal users
 * (Primary / Secondary / PPOC). Pre-licensee and applicant accounts keep their
 * pre-licence journey only, even after their application produced a licence —
 * the licence is then operated through the institution's Primary User account.
 */
const LICENSEE_ROLES = new Set([
  'licensee_primary', 'licensee_secondary', 'licensee_primary_user',
  'licensee_secondary_user', 'regulated_entity_user', 'entity_ppoc',
]);

export function canUsePostLicenceServices(input: {
  role?: string | null;
  userType?: string | null;
  licenseeId?: string | null;
  isPpoc?: boolean;
}): boolean {
  const role = String(input.role || '').toLowerCase();
  if (LICENSEE_ROLES.has(role)) return true;
  if (input.isPpoc) return true;
  // Applicant accounts never file post-licence requests, even if their
  // profile was later linked to the licence they obtained.
  if (role === 'pre_licensee' || role === 'applicant') return false;
  const type = String(input.userType || '').toLowerCase();
  if (type === 'primary' || type === 'secondary') return true;
  return !!input.licenseeId;
}

/** Keyword sets used to preselect a key-person service from My Institution. */
export const KEY_PERSON_SERVICE_HINTS: Record<string, RegExp> = {
  appoint: /appoint(ment)?.*(director|senior management)|director appointment|key function holder|senior management|compliance officer|mlro/i,
  resign: /resign|removal of director/i,
};

export function pickKeyPersonService<T extends { id: string; name: string }>(services: T[], kind: string | null): T | undefined {
  const re = kind ? KEY_PERSON_SERVICE_HINTS[kind] : undefined;
  if (!re) return undefined;
  if (kind === 'appoint') {
    return services.find((s) => /appoint.*director|director appointment/i.test(s.name)) ?? services.find((s) => re.test(s.name));
  }
  return services.find((s) => re.test(s.name));
}
