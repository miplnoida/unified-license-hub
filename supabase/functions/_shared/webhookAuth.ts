// Shared authorization helper for inbound provider webhooks.
//
// A webhook cannot present a Supabase JWT, so the authority is an HMAC-SHA256
// signature over the RAW request body using a project secret. Fail-closed:
// a missing secret, missing header or mismatching digest is 401 and the
// handler never sees the payload.
//
// Usage:
//   const raw = await req.text();
//   const gate = await requireSignedWebhook(req, raw, 'NOTIFICATION_WEBHOOK_SECRET');
//   if (!gate.ok) return gate.response;

export interface WebhookAuthOk { ok: true }
export interface WebhookAuthFail { ok: false; response: Response }
export type WebhookAuthResult = WebhookAuthOk | WebhookAuthFail;

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify the `x-signature` header (optionally `sha256=` prefixed) against the
 * HMAC of the raw body. `headers` is used for the failure response so CORS is
 * preserved. Never echoes the secret or the expected digest.
 */
export async function requireSignedWebhook(
  req: Request,
  rawBody: string,
  secretEnvName: string,
  headers: Record<string, string> = {},
): Promise<WebhookAuthResult> {
  const fail = (error: string) => ({
    ok: false as const,
    response: new Response(JSON.stringify({ ok: false, error }), {
      status: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
    }),
  });

  const secret = Deno.env.get(secretEnvName) || '';
  if (!secret) {
    console.warn(`[webhookAuth] ${secretEnvName} not configured; callback rejected`);
    return fail('webhook_not_configured');
  }
  const supplied = (req.headers.get('x-signature') || '').replace(/^sha256=/, '').toLowerCase();
  if (!supplied) return fail('invalid_signature');
  const expected = await hmacHex(secret, rawBody);
  if (!timingSafeEqual(supplied, expected)) return fail('invalid_signature');
  return { ok: true };
}
