import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Admin-facing permission catalog hooks.
 *
 * Exposes only Modules and Actions — the two things business admins manage.
 * Route-to-module mapping is intentionally NOT exposed here; it is
 * developer-owned configuration handled inside navigation/route guards.
 */

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
