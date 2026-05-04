import { supabase } from '@/integrations/supabase/client';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Client-side audit logger. Routes through the SECURITY DEFINER RPC
 * `log_self_audit` so the row is always attributed to auth.uid() — clients
 * cannot forge a different user_id. Direct INSERT into audit_logs is no
 * longer permitted by RLS.
 */
export async function logAudit(entry: AuditEntry) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.rpc('log_self_audit' as any, {
    _action: entry.action,
    _entity_type: entry.entityType,
    _entity_id: entry.entityId ?? null,
    _old_value: (entry.oldValue ?? null) as any,
    _new_value: (entry.newValue ?? null) as any,
    _metadata: (entry.metadata ?? null) as any,
  });

  if (error && import.meta.env.DEV) {
    console.warn('[logAudit] failed:', error.message);
  }
}
