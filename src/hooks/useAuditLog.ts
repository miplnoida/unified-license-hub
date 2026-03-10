import { supabase } from '@/integrations/supabase/client';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    old_value: entry.oldValue as any,
    new_value: entry.newValue as any,
    metadata: entry.metadata as any,
  } as any);
}
