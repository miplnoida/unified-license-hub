import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CatalogModule {
  id: string;
  key: string;
  label: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  is_system: boolean;
}

export interface CatalogAction {
  id: string;
  module_id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_system: boolean;
}

export interface CatalogRoute {
  id: string;
  module_id: string;
  route_prefix: string;
  menu_label: string | null;
  sort_order: number;
}

export function useCatalogModules() {
  return useQuery({
    queryKey: ['permission-catalog', 'modules'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('permission_modules' as any)
        .select('*')
        .order('sort_order') as any);
      if (error) throw error;
      return (data || []) as CatalogModule[];
    },
  });
}

export function useCatalogActions() {
  return useQuery({
    queryKey: ['permission-catalog', 'actions'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('permission_actions' as any)
        .select('*')
        .order('sort_order') as any);
      if (error) throw error;
      return (data || []) as CatalogAction[];
    },
  });
}

export function useCatalogRoutes() {
  return useQuery({
    queryKey: ['permission-catalog', 'routes'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('permission_module_routes' as any)
        .select('*')
        .order('sort_order') as any);
      if (error) throw error;
      return (data || []) as CatalogRoute[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['permission-catalog'] });
  qc.invalidateQueries({ queryKey: ['permissions'] });
  qc.invalidateQueries({ queryKey: ['user-permissions'] });
}

export function useUpsertModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; key: string; label: string; description?: string | null; parent_id?: string | null; sort_order?: number }) => {
      if (input.id) {
        const { error } = await (supabase.from('permission_modules' as any).update({
          key: input.key, label: input.label, description: input.description ?? null,
          parent_id: input.parent_id ?? null, sort_order: input.sort_order ?? 100,
        } as any).eq('id', input.id) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('permission_modules' as any).insert({
          key: input.key, label: input.label, description: input.description ?? null,
          parent_id: input.parent_id ?? null, sort_order: input.sort_order ?? 100, is_system: false,
        } as any) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(qc); toast.success('Module saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save module'),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('permission_modules' as any).delete().eq('id', id) as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast.success('Module deleted'); },
    onError: (e: any) => toast.error(e.message || 'Failed to delete module'),
  });
}

export function useUpsertAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; module_id: string; module_key: string; key: string; label: string; description?: string | null; sort_order?: number }) => {
      if (input.id) {
        const { error } = await (supabase.from('permission_actions' as any).update({
          key: input.key, label: input.label, description: input.description ?? null,
          sort_order: input.sort_order ?? 100,
        } as any).eq('id', input.id) as any);
        if (error) throw error;
      } else {
        const { data: action, error } = await (supabase.from('permission_actions' as any).insert({
          module_id: input.module_id, key: input.key, label: input.label,
          description: input.description ?? null, sort_order: input.sort_order ?? 100, is_system: false,
        } as any).select().single() as any);
        if (error) throw error;
        // Mirror into legacy permissions table so role_permissions can link
        const { error: pErr } = await (supabase.from('permissions' as any).insert({
          module: input.module_key, name: input.key, description: input.description ?? null,
          action_id: (action as any).id,
        } as any) as any);
        if (pErr && !String(pErr.message || '').includes('duplicate')) throw pErr;
      }
    },
    onSuccess: () => { invalidate(qc); toast.success('Action saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save action'),
  });
}

export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('permission_actions' as any).delete().eq('id', id) as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast.success('Action deleted'); },
    onError: (e: any) => toast.error(e.message || 'Failed to delete action'),
  });
}

export function useUpsertRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; module_id: string; route_prefix: string; menu_label?: string | null; sort_order?: number }) => {
      if (input.id) {
        const { error } = await (supabase.from('permission_module_routes' as any).update({
          route_prefix: input.route_prefix, menu_label: input.menu_label ?? null,
          sort_order: input.sort_order ?? 100,
        } as any).eq('id', input.id) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('permission_module_routes' as any).insert({
          module_id: input.module_id, route_prefix: input.route_prefix,
          menu_label: input.menu_label ?? null, sort_order: input.sort_order ?? 100,
        } as any) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(qc); toast.success('Route attached'); },
    onError: (e: any) => toast.error(e.message || 'Failed to attach route'),
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('permission_module_routes' as any).delete().eq('id', id) as any);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast.success('Route detached'); },
    onError: (e: any) => toast.error(e.message || 'Failed to detach route'),
  });
}

/** Developer-declared route registry — admins can only attach routes from this list. */
export interface DeclaredRoute {
  route_prefix: string;
  default_label: string;
}

export const DECLARED_ROUTES: DeclaredRoute[] = [
  { route_prefix: '/admin', default_label: 'Admin Control Panel' },
  { route_prefix: '/admin/forms', default_label: 'Form Management' },
  { route_prefix: '/admin/registration-forms', default_label: 'Registration Forms' },
  { route_prefix: '/applications/queue', default_label: 'All License Requests' },
  { route_prefix: '/admin/users', default_label: 'Employee Management' },
  { route_prefix: '/admin/web-users', default_label: 'Web Users' },
  { route_prefix: '/admin/employees', default_label: 'Employees' },
  { route_prefix: '/admin/external-portal-access', default_label: 'External Portal Access' },
  { route_prefix: '/admin/roles', default_label: 'Role Management' },
  { route_prefix: '/admin/licensees', default_label: 'Licensee Entities' },
  { route_prefix: '/admin/approved-licensees', default_label: 'Approved Licensees' },
  { route_prefix: '/admin/ppoc-mappings', default_label: 'PPOC Mappings' },
  { route_prefix: '/admin/registration-review', default_label: 'Registration Review' },
  { route_prefix: '/admin/returns', default_label: 'Returns Admin' },
  { route_prefix: '/admin/return-config', default_label: 'Return Config' },
  { route_prefix: '/admin/fees', default_label: 'Fee Management' },
  { route_prefix: '/workflows', default_label: 'Approval Workflows' },
  { route_prefix: '/delegation-rules', default_label: 'Delegation Rules' },
  { route_prefix: '/admin/complaint-types', default_label: 'Complaint Types' },
  { route_prefix: '/complaints', default_label: 'Complaints' },
  { route_prefix: '/reports', default_label: 'Reports' },
  { route_prefix: '/analytics', default_label: 'Analytics' },
  { route_prefix: '/settings', default_label: 'Settings' },
  { route_prefix: '/admin/audit-logs', default_label: 'Activity Logs' },
  { route_prefix: '/admin/compliance-audit-logs', default_label: 'Audit Logs' },
  { route_prefix: '/admin/notification-templates', default_label: 'Notification Templates' },
  { route_prefix: '/admin/master-data', default_label: 'Master Data' },
  { route_prefix: '/admin/masters', default_label: 'Master Configuration' },
  { route_prefix: '/admin/regulators', default_label: 'Regulators' },
];
