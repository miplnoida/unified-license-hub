import { useEffect, useRef, useState } from 'react';
import {
  checkEmailVerifiedOnServer,
  clearEmailVerifiedLocally,
  isEmailVerifiedLocally,
  markEmailVerifiedLocally,
  normalizeVerificationEmail,
} from '@/lib/registrationEmailVerified';

interface Options {
  /** Resolved login email that must be verified. */
  email?: string | null;
  /** Current verified flag from form state. */
  verified: boolean;
  /** Setter used to write the flag back into form state. */
  setVerified: (value: boolean) => void;
  /** Skip entirely (update mode / OTP disabled). */
  enabled?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Keeps `emailVerified` in sync with the persisted marker and the server, for
 * the resolved login email — independent of which registration step is on
 * screen. This is what stops a later step (or a refresh) from wrongly demanding
 * re-verification. Changing the email resets verification, as before.
 */
export function useEmailVerificationStatus({ email, verified, setVerified, enabled = true }: Options) {
  const [hydrating, setHydrating] = useState(false);
  const previousEmailRef = useRef<string>('');

  const resolved = normalizeVerificationEmail(email);
  const valid = EMAIL_RE.test(resolved);

  useEffect(() => {
    if (!enabled) return;
    if (!resolved || !valid) {
      previousEmailRef.current = resolved;
      return;
    }

    const previous = previousEmailRef.current;
    if (previous && previous !== resolved) {
      clearEmailVerifiedLocally(previous);
      if (verified) setVerified(false);
    }
    previousEmailRef.current = resolved;

    if (isEmailVerifiedLocally(resolved)) {
      if (!verified) setVerified(true);
      setHydrating(false);
      return;
    }

    if (verified) {
      // Verified in this session — persist so a refresh keeps it.
      markEmailVerifiedLocally(resolved);
      setHydrating(false);
      return;
    }

    let cancelled = false;
    setHydrating(true);
    (async () => {
      const isVerified = await checkEmailVerifiedOnServer(resolved);
      if (cancelled) return;
      if (isVerified) {
        markEmailVerifiedLocally(resolved);
        setVerified(true);
      }
      setHydrating(false);
    })();

    return () => {
      cancelled = true;
      setHydrating(false);
    };
  }, [enabled, resolved, valid, verified, setVerified]);

  return { hydrating };
}
