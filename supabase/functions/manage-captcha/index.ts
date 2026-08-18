/**
 * CAPTCHA administration + verification.
 *
 * Actions:
 *  - set_secret   (admin only) store/replace the provider secret key for a configuration
 *  - has_secret   (admin only) report whether a secret is stored (never returns the value)
 *  - verify       (public) verify a provider token against the active configuration
 *
 * The provider secret key is written to `public.captcha_secrets`, which no client
 * role can read. Only this function (service role) may read it.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const VERIFY_URLS: Record<string, string> = {
  recaptcha_v2: 'https://www.google.com/recaptcha/api/siteverify',
  recaptcha_v3: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? '');

    // ---------- public verification ----------
    if (action === 'verify') {
      const token = String(body.token ?? '');
      if (!token) return json({ ok: false, error: 'Captcha token is required.' });

      const { data: cfg } = await admin
        .from('captcha_configurations')
        .select('id, provider')
        .eq('is_active', true)
        .maybeSingle();

      if (!cfg) return json({ ok: false, error: 'No active CAPTCHA configuration.' });

      const { data: secretRow } = await admin
        .from('captcha_secrets')
        .select('secret_key')
        .eq('configuration_id', cfg.id)
        .maybeSingle();

      if (!secretRow?.secret_key) {
        return json({ ok: false, error: 'CAPTCHA secret key is not configured.' });
      }

      const url = VERIFY_URLS[cfg.provider];
      if (!url) return json({ ok: false, error: 'Unsupported CAPTCHA provider.' });

      const form = new URLSearchParams();
      form.set('secret', secretRow.secret_key);
      form.set('response', token);
      const remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      if (remoteIp) form.set('remoteip', remoteIp);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const result = await res.json().catch(() => ({ success: false }));

      if (!result.success) {
        return json({ ok: false, error: 'CAPTCHA verification failed. Please try again.' });
      }
      return json({ ok: true, provider: cfg.provider, score: result.score ?? null });
    }

    // ---------- admin actions ----------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await admin.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ ok: false, error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => r === 'admin' || r === 'super_admin')) {
      return json({ ok: false, error: 'Forbidden' }, 403);
    }

    const configurationId = String(body.configuration_id ?? '');
    if (!configurationId) return json({ ok: false, error: 'configuration_id is required.' });

    if (action === 'has_secret') {
      const { data } = await admin
        .from('captcha_secrets')
        .select('configuration_id, updated_at')
        .eq('configuration_id', configurationId)
        .maybeSingle();
      return json({ ok: true, has_secret: !!data, updated_at: data?.updated_at ?? null });
    }

    if (action === 'set_secret') {
      const secretKey = String(body.secret_key ?? '').trim();
      if (secretKey.length < 10) {
        return json({ ok: false, error: 'Enter a valid provider secret key.' });
      }
      const { error } = await admin
        .from('captcha_secrets')
        .upsert(
          { configuration_id: configurationId, secret_key: secretKey, updated_at: new Date().toISOString() },
          { onConflict: 'configuration_id' },
        );
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action.' });
  } catch (error) {
    console.error('[manage-captcha] error', error);
    return json({ ok: false, error: 'Unexpected error handling CAPTCHA request.' });
  }
});
