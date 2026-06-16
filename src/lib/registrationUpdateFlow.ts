import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { DocumentMeta, RegistrationFormData } from '@/hooks/useRegistrationForm';

export const REGISTRATION_UPDATE_PATH = '/update-registration-form';

export const SUBMISSION_STATUS_PRIORITY: Record<string, number> = {
  resubmission_requested: 0,
  needs_changes: 1,
  rejected: 2,
  draft: 3,
  submitted: 4,
  under_review: 5,
  completed: 6,
};

export interface RegistrationUpdateRecord {
  id: string;
  user_id: string;
  sector_id: string;
  sub_sector_id: string;
  category_id: string;
  applicant_name: string;
  applicant_name_alt: string | null;
  registration_number: string | null;
  mailing_address: Json;
  physical_address: Json;
  same_as_mailing: boolean;
  entity_specific_data: Json | null;
  documents_metadata: Json | null;
  first_name: string;
  last_name: string;
  telephone: string;
  email: string;
  username: string | null;
  status: string;
  registration_reference: string | null;
  created_at: string | null;
  updated_at: string | null;
  terms_accepted: boolean | null;
}

export interface RegistrationSubmissionRecord {
  id: string;
  registration_id: string;
  user_id: string;
  form_id: string;
  form_data: Json;
  status: string;
  updated_at: string;
}

export interface RegistrationResolveParams {
  registrationId?: string | null;
  submissionId?: string | null;
  formId?: string | null;
}

export interface ResolvedRegistrationUpdate {
  registration: RegistrationUpdateRecord;
  submission: RegistrationSubmissionRecord | null;
  formId: string | null;
  remarks: string | null;
}

function statusRank(status: string | null | undefined): number {
  return SUBMISSION_STATUS_PRIORITY[String(status || '').toLowerCase()] ?? 99;
}

export function getPreferredSubmission<T extends { status: string; updated_at: string }>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const pa = statusRank(a.status);
    const pb = statusRank(b.status);
    if (pa !== pb) return pa - pb;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  })[0];
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isEffectivelyEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.keys(v).length === 0;
  return false;
}

export function deepMergeRegistrationData<T extends Record<string, unknown>>(
  existing: T | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): T {
  const base: Record<string, unknown> = { ...(existing || {}) };
  if (!incoming) return base as T;
  for (const key of Object.keys(incoming)) {
    const next = incoming[key];
    if (next === undefined) continue;
    const prev = base[key];
    if (isPlainObject(prev) && isPlainObject(next)) {
      base[key] = deepMergeRegistrationData(prev, next);
    } else {
      base[key] = next;
    }
  }
  return base as T;
}

export function guardAgainstBlankOverwrite(
  existing: unknown,
  incoming: unknown,
  context: string,
): void {
  if (!isEffectivelyEmpty(existing) && isEffectivelyEmpty(incoming)) {
    const message = `Refusing to overwrite existing ${context} with empty data`;
    console.warn(`[registration] ${message}`, { existing, incoming });
    throw new Error(message);
  }
}

export function documentKey(doc: Pick<DocumentMeta, 'label' | 'name'> & { documentKey?: string }): string {
  return String(doc.documentKey || doc.label || doc.name || 'document')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function dedupeDocuments(documents: DocumentMeta[] | null | undefined): DocumentMeta[] {
  const map = new Map<string, DocumentMeta>();
  for (const doc of documents || []) {
    map.set(documentKey(doc), doc);
  }
  return Array.from(map.values());
}

export function buildUpdateRegistrationUrl(registrationId?: string | null, submissionId?: string | null): string {
  const qs = new URLSearchParams();
  if (registrationId) qs.set('registration', registrationId);
  if (submissionId) qs.set('submission', submissionId);
  const suffix = qs.toString();
  return suffix ? `${REGISTRATION_UPDATE_PATH}?${suffix}` : REGISTRATION_UPDATE_PATH;
}

export function registrationToFormData(registration: RegistrationUpdateRecord): RegistrationFormData {
  const entitySpecificData = isPlainObject(registration.entity_specific_data)
    ? registration.entity_specific_data as Record<string, string>
    : {};
  return {
    sectorId: registration.sector_id || '',
    subSectorId: registration.sub_sector_id || '',
    categoryId: registration.category_id || '',
    applicantName: registration.applicant_name || '',
    applicantNameAlt: registration.applicant_name_alt || '',
    registrationNumber: registration.registration_number || '',
    mailingAddress: isPlainObject(registration.mailing_address) ? registration.mailing_address as any : { street: '', city: '', state: '', country: '' },
    physicalAddress: isPlainObject(registration.physical_address) ? registration.physical_address as any : { street: '', city: '', state: '', country: '' },
    sameAsMailing: !!registration.same_as_mailing,
    entitySpecificData,
    firstName: registration.first_name || '',
    lastName: registration.last_name || '',
    telephone: registration.telephone || '',
    email: registration.email || '',
    username: registration.username || '',
    password: '',
    confirmPassword: '',
    documents: dedupeDocuments((registration.documents_metadata as unknown as DocumentMeta[]) || []),
    termsAccepted: !!registration.terms_accepted,
    privacyAccepted: !!registration.terms_accepted,
    dataProtectionAccepted: !!registration.terms_accepted,
    captchaChecked: true,
    emailVerified: true,
  };
}

async function resolveRegistration(userId: string, registrationId?: string | null): Promise<RegistrationUpdateRecord | null> {
  if (registrationId) {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('id', registrationId)
      .maybeSingle();
    if (error) throw error;
    if (data && (data as any).user_id === userId) return data as RegistrationUpdateRecord;
    return null;
  }

  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as RegistrationUpdateRecord | null) ?? null;
}

async function fetchLatestRemarks(registrationId: string): Promise<string | null> {
  const { data } = await supabase
    .from('approval_actions')
    .select('comments, created_at')
    .eq('entity_type', 'registration')
    .eq('entity_id', registrationId)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0]?.comments ?? null;
}

export async function resolveRegistrationSubmission({
  userId,
  registrationId,
  submissionId,
  formId,
}: RegistrationResolveParams & { userId: string }): Promise<RegistrationSubmissionRecord | null> {
  if (submissionId) {
    const { data, error } = await supabase
      .from('registration_form_submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle();
    if (error) throw error;
    if (data && (data as any).user_id === userId) return data as RegistrationSubmissionRecord;
  }

  if (registrationId && formId) {
    const { data, error } = await supabase
      .from('registration_form_submissions')
      .select('*')
      .eq('registration_id', registrationId)
      .eq('form_id', formId);
    if (error) throw error;
    const picked = getPreferredSubmission((data || []) as RegistrationSubmissionRecord[]);
    if (picked) return picked;
  }

  if (registrationId) {
    const { data, error } = await supabase
      .from('registration_form_submissions')
      .select('*')
      .eq('registration_id', registrationId);
    if (error) throw error;
    const picked = getPreferredSubmission((data || []) as RegistrationSubmissionRecord[]);
    if (picked) return picked;
  }

  if (formId) {
    const { data, error } = await supabase
      .from('registration_form_submissions')
      .select('*')
      .eq('user_id', userId)
      .eq('form_id', formId);
    if (error) throw error;
    return getPreferredSubmission((data || []) as RegistrationSubmissionRecord[]);
  }

  return null;
}

export async function resolveCurrentRegistrationForUser(
  userId: string,
  params: RegistrationResolveParams,
): Promise<ResolvedRegistrationUpdate | null> {
  const registration = await resolveRegistration(userId, params.registrationId);
  if (!registration) return null;
  const submission = await resolveRegistrationSubmission({
    userId,
    registrationId: registration.id,
    submissionId: params.submissionId,
    formId: params.formId,
  });
  return {
    registration,
    submission,
    formId: params.formId || submission?.form_id || null,
    remarks: await fetchLatestRemarks(registration.id),
  };
}