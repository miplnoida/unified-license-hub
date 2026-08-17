import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Read-hook counterpart to `useAuditLog`'s writes. Fetches every
 * `audit_logs` row tied to a given entity, whether the entity id lives in
 * `entity_id` or inside `metadata.<entityType>_id` (a common pattern for
 * cross-entity linkage, e.g. payments referencing an application).
 *
 * Actors are resolved to a display name via `profiles`. Rows are returned
 * newest-first.
 *
 * Prefer this hook over ad-hoc `supabase.from('audit_logs')` queries so
 * that entity-scoped audit reads stay consistent across the app.
 */

export interface EntityAuditRow {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  actor_name: string;
}

export interface UseEntityAuditLogOptions {
  /** Primary entity type key (e.g. 'application', 'return', 'license'). */
  entityType: string;
  /** UUID of the primary entity. Hook is disabled when falsy. */
  entityId?: string | null;
  /**
   * Additional `metadata->>{key}` filters to sweep in cross-entity rows.
   * Defaults to `${entityType}_id`. Pass `[]` to disable metadata lookup.
   */
  metadataKeys?: string[];
  /** Extra `action` prefixes to include (in addition to any entity match). */
  includeActionPrefixes?: string[];
  /** Row cap per query. Default 500. */
  limit?: number;
  /** TanStack Query refetchInterval (ms). Default undefined (manual). */
  refetchInterval?: number;
}

export function useEntityAuditLog(opts: UseEntityAuditLogOptions) {
  const {
    entityType,
    entityId,
    metadataKeys,
    includeActionPrefixes,
    limit = 500,
    refetchInterval,
  } = opts;

  const metaKeys = metadataKeys ?? [`${entityType}_id`];

  return useQuery({
    queryKey: [
      'entity-audit-log',
      entityType,
      entityId,
      metaKeys,
      includeActionPrefixes,
      limit,
    ],
    enabled: Boolean(entityId),
    refetchInterval,
    queryFn: async (): Promise<EntityAuditRow[]> => {
      if (!entityId) return [];

      const queries: Promise<{ data: any[] | null }>[] = [
        supabase
          .from('audit_logs')
          .select(
            'id, action, created_at, user_id, entity_type, entity_id, old_value, new_value, metadata',
          )
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .limit(limit) as any,
        ...metaKeys.map(
          (k) =>
            supabase
              .from('audit_logs')
              .select(
                'id, action, created_at, user_id, entity_type, entity_id, old_value, new_value, metadata',
              )
              .filter(`metadata->>${k}`, 'eq', entityId)
              .order('created_at', { ascending: false })
              .limit(limit) as any,
        ),
      ];

      if (includeActionPrefixes?.length) {
        for (const prefix of includeActionPrefixes) {
          queries.push(
            supabase
              .from('audit_logs')
              .select(
                'id, action, created_at, user_id, entity_type, entity_id, old_value, new_value, metadata',
              )
              .like('action', `${prefix}%`)
              .filter(`metadata->>${metaKeys[0]}`, 'eq', entityId)
              .order('created_at', { ascending: false })
              .limit(limit) as any,
          );
        }
      }

      const results = await Promise.all(queries);
      const seen = new Map<string, any>();
      for (const r of results) {
        for (const row of r.data ?? []) {
          seen.set(row.id, row);
        }
      }

      const rows = Array.from(seen.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]),
      );

      const nameMap: Record<string, string> = {};
      if (userIds.length) {
        // Secure resolver: covers both staff (`profiles`) and external
        // (`pre_license_users`) identities for every reviewer role.
        const { data: resolved } = await supabase.rpc('resolve_user_display_names' as any, {
          _ids: userIds,
        });
        ((resolved as any[]) ?? []).forEach((row: any) => {
          const label = row.display_name || row.email;
          if (label) nameMap[row.id] = label;
        });
      }


      return rows.map((r) => ({
        ...(r as Omit<EntityAuditRow, 'actor_name'>),
        actor_name: r.user_id ? nameMap[r.user_id] || 'Unknown user' : 'System',
      }));
    },
  });
}
