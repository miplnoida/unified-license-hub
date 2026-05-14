import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type EmailUniquenessStatus = 'idle' | 'checking' | 'available' | 'taken';

/**
 * Debounced uniqueness check for the primary user email used at registration.
 * Checks across registrations, profiles, and auth.users via a SECURITY DEFINER RPC.
 */
export function usePrimaryUserEmailUniqueness(email: string) {
  const [status, setStatus] = useState<EmailUniquenessStatus>('idle');
  const value = (email || '').trim().toLowerCase();

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

  return { status, value };
}
