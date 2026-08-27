// Shared authorization helper for machine-to-machine sandbox provider
// endpoints that are called by the Integration Manager connector runtime with
// a PROVIDER credential (not a Supabase JWT) in the Authorization header.
//
// Authority = timing-safe comparison of the presented bearer against a project
// secret. Fail-closed: an unset secret rejects every call, so a project that
// never provisioned the credential exposes nothing.

export interface SandboxAuthOk { ok: true }
export interface SandboxAuthFail { ok: false; response: Response }
export type SandboxAuthResult = SandboxAuthOk | SandboxAuthFail;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Require the provider credential held in `secretEnvName`.
 * `headers` is merged into the 401 response so CORS is preserved.
 */
export function requireSandboxCredential(
  req: Request,
  secretEnvName: string,
  headers: Record<string, string> = {},
): SandboxAuthResult {
  const expected = Deno.env.get(secretEnvName) ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!expected || !presented || !timingSafeEqual(presented, expected)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid screening provider credential' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      ),
    };
  }
  return { ok: true };
}
