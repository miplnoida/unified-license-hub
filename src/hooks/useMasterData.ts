import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MasterDataType {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MasterDataItem {
  id: string;
  type_id: string;
  parent_item_id: string | null;
  name: string;
  code: string | null;
  status: string;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // joined
  type_name?: string;
  parent_name?: string;
}

export function useMasterDataTypes() {
  return useQuery({
    queryKey: ['master_data_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_data_types' as any)
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as MasterDataType[];
    },
  });
}

export function useMasterDataItems(typeId?: string | null) {
  return useQuery({
    queryKey: ['master_data_items', typeId],
    queryFn: async () => {
      let query = supabase
        .from('master_data_items' as any)
        .select('*')
        .order('sort_order')
        .order('name');
      if (typeId) query = query.eq('type_id', typeId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as MasterDataItem[];
    },
    enabled: !!typeId,
  });
}

/** Fetch only active items for a given type code (for use in forms/dropdowns) */
export function useActiveMasterItems(typeCode: string, parentItemId?: string | null) {
  return useQuery({
    queryKey: ['master_data_active', typeCode, parentItemId],
    queryFn: async () => {
      // First get the type
      const { data: typeData, error: typeErr } = await supabase
        .from('master_data_types' as any)
        .select('id')
        .eq('code', typeCode)
        .eq('status', 'active')
        .maybeSingle();
      if (typeErr) throw typeErr;
      if (!typeData) return [];

      let query = supabase
        .from('master_data_items' as any)
        .select('id, name, code, parent_item_id, metadata')
        .eq('type_id', (typeData as any).id)
        .eq('status', 'active')
        .order('sort_order')
        .order('name');

      if (parentItemId) {
        query = query.eq('parent_item_id', parentItemId);
      } else if (parentItemId === null) {
        query = query.is('parent_item_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Pick<MasterDataItem, 'id' | 'name' | 'code' | 'parent_item_id' | 'metadata'>[];
    },
    enabled: !!typeCode,
  });
}

export function useMasterDataMutations() {
  const qc = useQueryClient();

  const upsertType = useMutation({
    mutationFn: async (row: Partial<MasterDataType> & { name: string }) => {
      if (row.id) {
        const { error } = await supabase.from('master_data_types' as any)
          .update({ name: row.name, code: row.code || null, description: row.description || null, status: row.status || 'active', sort_order: row.sort_order || 0 } as any)
          .eq('id', row.id);
        if (error) throw new Error(error.message.includes('unique') ? 'A master data type with this name already exists.' : error.message);
      } else {
        const { error } = await supabase.from('master_data_types' as any)
          .insert({ name: row.name, code: row.code || null, description: row.description || null, status: row.status || 'active', sort_order: row.sort_order || 0 } as any);
        if (error) throw new Error(error.message.includes('unique') ? 'A master data type with this name already exists.' : error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_types'] }),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('master_data_types' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_types'] }),
  });

  const upsertItem = useMutation({
    mutationFn: async (row: Partial<MasterDataItem> & { type_id: string; name: string }) => {
      const payload = {
        type_id: row.type_id,
        parent_item_id: row.parent_item_id || null,
        name: row.name,
        code: row.code || null,
        status: row.status || 'active',
        sort_order: row.sort_order || 0,
        metadata: row.metadata || {},
      } as any;
      if (row.id) {
        const { error } = await supabase.from('master_data_items' as any).update(payload).eq('id', row.id);
        if (error) throw new Error(error.message.includes('unique') || error.message.includes('duplicate') ? 'An item with this name already exists in this category.' : error.message);
      } else {
        const { error } = await supabase.from('master_data_items' as any).insert(payload);
        if (error) throw new Error(error.message.includes('unique') || error.message.includes('duplicate') ? 'An item with this name already exists in this category.' : error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_items'] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('master_data_items' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_items'] }),
  });

  return { upsertType, deleteType, upsertItem, deleteItem };
}
