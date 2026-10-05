import { supabase } from '@/integrations/supabase/client';

/**
 * SEC-CRIT-01A/01B — pre-registration file capability (browser side).
 *
 * The capability is issued only for a verified registration journey (the
 * verified email), uploads go into the capability's own folder and are
 * recorded server-side, and at submission the server binds the capability to
 * the new registration exactly once. Previews are 5-minute signed URLs issued
 * after the server checks the secret, the journey/registration binding and the
 * durable file record. There is no raw anonymous storage read.
 */
const KEY = 'olras.registrationUploadCapability';

interface Capability { capability_id: string; secret: string; expires_at: string; journey_email?: string }

let journeyEmail: string | null = null;

/** Called by the registration wizard once the email is verified. */
export function setRegistrationJourneyEmail(email: string | null) {
  journeyEmail = email ? email.trim().toLowerCase() : null;
}

function readStored(): Capability | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Capability;
    if (!c?.capability_id || !c?.secret || new Date(c.expires_at) < new Date()) return null;
    return c;
  } catch {
    return null;
  }
}

export async function getRegistrationCapability(): Promise<Capability> {
  const existing = readStored();
  // A capability belongs to one journey: a different verified email gets a new one.
  if (existing && existing.journey_email && (!journeyEmail || existing.journey_email === journeyEmail)) return existing;
  if (!journeyEmail) throw new Error('Please verify your email address before uploading documents.');
  const { data, error } = await supabase.functions.invoke('registration-file-access', {
    body: { action: 'issue', email: journeyEmail },
  });
  if (error || !data?.capability_id) {
    throw new Error(data?.error === 'journey_not_verified'
      ? 'Please verify your email address before uploading documents.'
      : 'Could not prepare a secure upload. Please try again.');
  }
  const cap = data as Capability;
  localStorage.setItem(KEY, JSON.stringify(cap));
  return cap;
}

/** Folder for a new registration upload, bound to this browser's capability. */
export async function registrationUploadFolder(sub?: string): Promise<string> {
  const cap = await getRegistrationCapability();
  return sub ? `registrations/${cap.capability_id}/${sub}` : `registrations/${cap.capability_id}`;
}

/** Records the durable server-side ownership of a just-uploaded file. */
export async function recordRegistrationUpload(path: string): Promise<void> {
  const cap = readStored();
  if (!cap || !path.startsWith(`registrations/${cap.capability_id}/`)) return;
  const { data, error } = await supabase.functions.invoke('registration-file-access', {
    body: { action: 'record', capability_id: cap.capability_id, secret: cap.secret, path },
  });
  if (error || !data?.recorded) throw new Error('Could not secure the uploaded file. Please try again.');
}

/** Capability presented at submission so the server can bind it to the registration. */
export function registrationUploadCapabilityForSubmit(): { capability_id: string; secret: string } | null {
  const cap = readStored();
  return cap ? { capability_id: cap.capability_id, secret: cap.secret } : null;
}

/**
 * Signed URL for a registration file. Signed-in users (owners, reviewers) use
 * normal storage authorization first; otherwise the capability is presented.
 */
export async function signRegistrationFile(path: string, expiresIn = 300): Promise<string | null> {
  const { data: direct } = await supabase.storage.from('secure-documents').createSignedUrl(path, expiresIn);
  if (direct?.signedUrl) return direct.signedUrl;
  const cap = readStored();
  if (!cap || !path.startsWith(`registrations/${cap.capability_id}/`)) return null;
  const { data } = await supabase.functions.invoke('registration-file-access', {
    body: { action: 'sign', capability_id: cap.capability_id, secret: cap.secret, path },
  });
  return (data?.signedUrl as string) || null;
}
