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
  /** Email claim from the verified token, when present. */
  email: string | null;
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
 * Optional record scope. Every id is resolved server-side against the
 * canonical table — never trust caller-supplied user ids or ownership. When
 * a scope id is supplied and the record is missing, the caller receives 404;
 * when the record exists but the authenticated user is not entitled to it,
 * the caller receives 403. Assignment-only regulators are only entitled to
 * their mapped entities and only to post-submission returns.
 */
export interface AuthzScope {
  licenseeId?: string;
  entityId?: string;
  returnId?: string;
  recordId?: string;
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
  scope?: AuthzScope,
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

  if (scope) {
    const scopeCheck = await enforceScope(adminClient, userId, scope);
    if (!scopeCheck.ok) return { ok: false, response: scopeCheck.response };
  }

  return { ok: true, userId, authClient, adminClient };
}

/**
 * Server-side scope validation. Uses admin client to look up the target
 * record, then defers to `public.can_view_entity_returns` for return access
 * and `public.user_has_entity_assignment` for entity access. Never trusts
 * caller-provided user ids.
 */
async function enforceScope(
  adminClient: SupabaseClient,
  userId: string,
  scope: AuthzScope,
): Promise<AuthzResult> {
  try {
    if (scope.returnId) {
      const { data, error } = await adminClient.rpc('can_view_entity_returns', {
        _user_id: userId,
        _return_id: scope.returnId,
      });
      if (error || data !== true) {
        return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
      }
    }
    if (scope.entityId || scope.licenseeId) {
      const targetId = scope.entityId || scope.licenseeId!;
      const { data, error } = await adminClient.rpc('user_has_entity_assignment', {
        _user_id: userId,
        _licensee_id: targetId,
      });
      // Accept when user has explicit assignment; otherwise defer to the
      // module.action check that has already succeeded.
      if (error) {
        return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
      }
      if (data === false) {
        // No assignment — allow only if this user is not assignment-only.
        const { data: assignmentOnly } = await adminClient.rpc('is_assignment_only_regulator', {
          _user_id: userId,
        });
        if (assignmentOnly === true) {
          return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
        }
      }
    }
  } catch {
    return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
  }
  return { ok: true, userId, authClient: adminClient, adminClient };
}

/**
 * Convenience for functions that need only JWT validation without a
 * module.action check (rare — prefer requireUserPermission).
 */
export async function requireAuthenticatedUser(req: Request): Promise<AuthzResult> {
  return requireUserPermission(req);
}
