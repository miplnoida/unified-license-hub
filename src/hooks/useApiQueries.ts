import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { paginatedQuery, mutate, PaginationParams, ApiResponse } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ─── Applications ───
export function useApplications(params?: PaginationParams & { status?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['applications', params],
    queryFn: async () => {
      const filters: Record<string, unknown> = {};
      if (params?.status) filters.status = params.status;
      return paginatedQuery('applications', params, filters);
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ─── Licenses ───
export function useLicenses(params?: PaginationParams & { status?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['licenses', params],
    queryFn: async () => {
      const filters: Record<string, unknown> = {};
      if (params?.status) filters.status = params.status;
      return paginatedQuery('licenses', params, filters);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

// ─── Payments ───
export function usePayments(params?: PaginationParams) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['payments', params],
    queryFn: () => paginatedQuery('payments', params),
    enabled: !!user,
    staleTime: 30_000,
  });
}

// ─── Compliance Returns ───
export function useComplianceReturns(params?: PaginationParams & { status?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['compliance-returns', params],
    queryFn: async () => {
      const filters: Record<string, unknown> = {};
      if (params?.status) filters.status = params.status;
      return paginatedQuery('compliance_returns', params, filters);
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

// ─── Profiles ───
export function useProfiles(params?: PaginationParams) {
  return useQuery({
    queryKey: ['profiles', params],
    queryFn: () => paginatedQuery('profiles', params),
    staleTime: 120_000,
  });
}

// ─── Reports ───
export function useReports(params?: PaginationParams) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () => paginatedQuery('reports', params),
    enabled: !!user,
    staleTime: 60_000,
  });
}

// ─── Generic mutation with cache invalidation ───
export function useTableMutation(table: string, invalidateKeys?: string[]) {
  const queryClient = useQueryClient();

  const insert = useMutation({
    mutationFn: async (record: Record<string, unknown>) => {
      return mutate(() => (supabase.from(table as any).insert(record as any).select().single() as any));
    },
    onSuccess: () => {
      (invalidateKeys || [table]).forEach(key =>
        queryClient.invalidateQueries({ queryKey: [key] })
      );
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      return mutate(() => (supabase.from(table as any).update(updates as any).eq('id', id).select().single() as any));
    },
    onSuccess: () => {
      (invalidateKeys || [table]).forEach(key =>
        queryClient.invalidateQueries({ queryKey: [key] })
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      return mutate(() => (supabase.from(table as any).delete().eq('id', id) as any));
    },
    onSuccess: () => {
      (invalidateKeys || [table]).forEach(key =>
        queryClient.invalidateQueries({ queryKey: [key] })
      );
    },
  });

  return { insert, update, remove };
}

// ─── Dashboard Stats (heavily cached) ───
export function useDashboardStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [apps, licenses, payments, returns] = await Promise.all([
        supabase.from('applications').select('status', { count: 'exact', head: true }),
        supabase.from('licenses').select('status', { count: 'exact', head: true }),
        supabase.from('payments').select('status', { count: 'exact', head: true }),
        supabase.from('compliance_returns').select('status', { count: 'exact', head: true }),
      ]);
      return {
        applications: apps.count || 0,
        licenses: licenses.count || 0,
        payments: payments.count || 0,
        returns: returns.count || 0,
      };
    },
    enabled: !!user,
    staleTime: 120_000, // 2 min cache
    gcTime: 300_000,    // 5 min garbage collection
  });
}
