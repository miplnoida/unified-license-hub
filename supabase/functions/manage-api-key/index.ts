import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireUserPermission } from "../_shared/authz.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });


  const __authzGate = await requireUserPermission(req, "integration_management", "manage");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supa.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is staff
    const { data: roleRows } = await admin
      .from('user_roles').select('role').eq('user_id', userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    const isStaff = ['admin', 'super_admin', 'supervisor'].some(r => roles.includes(r));
    if (!isStaff) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'create') {
      const name = String(body.name ?? '').trim();
      if (!name) return json({ error: 'name required' }, 400);
      const scopes: string[] = Array.isArray(body.scopes) && body.scopes.length
        ? body.scopes.map(String) : ['registry:read'];
      const expiresAt = body.expires_at ?? null;

      // Generate secret key: prefix + random 32 bytes hex
      const prefix = 'lvk_' + crypto.randomUUID().slice(0, 8);
      const secretBytes = new Uint8Array(32);
      crypto.getRandomValues(secretBytes);
      const secret = Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const fullKey = `${prefix}.${secret}`;

      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fullKey));
      const keyHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const { data, error } = await admin.from('api_keys').insert({
        name, key_prefix: prefix, key_hash: keyHash, scopes,
        expires_at: expiresAt, created_by: userId,
      }).select('id, name, key_prefix, scopes, expires_at, created_at').single();
      if (error) return json({ error: error.message }, 200);

      return json({ ok: true, key: data, secret: fullKey });
    }

    if (action === 'revoke') {
      const id = body.id;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await admin.from('api_keys').update({ revoked: true }).eq('id', id);
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? 'error' }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
