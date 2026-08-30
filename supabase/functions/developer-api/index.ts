// Public developer API. Auth via `X-API-Key: <prefix>.<secret>`.
// Read-only endpoints backed by the public registry data.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { markPublicFunction } from "../_shared/publicFunction.ts";
markPublicFunction('External API-key authenticated developer endpoint');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  const started = Date.now();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  // The invoked path is /developer-api/<resource>...; strip the fn name.
  const parts = url.pathname.split('/').filter(Boolean);
  const fnIdx = parts.indexOf('developer-api');
  const resourceParts = fnIdx >= 0 ? parts.slice(fnIdx + 1) : parts;
  const resource = resourceParts[0] ?? '';
  const id = resourceParts[1];

  const apiKey = req.headers.get('x-api-key') ?? '';
  let keyId: string | null = null;
  let status = 200;
  let payload: unknown = { ok: true };

  try {
    if (!apiKey || !apiKey.includes('.')) {
      status = 401; payload = { error: 'Missing X-API-Key' };
    } else {
      const prefix = apiKey.split('.')[0];
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
      const keyHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const { data: keyRow } = await admin.from('api_keys')
        .select('id, key_hash, revoked, expires_at, scopes')
        .eq('key_prefix', prefix).maybeSingle();

      if (!keyRow || keyRow.key_hash !== keyHash) {
        status = 401; payload = { error: 'Invalid API key' };
      } else if (keyRow.revoked) {
        status = 403; payload = { error: 'API key revoked' };
      } else if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
        status = 403; payload = { error: 'API key expired' };
      } else {
        keyId = keyRow.id;

        if (resource === 'licensees') {
          if (id) {
            const { data } = await admin.from('licenses')
              // Canonical columns: issued_at / valid_until. The licensee is reached
              // through licensees.license_id (there is no licenses -> licensees FK).
              .select('id, license_number, status, issued_at, valid_until, licensee:licensees!licensees_license_id_fkey(id, name, license_number)')
              .eq('id', id).maybeSingle();
            payload = data ?? {};
            if (!data) status = 404;
          } else {
            const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
            const { data } = await admin.from('licenses')
              .select('id, license_number, status, issued_at, valid_until, licensee:licensees!licensees_license_id_fkey(name)')
              .in('status', ['active', 'suspended'])
              .order('issued_at', { ascending: false })
              .limit(limit);
            payload = { data: data ?? [] };
          }
        } else if (resource === 'enforcement') {
          const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
          const { data } = await admin.from('enforcement_actions')
            .select('id, case_number, enforcement_type, status, decision_at, penalty_amount, penalty_currency')
            .in('status', ['decided', 'closed'])
            .order('decision_at', { ascending: false, nullsFirst: false })
            .limit(limit);
          payload = { data: data ?? [] };
        } else if (resource === 'health') {
          payload = { ok: true, ts: new Date().toISOString() };
        } else {
          status = 404; payload = { error: 'Unknown resource' };
        }
      }
    }
  } catch (e: any) {
    status = 500; payload = { error: e?.message ?? 'error' };
  }

  // Log usage (best-effort)
  const ip = req.headers.get('x-forwarded-for') ?? '';
  const ua = req.headers.get('user-agent') ?? '';
  if (keyId) {
    await admin.from('api_key_usage').insert({
      api_key_id: keyId, path: url.pathname, method: req.method,
      status_code: status, latency_ms: Date.now() - started, ip, user_agent: ua,
    });
    await admin.from('api_keys').update({
      last_used_at: new Date().toISOString(), last_used_ip: ip,
    }).eq('id', keyId);
  }

  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
