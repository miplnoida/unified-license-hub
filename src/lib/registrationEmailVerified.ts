import { supabase } from '@/integrations/supabase/client';

/**
 * Persistence + server lookup for "has this registration email already been
 * verified?". Shared by the OTP section (which owns the send/verify UI) and by
 * the registration runtime, so the verified flag survives navigating to a later
 * step or refreshing the page — not only while the OTP block is mounted.
 */

export function verifiedEmailMarkerKey(email: string): string {
  return `registrationEmailVerified:${email.trim().toLowerCase()}`;
}

export function normalizeVerificationEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isEmailVerifiedLocally(email: string): boolean {
  const key = verifiedEmailMarkerKey(email);
  try {
    return sessionStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function markEmailVerifiedLocally(email: string): void {
  try {
    sessionStorage.setItem(verifiedEmailMarkerKey(email), 'true');
  } catch { /* intentionally ignored */ }
}

export function clearEmailVerifiedLocally(email: string): void {
  try {
    sessionStorage.removeItem(verifiedEmailMarkerKey(email));
  } catch { /* intentionally ignored */ }
}

/** Server-side lookup: is there a verified OTP record for this email? */
export async function checkEmailVerifiedOnServer(email: string, freshForUploads = false): Promise<boolean> {
  try {
    const { data } = await supabase.functions.invoke('verify-registration-otp', {
      body: { email, channel: 'email', purpose: 'registration', checkOnly: true, ...(freshForUploads ? { freshForUploads: true } : {}) },
    });
    return Boolean(data?.verified);
  } catch {
    // Lookup is a UX optimization; submit stays server-validated.
    return false;
  }
}
