import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Checkpoint F — People & Access + My Work.
 *
 * READ MODELS ONLY. Every hook here calls a read-only SECURITY DEFINER
 * aggregation over existing canonical truth (`staff_responsibility_profile`,
 * entity memberships, provider engagements, live module cases). Nothing is
 * copied into a new work/permission table and there is no write path in this
 * file — authority still lives in the canonical RBAC / workflow / provider
 * layers, which remain the only source of truth.
 */
const rpc = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase.rpc as any)(name, args ?? {});
  if (error) throw error;
  const payload = data as any;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.error) {
    throw new Error(String(payload.error));
  }
  return payload as T;
};

export interface InternalProfile {
  user?: { id: string; full_name?: string; email?: string; department?: string; status?: string };
  roles?: any[];
  teams?: any[];
  portfolios?: any[];
  entity_assignments?: any[];
  examinations?: any[];
  appeal_panels?: any[];
  committees?: any[];
  permissions?: { module: string; action: string }[];
  delegations?: any[];
  work_coverage?: any[];
  is_provider_identity?: boolean;
  access_history?: any[];
}

export interface EntityAccessOverview {
  entity?: { id: string; name?: string; status?: string };
  memberships?: any[];
  portal_access?: any[];
  supervision_ownership?: any[];
  access_history?: any[];
}

export interface ProviderAccessOverview {
  provider?: any;
  engagements?: any[];
  users?: any[];
  assigned_packages?: any[];
  access_history?: any[];
}

export interface MyWorkItem {
  source: string;
  id: string;
  reference: string | null;
  title: string | null;
  status: string | null;
  due_at: string | null;
  priority: string | null;
  route: string;
}

export interface MyWorkQueue {
  items: MyWorkItem[];
  counts: Record<string, number>;
  context: 'internal' | 'provider' | 'none';
}

export function useInternalProfile(userId?: string) {
  return useQuery({
    queryKey: ['people-access-internal', userId],
    enabled: !!userId,
    queryFn: () => rpc<InternalProfile>('people_access_internal_profile', { _user_id: userId }),
  });
}

export function useEntityAccessOverview(entityId?: string) {
  return useQuery({
    queryKey: ['people-access-entity', entityId],
    enabled: !!entityId,
    queryFn: () => rpc<EntityAccessOverview>('people_access_entity_overview', { _entity_id: entityId }),
  });
}

export function useProviderAccessOverview(providerId?: string) {
  return useQuery({
    queryKey: ['people-access-provider', providerId],
    enabled: !!providerId,
    queryFn: () => rpc<ProviderAccessOverview>('people_access_provider_overview', { _provider_id: providerId }),
  });
}

export function useMyWorkQueue(limit = 25) {
  return useQuery({
    queryKey: ['my-work-queue', limit],
    queryFn: () => rpc<MyWorkQueue>('my_work_queue', { _limit: limit }),
    staleTime: 30_000,
  });
}

/** Pickers — plain reads of existing registers, used only to choose a subject. */
export function useStaffDirectory() {
  return useQuery({
    queryKey: ['people-access-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, department, status')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useEntityDirectory() {
  return useQuery({
    queryKey: ['people-access-entities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licensees')
        .select('id, name, status')
        .order('name')
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useProviderDirectory() {
  return useQuery({
    queryKey: ['people-access-providers'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('service_providers' as any) as any)
        .select('id, code, name, provider_type, status')
        .order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}
