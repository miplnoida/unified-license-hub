// Shared authorization helper for edge functions.
// Enforces JWT presence + `public.has_permission(user, module, action)`.
//
// Usage:
//   import { requireUserPermission, corsHeaders } from '../_shared/authz.ts';
//   const gate = await requireUserPermission(req, 'audit_management', 'export');
//   if (!gate.ok) return gate.response;
//   const { userId, authClient, adminClient } = gate;
//
// The check is centralised so every function uses the same authority
// (dynamic-role catalog via has_permission). Do not roll your own role check.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export interface AuthzSuccess {
  ok: true;
  userId: string;
  authClient: SupabaseClient;
  adminClient: SupabaseClient;
}
export interface AuthzFailure {
  ok: false;
  response: Response;
}
export type AuthzResult = AuthzSuccess | AuthzFailure;

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * Verify the caller's JWT and, when `module`/`action` are provided, that
 * `has_permission(user, module, action)` returns true. Returns typed
 * clients on success or a ready-to-return 401/403 Response on failure.
 * Never leaks SQL/internal error details to the caller.
 */
export async function requireUserPermission(
  req: Request,
  module?: string,
  action?: string,
): Promise<AuthzResult> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  }
  const token = authHeader.slice('Bearer '.length);

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  }
  const userId = String(claimsData.claims.sub);
  const adminClient = admin();

  if (module && action) {
    // super_admin bypass is handled inside has_permission (per project convention);
    // if that ever changes we can add an is_super_admin() short-circuit here.
    try {
      const { data: allowed, error } = await adminClient.rpc('has_permission', {
        _user_id: userId,
        _module: module,
        _action: action,
      });
      if (error) {
        return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
      }
      if (allowed !== true) {
        return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
      }
    } catch {
      return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
    }
  }

  return { ok: true, userId, authClient, adminClient };
}

/**
 * Convenience for functions that need only JWT validation without a
 * module.action check (rare — prefer requireUserPermission).
 */
export async function requireAuthenticatedUser(req: Request): Promise<AuthzResult> {
  return requireUserPermission(req);
}
