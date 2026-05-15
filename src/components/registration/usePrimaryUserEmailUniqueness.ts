import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RegFormSchema } from '@/types/registrationForm';
import { normalizeEmailValue, isValidEmail, resolvePrimaryEmailField } from '@/lib/primaryEmailValidation';

export type EmailUniquenessStatus = 'idle' | 'checking' | 'available' | 'taken';

/**
 * Debounced uniqueness check for the primary user email used at registration.
 * Checks across registrations, profiles, and auth.users via a SECURITY DEFINER RPC.
 * Optionally resolves the dynamic field name so callers can show inline errors.
 */
export function usePrimaryUserEmailUniqueness(email: string, schema?: RegFormSchema | null) {
  const [status, setStatus] = useState<EmailUniquenessStatus>('idle');
  const value = normalizeEmailValue(email);
  const field = useMemo(() => resolvePrimaryEmailField(schema), [schema]);
  const fieldName = field?.fieldName;

  useEffect(() => {
    if (!value || !isValidEmail(value)) {
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
