import { supabase } from '@/integrations/supabase/client';

export type TwinPeaksRole = 'prudential' | 'conduct';
export type TwinPeaksStatus = 'pending' | 'clear' | 'conditional' | 'blocked';

export interface TwinPeaksClearance {
  id: string;
  application_id: string;
  regulator_role: TwinPeaksRole;
  status: TwinPeaksStatus;
  conditions: string[];
  rationale: string | null;
  recorded_by: string | null;
  recorded_at: string | null;
}

export interface TwinPeaksDisagreement {
  id: string;
  application_id: string;
  raised_by: string | null;
  raised_at: string;
  description: string;
  status: 'open' | 'resolved' | 'escalated';
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

export async function fetchClearances(applicationId: string): Promise<TwinPeaksClearance[]> {
  const { data, error } = await (supabase as any)
    .from('twinpeaks_clearances')
    .select('*')
    .eq('application_id', applicationId);
  if (error) throw error;
  return (data ?? []) as TwinPeaksClearance[];
}

export async function upsertClearance(input: {
  application_id: string;
  regulator_role: TwinPeaksRole;
  status: TwinPeaksStatus;
  conditions?: string[];
  rationale?: string | null;
  recorded_by?: string | null;
}) {
  const { data, error } = await (supabase as any)
    .from('twinpeaks_clearances')
    .upsert(
      {
        application_id: input.application_id,
        regulator_role: input.regulator_role,
        status: input.status,
        conditions: input.conditions ?? [],
        rationale: input.rationale ?? null,
        recorded_by: input.recorded_by ?? null,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: 'application_id,regulator_role' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as TwinPeaksClearance;
}

export async function fetchDisagreements(applicationId: string): Promise<TwinPeaksDisagreement[]> {
  const { data, error } = await (supabase as any)
    .from('twinpeaks_disagreements')
    .select('*')
    .eq('application_id', applicationId)
    .order('raised_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TwinPeaksDisagreement[];
}

export async function raiseDisagreement(input: {
  application_id: string;
  description: string;
  raised_by?: string | null;
}) {
  const { data, error } = await (supabase as any)
    .from('twinpeaks_disagreements')
    .insert({
      application_id: input.application_id,
      description: input.description,
      raised_by: input.raised_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TwinPeaksDisagreement;
}

export async function resolveDisagreement(input: {
  id: string;
  resolution: string;
  resolved_by?: string | null;
  status?: 'resolved' | 'escalated';
}) {
  const { error } = await (supabase as any)
    .from('twinpeaks_disagreements')
    .update({
      status: input.status ?? 'resolved',
      resolution: input.resolution,
      resolved_by: input.resolved_by ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (error) throw error;
}

export function isTwinPeaksBlocked(clearances: TwinPeaksClearance[]): boolean {
  return clearances.some((c) => c.status === 'blocked');
}
