// SEC-CRIT-01A — pre-registration file capability.
//
// Unsigned applicants have no account yet, so storage cannot bind their
// uploads to an owner. Instead the browser holds a random capability secret;
// only its SHA-256 hash is stored server-side. Every preview request must
// present the capability, and the requested object must live inside that
// capability's own folder (`registrations/<capability_id>/…`). The server then
// returns a 5-minute signed URL for that single object. No raw anonymous
// storage read exists.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { markPublicFunction } from '../_shared/publicFunction.ts';

markPublicFunction('Pre-login registration upload capability; every call is bound to a server-verified capability secret.');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSecret(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    // Shared capability check: exists, secret matches, live, journey-bound.
    async function loadCap(capId: string, secret: string) {
      if (!UUID.test(capId) || secret.length !== 64) return null;
      const { data: cap } = await admin
        .from('registration_upload_capabilities')
        .select('id, secret_hash, expires_at, revoked_at, status, registration_id')
        .eq('id', capId)
        .maybeSingle();
      if (!cap || cap.revoked_at || cap.status === 'REVOKED' || new Date(cap.expires_at) < new Date()) return null;
      if (cap.status !== 'BOUND_JOURNEY' && cap.status !== 'BOUND_REGISTRATION') return null;
      if (cap.secret_hash !== (await sha256(secret))) return null;
      return cap;
    }
    const ownedPath = (capId: string, path: string) =>
      path.startsWith(`registrations/${capId}/`) && !path.includes('..') && !path.includes('//') && !path.includes('\\');

    if (action === 'issue') {
      // Bound at issue to the canonical pre-registration journey: the verified
      // registration email OTP. No verified journey -> no capability.
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!email || email.length > 320 || !email.includes('@')) return json({ error: 'journey_required' });
      // SEC-CRIT-01C: a NEW capability needs a verification from the last 24h
      // (also enforced by the ruc_guard_issue trigger).
      const { data: otp } = await admin
        .from('otp_verifications')
        .select('id, verified_at')
        .eq('user_email', email)
        .eq('channel', 'email')
        .eq('purpose', 'registration')
        .not('verified_at', 'is', null)
        .order('verified_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!otp) return json({ error: 'journey_not_verified' });
      if (Date.parse(otp.verified_at as string) < Date.now() - 24 * 3600 * 1000) {
        return json({ error: 'verification_expired' });
      }
      const secret = randomSecret();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from('registration_upload_capabilities')
        .insert({ secret_hash: await sha256(secret), status: 'BOUND_JOURNEY', journey_email: email, otp_verification_id: otp.id, journey_bound_at: now })
        .select('id, expires_at')
        .single();
      if (error || !data) return json({ error: 'capability_unavailable' });
      return json({ capability_id: data.id, secret, expires_at: data.expires_at, journey_email: email });
    }

    if (action === 'record') {
      const capId = String(body?.capability_id ?? '');
      const path = String(body?.path ?? '');
      const cap = await loadCap(capId, String(body?.secret ?? ''));
      if (!cap) return json({ error: 'capability_invalid' });
      if (cap.status === 'BOUND_REGISTRATION') return json({ error: 'registration_closed' });
      if (!ownedPath(capId, path)) return json({ error: 'path_not_owned' });
      const slash = path.lastIndexOf('/');
      const { data: listed } = await admin.storage.from('secure-documents').list(path.slice(0, slash), { search: path.slice(slash + 1) });
      if (!listed?.some((o: { name: string }) => o.name === path.slice(slash + 1))) return json({ error: 'not_found' });
      const { error } = await admin.from('registration_upload_files').upsert({ capability_id: capId, object_path: path }, { onConflict: 'object_path', ignoreDuplicates: true });
      if (error) return json({ error: 'record_failed' });
      return json({ recorded: true });
    }

    if (action === 'sign') {
      const capId = String(body?.capability_id ?? '');
      const path = String(body?.path ?? '');
      const regId = body?.registration_id ? String(body.registration_id) : null;
      const cap = await loadCap(capId, String(body?.secret ?? ''));
      if (!cap) return json({ error: 'capability_invalid' });
      if (!ownedPath(capId, path)) return json({ error: 'path_not_owned' });
      if (regId && regId !== cap.registration_id) return json({ error: 'registration_mismatch' });
      // Durable ownership record is authoritative, not the path alone.
      const { data: file } = await admin
        .from('registration_upload_files')
        .select('capability_id, registration_id')
        .eq('object_path', path)
        .maybeSingle();
      if (!file || file.capability_id !== capId) return json({ error: 'path_not_owned' });
      if (file.registration_id && file.registration_id !== cap.registration_id) return json({ error: 'registration_mismatch' });
      const { data: signed, error } = await admin.storage.from('secure-documents').createSignedUrl(path, 300);
      if (error || !signed?.signedUrl) return json({ error: 'not_found' });
      return json({ signedUrl: signed.signedUrl });
    }

    return json({ error: 'unknown_action' });
  } catch {
    return json({ error: 'unavailable' });
  }
});
