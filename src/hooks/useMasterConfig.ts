import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SectorRow { id: string; name: string; status: string; created_at: string; }
export interface SubSectorRow { id: string; sector_id: string; name: string; status: string; created_at: string; sector_name?: string; }
export interface CategoryRow { id: string; sector_id: string; sub_sector_id: string; name: string; status: string; created_at: string; sector_name?: string; sub_sector_name?: string; }
export interface ServiceRow { id: string; sector_id: string; sub_sector_id: string; name: string; status: string; created_at: string; sector_name?: string; sub_sector_name?: string; }

export function useSectors() {
  return useQuery({
    queryKey: ['sectors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors' as any).select('*').order('name');
      if (error) throw error;
      return (data || []) as unknown as SectorRow[];
    },
  });
}

export function useSubSectors() {
  return useQuery({
    queryKey: ['sub_sectors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sub_sectors' as any).select('*, sectors!inner(name)').order('name');
      if (error) throw error;
      return ((data || []) as any[]).map((r: any) => ({ ...r, sector_name: r.sectors?.name })) as SubSectorRow[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories' as any).select('*, sectors!inner(name), sub_sectors!inner(name)').order('name');
      if (error) throw error;
      return ((data || []) as any[]).map((r: any) => ({ ...r, sector_name: r.sectors?.name, sub_sector_name: r.sub_sectors?.name })) as CategoryRow[];
    },
  });
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services' as any).select('*, sectors!inner(name), sub_sectors!inner(name)').order('name');
      if (error) throw error;
      return ((data || []) as any[]).map((r: any) => ({ ...r, sector_name: r.sectors?.name, sub_sector_name: r.sub_sectors?.name })) as ServiceRow[];
    },
  });
}

export function useMasterMutations() {
  const qc = useQueryClient();

  const upsertSector = useMutation({
    mutationFn: async (row: { id?: string; name: string; status: string }) => {
      if (row.id) {
        const { error } = await supabase.from('sectors' as any).update({ name: row.name, status: row.status } as any).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sectors' as any).insert({ name: row.name, status: row.status } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sectors'] }),
  });

  const deleteSector = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sectors' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sectors'] }),
  });

  const upsertSubSector = useMutation({
    mutationFn: async (row: { id?: string; sector_id: string; name: string; status: string }) => {
      if (row.id) {
        const { error } = await supabase.from('sub_sectors' as any).update({ sector_id: row.sector_id, name: row.name, status: row.status } as any).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sub_sectors' as any).insert({ sector_id: row.sector_id, name: row.name, status: row.status } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub_sectors'] }),
  });

  const deleteSubSector = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sub_sectors' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub_sectors'] }),
  });

  const upsertCategory = useMutation({
    mutationFn: async (row: { id?: string; sector_id: string; sub_sector_id: string; name: string; status: string }) => {
      if (row.id) {
        const { error } = await supabase.from('categories' as any).update({ sector_id: row.sector_id, sub_sector_id: row.sub_sector_id, name: row.name, status: row.status } as any).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories' as any).insert({ sector_id: row.sector_id, sub_sector_id: row.sub_sector_id, name: row.name, status: row.status } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const upsertService = useMutation({
    mutationFn: async (row: { id?: string; sector_id: string; sub_sector_id: string; name: string; status: string }) => {
      if (row.id) {
        const { error } = await supabase.from('services' as any).update({ sector_id: row.sector_id, sub_sector_id: row.sub_sector_id, name: row.name, status: row.status } as any).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('services' as any).insert({ sector_id: row.sector_id, sub_sector_id: row.sub_sector_id, name: row.name, status: row.status } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('services' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  return { upsertSector, deleteSector, upsertSubSector, deleteSubSector, upsertCategory, deleteCategory, upsertService, deleteService };
}
