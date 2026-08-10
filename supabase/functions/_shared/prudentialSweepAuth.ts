// Guard for prudential sweep endpoints.
//
// Accepts, in order:
//   1. A worker credential (service role, static worker token, or a single-use
//      token issued by `public.issue_worker_token` / `public.worker_kick`).
//   2. A signed-in user who holds prudential supervision rights — this is what
//      the "Run sweep now" buttons on the prudential dashboard use.
//
// Anything else gets 401.

import { requireWorkerInvocationAsync, type WorkerAuthResult } from './workerAuth.ts';

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

export interface SweepAuth {
  ok: boolean;
  response?: Response;
  /** Resolved user id when a human triggered the sweep, else null. */
  actorId: string | null;
}

export async function requireWorkerOrPrudentialUser(
  req: Request,
  purpose: string,
): Promise<SweepAuth> {
  const worker: WorkerAuthResult = await requireWorkerInvocationAsync(req, purpose);
  if (worker.ok) return { ok: true, actorId: null };

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || !url || !anon || !service) {
    return { ok: false, response: deny(), actorId: null };
  }

  try {
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: auth },
    });
    if (!userRes.ok) return { ok: false, response: deny(), actorId: null };
    const user = await userRes.json();
    const userId: string | undefined = user?.id;
    if (!userId) return { ok: false, response: deny(), actorId: null };

    const permRes = await fetch(`${url}/rest/v1/rpc/can_act_on_prudential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: service,
        Authorization: `Bearer ${service}`,
      },
      body: JSON.stringify({ _user: userId }),
    });
    const allowed = await permRes.json().catch(() => false);
    if (permRes.ok && allowed === true) return { ok: true, actorId: userId };
  } catch {
    // fall through to deny
  }

  return { ok: false, response: deny(), actorId: null };
}
