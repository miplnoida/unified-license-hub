import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RegField, RegFormSchema } from '@/types/registrationForm';

export type EmailUniquenessStatus = 'idle' | 'checking' | 'available' | 'taken';

const COMMON_EMAIL_KEYS = [
  'email',
  'contact_email',
  'applicant_email',
  'user_email',
  'primary_email',
  'email_address',
];

/** Resolve the dynamic field that represents the primary email in a schema. */
export function resolvePrimaryEmailField(schema?: RegFormSchema | null): RegField | null {
  if (!schema) return null;
  const all = schema.flatMap(s => s.rows.flatMap(r => r.columns.map(c => c.field).filter(Boolean) as RegField[]));
  return (
    all.find(f => COMMON_EMAIL_KEYS.includes(f.fieldName)) ||
    all.find(f => f.type === 'email') ||
    null
  );
}

/**
 * Debounced uniqueness check for the primary user email used at registration.
 * Checks across registrations, profiles, and auth.users via a SECURITY DEFINER RPC.
 * Optionally resolves the dynamic field name so callers can show inline errors.
 */
export function usePrimaryUserEmailUniqueness(email: string, schema?: RegFormSchema | null) {
  const [status, setStatus] = useState<EmailUniquenessStatus>('idle');
  const value = (email || '').trim().toLowerCase();
  const field = useMemo(() => resolvePrimaryEmailField(schema), [schema]);
  const fieldName = field?.fieldName;

  useEffect(() => {
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc(
          'check_primary_user_email_exists' as any,
          { p_email: value },
        );
        if (error) { setStatus('idle'); return; }
        setStatus(data === true ? 'taken' : 'available');
      } catch {
        setStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [value]);

  return { status, value, fieldName, field };
}
