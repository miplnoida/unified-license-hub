import { useEffect, useState } from 'react';
import { checkEmailVerifiedOnServer } from '@/lib/registrationEmailVerified';
import { setRegistrationJourneyEmail } from '@/lib/registrationFileAccess';

/** Historical form/local verification markers never authorize a fresh upload. */
export function useRegistrationUploadVerification(email: string | undefined) {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const normalized = (email ?? '').trim().toLowerCase();
  const verified = !!normalized && verifiedEmail === normalized;
  useEffect(() => {
    let cancelled = false;
    setVerifiedEmail(null);
    setRegistrationJourneyEmail(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return;
    setChecking(true);
    checkEmailVerifiedOnServer(normalized, true).then(ok => {
      if (cancelled) return;
      setVerifiedEmail(ok ? normalized : null);
      setChecking(false);
    });
    return () => { cancelled = true; setRegistrationJourneyEmail(null); };
  }, [normalized]);
  useEffect(() => {
    setRegistrationJourneyEmail(verified ? normalized : null);
  }, [normalized, verified]);
  return { verified, checking, confirm: () => setVerifiedEmail(normalized) };
}