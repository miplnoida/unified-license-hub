import { supabase } from '@/integrations/supabase/client';

/**
 * SEC-CRIT-01A — pre-registration file capability (browser side).
 *
 * Unsigned applicants hold a capability secret issued by the
 * `registration-file-access` function. Uploads go into the capability's own
 * folder; previews are obtained as 5-minute signed URLs only after the server
 * verifies the secret and that the file lives in that folder. There is no raw
 * anonymous storage read.
 */
const KEY = 'olras.registrationUploadCapability';

interface Capability { capability_id: string; secret: string; expires_at: string }

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
  if (existing) return existing;
  const { data, error } = await supabase.functions.invoke('registration-file-access', { body: { action: 'issue' } });
  if (error || !data?.capability_id) throw new Error('Could not prepare a secure upload. Please try again.');
  const cap = data as Capability;
  localStorage.setItem(KEY, JSON.stringify(cap));
  return cap;
}

/** Folder for a new registration upload, bound to this browser's capability. */
export async function registrationUploadFolder(sub?: string): Promise<string> {
  const cap = await getRegistrationCapability();
  return sub ? `registrations/${cap.capability_id}/${sub}` : `registrations/${cap.capability_id}`;
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
