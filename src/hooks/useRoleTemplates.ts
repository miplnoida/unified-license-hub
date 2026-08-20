/**
 * RDM-ENTITY-001 Wave A — database-driven role templates.
 * `sec_role_templates` replaces the static code catalogue; the static list
 * remains only as an offline fallback so the dialog never renders empty.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DbRoleTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  role_type: 'internal' | 'external';
  dashboard_tier: string | null;
  permissionIds: string[];
}

const db = () => supabase as unknown as { from: (t: string) => any };

export function useRoleTemplates() {
  return useQuery({
    queryKey: ['sec-role-templates'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DbRoleTemplate[]> => {
      const { data: templates, error } = await db()
        .from('sec_role_templates')
        .select('id, key, name, description, role_type, dashboard_tier, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      const rows = (templates || []) as any[];
      if (!rows.length) return [];

      const { data: perms } = await db()
        .from('sec_role_template_permissions')
        .select('template_id, permission_id')
        .in('template_id', rows.map((r) => r.id));

      const byTemplate = new Map<string, string[]>();
      for (const p of ((perms || []) as any[])) {
        const list = byTemplate.get(p.template_id) ?? [];
        list.push(p.permission_id);
        byTemplate.set(p.template_id, list);
      }

      return rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        role_type: (r.role_type === 'external' ? 'external' : 'internal') as 'internal' | 'external',
        dashboard_tier: r.dashboard_tier,
        permissionIds: byTemplate.get(r.id) ?? [],
      }));
    },
  });
}
