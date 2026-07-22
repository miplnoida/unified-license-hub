import { supabase } from "@/integrations/supabase/client";

/**
 * Server-side gate for client-driven exports/downloads.
 *
 * Calls the SECURITY DEFINER `public.record_export_intent(module, action, meta)`
 * RPC which invokes `enforce_permission(module, action)` and writes an audit
 * log entry. Throws on `42501` (permission denied) so the caller can abort the
 * export before generating a file.
 *
 * Usage:
 *   await authorizedExport('application_management', 'export', { count });
 *   // ...produce CSV/blob/etc.
 */
export async function authorizedExport(
  module: string,
  action: "export" | "download" = "export",
  meta: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.rpc("record_export_intent", {
    _module: module,
    _action: action,
    _meta: meta as never,
  });
  if (error) {
    // Surface the PostgREST/pg error verbatim; callers decide UX.
    throw error;
  }
}
