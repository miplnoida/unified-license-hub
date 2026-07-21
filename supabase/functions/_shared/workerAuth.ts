// Shared worker-invocation guard for scheduled/background edge functions.
//
// Accepts either:
//   1. `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (pg_cron / internal calls).
//   2. `x-worker-token: <WORKER_INVOKE_TOKEN>` (on-demand admin invocation).
//
// Any other request receives 401. This prevents unauthenticated users from
// triggering sweep/cron functions from the browser.

const enc = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let mismatch = 0;
  for (let i = 0; i < ab.length; i++) mismatch |= ab[i] ^ bb[i];
  return mismatch === 0;
}

export interface WorkerAuthOk { ok: true }
export interface WorkerAuthFail { ok: false; response: Response }
export type WorkerAuthResult = WorkerAuthOk | WorkerAuthFail;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-worker-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function deny(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized worker invocation' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Guard for scheduler / sweep / worker endpoints. Never surface details about
 * which credential succeeded to the caller.
 */
export function requireWorkerInvocation(req: Request): WorkerAuthResult {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const workerToken = Deno.env.get('WORKER_INVOKE_TOKEN') || '';

  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ') && serviceKey) {
    const token = auth.slice('Bearer '.length);
    if (timingSafeEqual(token, serviceKey)) return { ok: true };
  }

  const supplied = req.headers.get('x-worker-token') || '';
  if (supplied && workerToken && timingSafeEqual(supplied, workerToken)) {
    return { ok: true };
  }

  return { ok: false, response: deny() };
}
