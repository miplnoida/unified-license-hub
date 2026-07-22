import { supabase } from "@/integrations/supabase/client";

/**
 * Universal server-side authorization gate for sensitive UI mutations.
 *
 * Wraps the SECURITY DEFINER `public.enforce_action(module, action, meta)` RPC
 * which calls `enforce_permission(module, action)` and writes an audit row.
 * Throws on `42501` so callers can abort before mutating.
 *
 * Usage:
 *   await authorizedAction('form_management', 'publish', { form_id });
 *   // ...proceed with mutation
 */
export async function authorizedAction(
  module: string,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.rpc("enforce_action", {
    _module: module,
    _action: action,
    _meta: meta as never,
  });
  if (error) throw error;
}
