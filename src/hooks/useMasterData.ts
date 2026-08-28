import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { configRetire, configSave } from '@/lib/configWriter';

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

export interface MasterDataItemsOptions {
  /** Server-side name/code search term. */
  search?: string;
  /** Max rows to fetch (large datasets such as cities are capped). */
  limit?: number;
}

export function useMasterDataItems(typeId?: string | null, opts: MasterDataItemsOptions = {}) {
  const { search = '', limit = 200 } = opts;
  const term = search.trim();
  return useQuery({
    queryKey: ['master_data_items', typeId, term, limit],
    queryFn: async () => {
      let query = supabase
        .from('master_data_items' as any)
        .select('*, parent:parent_item_id(name)', { count: 'exact' })
        .order('name')

        .limit(limit);
      if (typeId) query = query.eq('type_id', typeId);
      if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      const rows = ((data || []) as any[]).map(r => ({
        ...r,
        parent_name: r.parent?.name ?? undefined,
      })) as unknown as MasterDataItem[];
      return { rows, total: count ?? rows.length };
    },
    enabled: !!typeId,
    placeholderData: prev => prev,
  });
}


/** Fetch only active items for a given type code (for use in forms/dropdowns) */
export function useActiveMasterItems(typeCode: string, parentItemId?: string | null) {
  return useQuery({
    queryKey: ['master_data_active', typeCode, parentItemId],
    queryFn: async () => {
      // First try to find the type by code, then fall back to name
      let typeData: any = null;
      const { data: byCode, error: codeErr } = await supabase
        .from('master_data_types' as any)
        .select('id')
        .eq('code', typeCode)
        .eq('status', 'active')
        .maybeSingle();
      if (codeErr) throw codeErr;
      typeData = byCode;

      if (!typeData) {
        const { data: byName, error: nameErr } = await supabase
          .from('master_data_types' as any)
          .select('id')
          .eq('name', typeCode)
          .eq('status', 'active')
          .maybeSingle();
        if (nameErr) throw nameErr;
        typeData = byName;
      }

      if (!typeData) return [];

      let query = supabase
        .from('master_data_items' as any)
        .select('id, name, code, parent_item_id, metadata')
        .eq('type_id', (typeData as any).id)
        .eq('status', 'active')
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

  // GAP-F1-03: master data writes go through the governed config writer
  // (`settings.edit` + before/after audit). Records are retired, not deleted.
  const upsertType = useMutation({
    mutationFn: async (row: Partial<MasterDataType> & { name: string }) => {
      await configSave('master_data_types', {
        name: row.name,
        code: row.code || null,
        description: row.description || null,
        status: row.status || 'active',
        sort_order: row.sort_order || 0,
      }, { id: row.id ?? null, entityLabel: 'master data type' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_types'] }),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => { await configRetire('master_data_types', id, { entityLabel: 'master data type' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_types'] }),
  });

  const upsertItem = useMutation({
    mutationFn: async (row: Partial<MasterDataItem> & { type_id: string; name: string }) => {
      await configSave('master_data_items', {
        type_id: row.type_id,
        parent_item_id: row.parent_item_id || null,
        name: row.name,
        code: row.code || null,
        status: row.status || 'active',
        sort_order: row.sort_order || 0,
        metadata: row.metadata || {},
      }, { id: row.id ?? null, entityLabel: 'master data item' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_items'] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => { await configRetire('master_data_items', id, { entityLabel: 'master data item' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_data_items'] }),
  });

  return { upsertType, deleteType, upsertItem, deleteItem };
}
