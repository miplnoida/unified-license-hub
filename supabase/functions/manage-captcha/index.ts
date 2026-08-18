/**
 * CAPTCHA administration + verification.
 *
 * Actions:
 *  - set_secret   (admin only) store/replace the provider secret key for a configuration
 *  - has_secret   (admin only) report whether a secret is stored (never returns the value)
 *  - verify       (public) verify a provider token against the active configuration and
 *                 mint a short-lived, single-use verification id the submission path can consume
 *
 * The provider secret key lives in `public.captcha_secrets`, which no client role can
 * read. Only this function (service role) may read it. Secrets are never returned,
 * logged, or echoed in error messages.
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

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, code: 'BAD_REQUEST', error: 'Malformed request body.' }, 400);
    }
    const action = String(body.action ?? '');
    if (!action) {
      return json({ ok: false, code: 'BAD_REQUEST', error: 'An action is required.' }, 400);
    }

    // ---------- public verification ----------
    if (action === 'verify') {
      const token = String(body.token ?? '');
      if (!token) {
        return json({ ok: false, code: 'MISSING_TOKEN', error: 'Security verification token is required.' });
      }

      const { data: cfg } = await admin
        .from('captcha_configurations')
        .select('id, provider, score_threshold, expected_action')
        .eq('is_active', true)
        .maybeSingle();

      if (!cfg) {
        return json({
          ok: false,
          code: 'NOT_CONFIGURED',
          error: 'Security verification is temporarily unavailable. Please try again later.',
        });
      }

      const url = VERIFY_URLS[cfg.provider];
      if (!url) {
        return json({
          ok: false,
          code: 'UNSUPPORTED_PROVIDER',
          error: 'Security verification is temporarily unavailable. Please try again later.',
        });
      }

      const { data: secretRow } = await admin
        .from('captcha_secrets')
        .select('secret_key')
        .eq('configuration_id', cfg.id)
        .maybeSingle();

      if (!secretRow?.secret_key) {
        return json({
          ok: false,
          code: 'NOT_CONFIGURED',
          error: 'Security verification is temporarily unavailable. Please try again later.',
        });
      }

      const form = new URLSearchParams();
      form.set('secret', secretRow.secret_key);
      form.set('response', token);
      const remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      if (remoteIp) form.set('remoteip', remoteIp);

      let result: Record<string, unknown>;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        if (!res.ok) {
          return json({
            ok: false,
            code: 'PROVIDER_ERROR',
            error: 'Security verification could not be completed. Please try again.',
          });
        }
        result = (await res.json()) as Record<string, unknown>;
      } catch {
        return json({
          ok: false,
          code: 'PROVIDER_UNREACHABLE',
          error: 'Security verification could not be reached. Please try again.',
        });
      }

      if (result.success !== true) {
        return json({
          ok: false,
          code: 'VERIFICATION_FAILED',
          error: 'CAPTCHA verification failed. Please try again.',
        });
      }

      // reCAPTCHA v3 is score based: enforce the configured threshold and action.
      let score: number | null = null;
      if (cfg.provider === 'recaptcha_v3') {
        score = typeof result.score === 'number' ? (result.score as number) : null;
        const threshold = Number(cfg.score_threshold ?? 0.5);
        if (score === null || score < threshold) {
          return json({
            ok: false,
            code: 'LOW_SCORE',
            error: 'CAPTCHA verification failed. Please try again.',
          });
        }
        const expectedAction = (cfg.expected_action ?? '').trim();
        if (expectedAction && String(result.action ?? '') !== expectedAction) {
          return json({
            ok: false,
            code: 'ACTION_MISMATCH',
            error: 'CAPTCHA verification failed. Please try again.',
          });
        }
      } else if (typeof result.score === 'number') {
        score = result.score as number;
      }

      const { data: verification, error: insertError } = await admin
        .from('captcha_verifications')
        .insert({
          configuration_id: cfg.id,
          provider: cfg.provider,
          score,
          ip_hash: await hashIp(remoteIp),
        })
        .select('id, expires_at')
        .single();

      if (insertError || !verification) {
        return json({
          ok: false,
          code: 'VERIFICATION_STORE_FAILED',
          error: 'Security verification could not be completed. Please try again.',
        });
      }

      return json({
        ok: true,
        provider: cfg.provider,
        verification_id: verification.id,
        expires_at: verification.expires_at,
      });
    }

    // ---------- admin actions ----------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized' }, 401);
    }
    const bearer = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await admin.auth.getClaims(bearer);
    if (authErr || !claims?.claims) {
      return json({ ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized' }, 401);
    }
    const userId = claims.claims.sub as string;

    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => r === 'admin' || r === 'super_admin')) {
      return json({ ok: false, code: 'FORBIDDEN', error: 'Forbidden' }, 403);
    }

    const configurationId = String(body.configuration_id ?? '');
    if (!configurationId) {
      return json({ ok: false, code: 'BAD_REQUEST', error: 'configuration_id is required.' }, 400);
    }

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
        return json({ ok: false, code: 'BAD_REQUEST', error: 'Enter a valid provider secret key.' }, 400);
      }
      const { error } = await admin
        .from('captcha_secrets')
        .upsert(
          { configuration_id: configurationId, secret_key: secretKey, updated_at: new Date().toISOString() },
          { onConflict: 'configuration_id' },
        );
      if (error) {
        return json({ ok: false, code: 'STORE_FAILED', error: 'Could not store the secret key.' });
      }
      return json({ ok: true });
    }

    return json({ ok: false, code: 'UNKNOWN_ACTION', error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('[manage-captcha] unexpected error', error instanceof Error ? error.message : 'unknown');
    return json({ ok: false, code: 'UNEXPECTED', error: 'Unexpected error handling CAPTCHA request.' }, 500);
  }
});
