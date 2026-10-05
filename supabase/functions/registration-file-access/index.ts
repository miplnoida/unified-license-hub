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

    if (action === 'issue') {
      const secret = randomSecret();
      const { data, error } = await admin
        .from('registration_upload_capabilities')
        .insert({ secret_hash: await sha256(secret) })
        .select('id, expires_at')
        .single();
      if (error || !data) return json({ error: 'capability_unavailable' });
      return json({ capability_id: data.id, secret, expires_at: data.expires_at });
    }

    if (action === 'sign') {
      const capId = String(body?.capability_id ?? '');
      const secret = String(body?.secret ?? '');
      const path = String(body?.path ?? '');
      if (!UUID.test(capId) || secret.length !== 64) return json({ error: 'capability_invalid' });

      const { data: cap } = await admin
        .from('registration_upload_capabilities')
        .select('id, secret_hash, expires_at, revoked_at')
        .eq('id', capId)
        .maybeSingle();
      if (!cap || cap.revoked_at || new Date(cap.expires_at) < new Date()) return json({ error: 'capability_invalid' });
      if (cap.secret_hash !== (await sha256(secret))) return json({ error: 'capability_invalid' });

      // The object must sit inside this capability's own folder. Reject traversal.
      const prefix = `registrations/${capId}/`;
      if (!path.startsWith(prefix) || path.includes('..') || path.includes('//')) return json({ error: 'path_not_owned' });

      const { data: signed, error } = await admin.storage.from('secure-documents').createSignedUrl(path, 300);
      if (error || !signed?.signedUrl) return json({ error: 'not_found' });
      return json({ signedUrl: signed.signedUrl });
    }

    return json({ error: 'unknown_action' });
  } catch {
    return json({ error: 'unavailable' });
  }
});
