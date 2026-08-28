import { useMemo } from 'react';
import type { RegField, RegFormSchema } from '@/types/registrationForm';

export type ApplicantNameStatus = 'idle' | 'checking' | 'available' | 'taken';

/**
 * Resolve the dynamic field that represents the Applicant Name within a
 * registration form schema. Priority:
 *   1. A field whose validation.uniqueApplicantName === true
 *   2. A field whose fieldName === 'applicant_name'
 */
export function resolveApplicantNameField(schema?: RegFormSchema): RegField | null {
  if (!schema) return null;
  const all = schema.flatMap(s => s.rows.flatMap(r => r.columns.map(c => c.field).filter(Boolean) as RegField[]));
  return (
    all.find(f => f.validation?.uniqueApplicantName) ||
    all.find(f => f.fieldName === 'applicant_name') ||
    null
  );
}

/**
 * Applicant-name field resolution for the public registration form.
 *
 * F3-B2: the pre-authentication existence probe was **retired**. It called
 * `check_applicant_name_exists` from an unauthenticated page, which is an
 * applicant/entity-name enumeration oracle (GAP-F3-14); anon EXECUTE on that
 * routine is revoked, so the call could only ever fail. Duplicate and
 * entity-resolution authority now lives entirely server-side (governed intake
 * + `registrations` uniqueness/binding rules), and the applicant sees a neutral
 * message at submission time if the server detects a duplicate or a resolution
 * requirement.
 *
 * The hook remains as the single source of applicant-name field resolution;
 * `status` is intentionally always `idle` (no client-side existence signal).
 */
export function useApplicantNameUniqueness(
  schema: RegFormSchema | undefined,
  _data: Record<string, unknown>,
) {
  const field = useMemo(() => resolveApplicantNameField(schema), [schema]);
  const fieldName = field?.fieldName;
  const status: ApplicantNameStatus = 'idle';
  return { status, fieldName, field, value: '' };
}
