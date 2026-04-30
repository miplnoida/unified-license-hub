import { supabase } from '@/integrations/supabase/client';

export interface ApplicationFeeLine {
  id: string;
  name: string;
  amount: number;
}

const formatFeeType = (t?: string | null) => {
  if (!t) return 'Fee';
  const cleaned = t.replace(/[_-]+/g, ' ').trim();
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
};

export async function resolveApplicationFeeBreakdown(applicationId: string): Promise<ApplicationFeeLine[]> {
  const { data: feeRows } = await supabase
    .from('fee_components' as any)
    .select('id, amount, description, fee_type_id')
    .eq('application_id', applicationId);

  const componentRows = ((feeRows || []) as unknown) as Array<{ id: string; amount: number; description?: string | null; fee_type_id?: string | null }>;
  if (componentRows.length > 0) {
    const feeTypeIds = [...new Set(componentRows.map(f => f.fee_type_id).filter(Boolean))] as string[];
    let feeTypeNameById = new Map<string, string>();
    if (feeTypeIds.length > 0) {
      const { data: feeTypes } = await supabase
        .from('fee_types' as any)
        .select('id, name')
        .in('id', feeTypeIds);
      feeTypeNameById = new Map((feeTypes || []).map((row: any) => [row.id, row.name]));
    }

    const seen = new Set<string>();
    return componentRows.filter((row) => {
      const key = (feeTypeNameById.get(row.fee_type_id || '') || row.description || '').trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((row) => ({
      id: row.id,
      name: formatFeeType(feeTypeNameById.get(row.fee_type_id || '') || row.description),
      amount: Number(row.amount || 0),
    }));
  }

  const { data: application } = await supabase
    .from('applications')
    .select('data')
    .eq('id', applicationId)
    .maybeSingle();

  const appData = (application?.data || {}) as Record<string, any>;
  const selectedSector = appData.sector_id as string | undefined;
  const selectedSubSector = appData.sub_sector_id as string | undefined;
  const selectedCategory = appData.category_id as string | undefined;

  if (!selectedSector) return [];

  const { data: fees } = await supabase
    .from('fee_configurations')
    .select('*')
    .eq('is_active', true)
    .or(`sector_id.eq.${selectedSector},sector_id.is.null`)
    .order('fee_type')
    .order('name');

  const ranked = (fees || [])
    .map((f: any) => ({
      ...f,
      specificity:
        (f.category_id === selectedCategory ? 4 : 0) +
        (f.sub_sector_id === selectedSubSector ? 2 : 0) +
        (f.sector_id === selectedSector ? 1 : 0),
    }))
    .filter((f: any) =>
      (!f.sub_sector_id || f.sub_sector_id === selectedSubSector) &&
      (!f.category_id || f.category_id === selectedCategory)
    )
    .sort((a: any, b: any) => b.specificity - a.specificity);

  const seen = new Set<string>();
  return ranked.filter((row: any) => {
    const key = (row.fee_type || '').trim().toLowerCase();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row: any) => ({
    id: row.id,
    name: formatFeeType(row.fee_type),
    amount: Number(row.amount || 0),
  }));
}