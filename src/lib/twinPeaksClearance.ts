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
  const { data, error } = await (supabase as any).rpc('twinpeaks_record_clearance', {
    _application_id: input.application_id,
    _regulator_role: input.regulator_role,
    _status: input.status,
    _conditions: input.conditions ?? [],
    _rationale: input.rationale ?? null,
  });
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
  const { data, error } = await (supabase as any).rpc('twinpeaks_raise_disagreement', {
    _application_id: input.application_id,
    _description: input.description,
  });
  if (error) throw error;
  return data as TwinPeaksDisagreement;
}

export async function resolveDisagreement(input: {
  id: string;
  resolution: string;
  resolved_by?: string | null;
  status?: 'resolved' | 'escalated';
}) {
  const { error } = await (supabase as any).rpc('twinpeaks_resolve_disagreement', {
    _disagreement_id: input.id,
    _resolution: input.resolution,
  });
  if (error) throw error;
}

export function isTwinPeaksBlocked(clearances: TwinPeaksClearance[]): boolean {
  return clearances.some((c) => c.status === 'blocked');
}
