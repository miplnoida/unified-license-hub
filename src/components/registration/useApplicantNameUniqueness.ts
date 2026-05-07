import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
 * Debounced uniqueness check for the dynamic Applicant Name field.
 * Returns the current status and the resolved field's name (so callers can
 * display errors against the right key).
 */
export function useApplicantNameUniqueness(
  schema: RegFormSchema | undefined,
  data: Record<string, unknown>,
) {
  const field = useMemo(() => resolveApplicantNameField(schema), [schema]);
  const fieldName = field?.fieldName;
  const value = fieldName ? String(data[fieldName] ?? '').trim() : '';
  const [status, setStatus] = useState<ApplicantNameStatus>('idle');

  useEffect(() => {
    if (!fieldName || !value) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data: exists, error } = await supabase.rpc(
          'check_applicant_name_exists' as any,
          { p_name: value },
        );
        if (error) { setStatus('idle'); return; }
        setStatus(exists === true ? 'taken' : 'available');
      } catch {
        setStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fieldName, value]);

  return { status, fieldName, field, value };
}
