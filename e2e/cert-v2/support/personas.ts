/**
 * Certification identities (Wave 1.5c / Wave 2 fixtures).
 * Passwords are NEVER stored here — see certPassword().
 */
export const CERT_DOMAIN = '@mishainfotech.com';

export const persona = (role: string) => `${role}${CERT_DOMAIN}`;

export const PERSONAS = {
  superAdmin: persona('super_admin'),
  licensingOfficer: persona('licensing_officer'),
  licensingSupervisor: persona('licensing_supervisor'),
  returnsOfficer: persona('returns_officer'),
  returnsSupervisor: persona('returns_supervisor'),
  prudentialAnalyst: persona('prudential_analyst'),
  prudentialSupervisor: persona('prudential_supervisor'),
  complaintsOfficer: persona('complaints_officer'),
  complaintsSupervisor: persona('complaints_supervisor'),
  conductAnalyst: persona('conduct_analyst'),
  inspector: persona('inspector'),
  inspectionSupervisor: persona('inspection_supervisor'),
  enforcementOfficer: persona('enforcement_officer'),
  enforcementSupervisor: persona('enforcement_supervisor'),
  fitProperOfficer: persona('fit_proper_officer'),
  fitProperSupervisor: persona('fit_proper_supervisor'),
  entityResolutionOfficer: persona('entity_resolution_officer'),
  entityResolutionSupervisor: persona('entity_resolution_supervisor'),
  auditor: persona('auditor'),
  readOnly: persona('read_only'),
  notificationAdmin: persona('notification_administrator'),
  securityAdmin: persona('security_administrator'),
  applicant: persona('applicant_user'),
  preLicensee: persona('pre_licensee_user'),
  licenseePrimary: persona('licensee_primary_user'),
  licenseeSecondary: persona('licensee_secondary_user'),
  entityPpoc: persona('entity_ppoc'),
} as const;

export type PersonaKey = keyof typeof PERSONAS;

export function certPassword(): string {
  const pw = process.env.CERT_V2_DEFAULT_PASSWORD;
  if (!pw) {
    throw new Error('CERT_V2_DEFAULT_PASSWORD is not set in the runtime environment');
  }
  return pw;
}
