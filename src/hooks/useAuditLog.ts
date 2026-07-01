import { supabase } from '@/integrations/supabase/client';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Client-side audit logger. Routes through the SECURITY DEFINER RPC
 * `log_self_audit` so the row is always attributed to auth.uid() and the
 * actor's role is captured server-side — clients cannot forge either.
 * Direct INSERT into audit_logs is not permitted for user-driven writes.
 *
 * Every entry captures: timestamp, user id, role, action, entity type,
 * entity id, before-value, after-value, plus a metadata block with the
 * current route and user-agent for forensic context.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const metadata = {
    ...(entry.metadata ?? {}),
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    logged_at: new Date().toISOString(),
  };

  const { error } = await supabase.rpc('log_self_audit' as any, {
    _action: entry.action,
    _entity_type: entry.entityType,
    _entity_id: entry.entityId ?? null,
    _old_value: (entry.oldValue ?? null) as any,
    _new_value: (entry.newValue ?? null) as any,
    _metadata: metadata as any,
  });

  if (error && import.meta.env.DEV) {
    console.warn('[logAudit] failed:', error.message);
  }
}

/**
 * Convenience wrapper: `logAction('application.approved', 'application', id, { before, after, meta })`.
 */
export async function logAction(
  action: string,
  entityType: string,
  entityId?: string,
  opts: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
  } = {},
): Promise<void> {
  return logAudit({
    action,
    entityType,
    entityId,
    oldValue: opts.before ?? null,
    newValue: opts.after ?? null,
    metadata: opts.meta ?? null,
  });
}
