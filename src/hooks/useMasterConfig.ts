import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { configRetire, configSave, toConfigWriteError } from '@/lib/configWriter';

export interface SectorRow { id: string; name: string; status: string; regulator_id: string | null; created_at: string; }
export interface SubSectorRow { id: string; sector_id: string; name: string; status: string; created_at: string; sector_name?: string; }
export interface CategoryRow { id: string; sector_id: string; sub_sector_id: string; name: string; status: string; created_at: string; sector_name?: string; sub_sector_name?: string; }
export interface ServiceRow { id: string; sector_id: string; sub_sector_id: string; name: string; status: string; created_at: string; sector_name?: string; sub_sector_name?: string; }

// Helper to parse unique constraint violation into a user-friendly message
function parseDuplicateError(error: any, entityType: string): string {
  const msg = error?.message || '';
  if (msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('23505')) {
    switch (entityType) {
      case 'sector': return 'A sector with this name already exists.';
      case 'sub_sector': return 'A sub-sector with this name already exists in the selected sector.';
      case 'category': return 'A category with this name already exists for this sector and sub-sector combination.';
      case 'service': return 'A service with this name already exists for this sector and sub-sector combination.';
      default: return 'A record with this name already exists.';
    }
  }
  return msg || 'An unexpected error occurred.';
}

export function useSectors(regulatorId?: string | null) {
  return useQuery({
    queryKey: ['sectors', regulatorId],
    queryFn: async () => {
      let query = supabase.from('sectors' as any).select('*').order('name');
      if (regulatorId) query = query.eq('regulator_id', regulatorId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as SectorRow[];
    },
  });
}

export function useSubSectors(regulatorId?: string | null) {
  return useQuery({
    queryKey: ['sub_sectors', regulatorId],
    queryFn: async () => {
      let query = supabase.from('sub_sectors' as any).select('*, sectors!inner(name, regulator_id)').order('name');
      if (regulatorId) query = query.eq('sectors.regulator_id', regulatorId);
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as any[]).map((r: any) => ({ ...r, sector_name: r.sectors?.name })) as SubSectorRow[];
    },
  });
}

export function useCategories(regulatorId?: string | null) {
  return useQuery({
    queryKey: ['categories', regulatorId],
    queryFn: async () => {
      let query = supabase.from('categories' as any).select('*, sectors!inner(name, regulator_id), sub_sectors!inner(name)').order('name');
      if (regulatorId) query = query.eq('sectors.regulator_id', regulatorId);
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as any[]).map((r: any) => ({ ...r, sector_name: r.sectors?.name, sub_sector_name: r.sub_sectors?.name })) as CategoryRow[];
    },
  });
}

export function useServices(regulatorId?: string | null) {
  return useQuery({
    queryKey: ['services', regulatorId],
    queryFn: async () => {
      let query = supabase.from('services' as any).select('*, sectors!inner(name, regulator_id), sub_sectors!inner(name)').order('name');
      if (regulatorId) query = query.eq('sectors.regulator_id', regulatorId);
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as any[]).map((r: any) => ({ ...r, sector_name: r.sectors?.name, sub_sector_name: r.sub_sectors?.name })) as ServiceRow[];
    },
  });
}

export function useMasterMutations() {
  const qc = useQueryClient();

  // GAP-F1-03: all taxonomy writes go through the governed config writer, which
  // enforces `settings.edit` and records before/after audit evidence.
  const saveVia = async (
    table: 'sectors' | 'sub_sectors' | 'categories' | 'services',
    entity: string,
    payload: Record<string, unknown>,
    id?: string,
  ) => {
    try {
      await configSave(table, payload, { id: id ?? null, entityLabel: entity.replace(/_/g, ' ') });
    } catch (error) {
      throw new Error(parseDuplicateError(error, entity));
    }
  };

  const retireVia = async (
    table: 'sectors' | 'sub_sectors' | 'categories' | 'services',
    entity: string,
    id: string,
  ) => {
    try {
      await configRetire(table, id, { entityLabel: entity.replace(/_/g, ' ') });
    } catch (error) {
      throw toConfigWriteError(error, entity.replace(/_/g, ' '));
    }
  };

  const upsertSector = useMutation({
    mutationFn: (row: { id?: string; name: string; status: string; regulator_id?: string | null }) =>
      saveVia('sectors', 'sector', { name: row.name, status: row.status, regulator_id: row.regulator_id || null }, row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sectors'] }),
  });

  const deleteSector = useMutation({
    mutationFn: (id: string) => retireVia('sectors', 'sector', id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sectors'] }),
  });

  const upsertSubSector = useMutation({
    mutationFn: (row: { id?: string; sector_id: string; name: string; status: string }) =>
      saveVia('sub_sectors', 'sub_sector', { sector_id: row.sector_id, name: row.name, status: row.status }, row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub_sectors'] }),
  });

  const deleteSubSector = useMutation({
    mutationFn: (id: string) => retireVia('sub_sectors', 'sub_sector', id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sub_sectors'] }),
  });

  const upsertCategory = useMutation({
    mutationFn: (row: { id?: string; sector_id: string; sub_sector_id: string; name: string; status: string }) =>
      saveVia('categories', 'category', {
        sector_id: row.sector_id, sub_sector_id: row.sub_sector_id, name: row.name, status: row.status,
      }, row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => retireVia('categories', 'category', id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const upsertService = useMutation({
    mutationFn: (row: { id?: string; sector_id: string; sub_sector_id: string; name: string; status: string }) =>
      saveVia('services', 'service', {
        sector_id: row.sector_id, sub_sector_id: row.sub_sector_id, name: row.name, status: row.status,
      }, row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const deleteService = useMutation({
    mutationFn: (id: string) => retireVia('services', 'service', id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  return { upsertSector, deleteSector, upsertSubSector, deleteSubSector, upsertCategory, deleteCategory, upsertService, deleteService };
}
