import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as any;

export interface FinancialGroupRow {
  id: string;
  group_code: string;
  name: string;
  holding_entity_id: string | null;
  holding_entity_name?: string | null;
  sector_id: string | null;
  supervisory_lead_id: string | null;
  status: string;
  notes: string | null;
  member_count?: number;
  band?: string | null;
  score?: number | null;
  last_period?: string | null;
  open_alerts?: number;
}

/** Group register with member counts, current score and open EWI counts. */
export function useFinancialGroups() {
  return useQuery({
    queryKey: ['financial_groups'],
    queryFn: async (): Promise<FinancialGroupRow[]> => {
      const { data: groups, error } = await sb
        .from('financial_groups')
        .select('*, licensees:holding_entity_id(name)')
        .order('name');
      if (error) throw error;
      const ids = (groups ?? []).map((g: any) => g.id);
      if (!ids.length) return [];

      const [membersR, scoresR, alertsR] = await Promise.all([
        sb.from('financial_group_members').select('group_id').in('group_id', ids),
        sb.from('group_risk_scores').select('group_id, score, band, period_key, is_current').in('group_id', ids),
        sb.from('group_ewi_alerts').select('group_id, status').in('group_id', ids).eq('status', 'open'),
      ]);

      const memberCount = new Map<string, number>();
      (membersR.data ?? []).forEach((m: any) => memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1));
      const alertCount = new Map<string, number>();
      (alertsR.data ?? []).forEach((a: any) => alertCount.set(a.group_id, (alertCount.get(a.group_id) ?? 0) + 1));
      const current = new Map<string, any>();
      (scoresR.data ?? []).forEach((s: any) => { if (s.is_current) current.set(s.group_id, s); });

      return (groups ?? []).map((g: any) => ({
        ...g,
        holding_entity_name: g.licensees?.name ?? null,
        member_count: memberCount.get(g.id) ?? 0,
        open_alerts: alertCount.get(g.id) ?? 0,
        score: current.get(g.id)?.score ?? null,
        band: current.get(g.id)?.band ?? null,
        last_period: current.get(g.id)?.period_key ?? null,
      }));
    },
  });
}

/** Full consolidated payload: tree, ratios, matrix, heatmap, breaches, alerts. */
export function useGroupConsolidated(groupId?: string | null, periodKey?: string | null) {
  return useQuery({
    queryKey: ['group_consolidated', groupId, periodKey ?? 'latest'],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('prudential_group_consolidated', {
        _group_id: groupId, _period_key: periodKey || null,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

/** Periods that have any member return, newest first. */
/**
 * EPR-01 / P07 — group reporting periods from CANONICAL filings.
 * `prudential_group_periods()` derives the distinct canonical reporting periods
 * (`reporting_periods.period_label`) of the group's members server-side.
 */
export function useGroupPeriods(groupId?: string | null) {
  return useQuery({
    queryKey: ['group_periods', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb.rpc('prudential_group_periods', { _group_id: groupId });
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r) => r.period_key as string)
        .filter((k): k is string => !!k);
    },
  });
}


export function useGroupSnapshots(groupId?: string | null) {
  return useQuery({
    queryKey: ['group_snapshots', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await sb.from('group_consolidated_snapshots')
        .select('*').eq('group_id', groupId).order('computed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useGroupExposures(groupId?: string | null, periodKey?: string | null) {
  return useQuery({
    queryKey: ['intragroup_exposures', groupId, periodKey],
    enabled: !!groupId,
    queryFn: async () => {
      let q = sb.from('intragroup_exposures').select('*').eq('group_id', groupId).order('amount', { ascending: false });
      if (periodKey) q = q.eq('period_key', periodKey);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useInvalidateGroup(groupId?: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['group_consolidated', groupId] });
    qc.invalidateQueries({ queryKey: ['intragroup_exposures', groupId] });
    qc.invalidateQueries({ queryKey: ['group_snapshots', groupId] });
    qc.invalidateQueries({ queryKey: ['group_periods', groupId] });
    qc.invalidateQueries({ queryKey: ['financial_groups'] });
  };
}

export function useCreateFinancialGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { group_code: string; name: string; holding_entity_id?: string | null; sector_id?: string | null; supervisory_lead_id?: string | null; notes?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await sb.from('financial_groups')
        .insert({ ...row, created_by: auth?.user?.id ?? null }).select('id').single();
      if (error) throw error;
      // Seed a version 1 methodology so consolidation is always traceable.
      await sb.from('group_consolidation_methods').insert({
        group_id: data.id, version: 1, created_by: auth?.user?.id ?? null,
      });
      return data.id as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financial_groups'] }); toast.success('Financial group created'); },
    onError: (e: any) => toast.error(e.message || 'Failed to create group'),
  });
}

export function useUpdateFinancialGroup(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await sb.from('financial_groups').update(patch).eq('id', groupId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Group updated'); },
    onError: (e: any) => toast.error(e.message || 'Failed to update group'),
  });
}

export function useSaveGroupMember(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (row: Record<string, any>) => {
      const payload: Record<string, any> = { ...row, group_id: groupId };
      if (row.id) {
        const { id, ...rest } = payload;
        const { error } = await sb.from('financial_group_members').update(rest).eq('id', id);
        if (error) throw error;

      } else {
        const { error } = await sb.from('financial_group_members').insert(payload);
        if (error) throw error;
      }
      await logGroupAudit(groupId, 'GROUP_STRUCTURE_UPDATED', { member: row.licensee_id ?? row.id });
    },
    onSuccess: () => { invalidate(); toast.success('Group structure saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save member'),
  });
}

export function useRemoveGroupMember(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await sb.from('financial_group_members').delete().eq('id', memberId);
      if (error) throw error;
      await logGroupAudit(groupId, 'GROUP_STRUCTURE_UPDATED', { removed_member: memberId });
    },
    onSuccess: () => { invalidate(); toast.success('Member removed'); },
    onError: (e: any) => toast.error(e.message || 'Failed to remove member'),
  });
}

export function useSaveExposure(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (row: Record<string, any>) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload: Record<string, any> = { ...row, group_id: groupId, captured_by: auth?.user?.id ?? null };
      if (row.id) {
        const { id, ...rest } = payload;
        const { error } = await sb.from('intragroup_exposures').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('intragroup_exposures').insert(payload);
        if (error) throw error;
      }
      await logGroupAudit(groupId, 'INTRAGROUP_EXPOSURE_RECORDED', {
        from: row.from_entity_id, to: row.to_entity_id, period_key: row.period_key,
      });
    },
    onSuccess: () => { invalidate(); toast.success('Exposure saved'); },
    onError: (e: any) => toast.error(e.message || 'Failed to save exposure'),
  });
}

export function useDeleteExposure(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('intragroup_exposures').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Exposure deleted'); },
    onError: (e: any) => toast.error(e.message || 'Failed to delete exposure'),
  });
}

/** Saving methodology always creates a new version and deactivates the old one. */
export function useSaveMethodology(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (row: { ratio_rules: any[]; eliminate_exposure_types: string[]; large_exposure_pct: number; total_assets_ratio_key?: string | null; capital_ratio_key?: string | null; notes?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: latest } = await sb.from('group_consolidation_methods')
        .select('version').eq('group_id', groupId).order('version', { ascending: false }).limit(1).maybeSingle();
      const nextVersion = (latest?.version ?? 0) + 1;
      await sb.from('group_consolidation_methods').update({ is_active: false }).eq('group_id', groupId);
      const { error } = await sb.from('group_consolidation_methods').insert({
        ...row, group_id: groupId, version: nextVersion, is_active: true, created_by: auth?.user?.id ?? null,
      });
      if (error) throw error;
      return nextVersion;
    },
    onSuccess: (v) => { invalidate(); toast.success(`Methodology saved as version ${v}`); },
    onError: (e: any) => toast.error(e.message || 'Failed to save methodology'),
  });
}

export function useRecomputeGroup(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (periodKey: string) => {
      const { data, error } = await sb.rpc('group_consolidated_recompute', {
        _group_id: groupId, _period_key: periodKey,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => { invalidate(); toast.success('Consolidation recomputed'); },
    onError: (e: any) => toast.error(e.message || 'Recompute failed'),
  });
}

export function useAcknowledgeGroupAlert(groupId?: string | null) {
  const invalidate = useInvalidateGroup(groupId);
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb.from('group_ewi_alerts').update({
        status: 'acknowledged', acknowledged_by: auth?.user?.id ?? null, acknowledged_at: new Date().toISOString(),
      }).eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Alert acknowledged'); },
    onError: (e: any) => toast.error(e.message || 'Failed to acknowledge alert'),
  });
}

/** Membership lookup used by the entity profile Group Structure tab. */
export function useLicenseeGroupMembership(licenseeId?: string | null) {
  return useQuery({
    queryKey: ['licensee_group_membership', licenseeId],
    enabled: !!licenseeId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('licensee_group_membership', { _licensee_id: licenseeId });
      if (error) throw error;
      return data as { is_member: boolean; authorised?: boolean; group_id?: string; group_code?: string; group_name?: string; member_role?: string; ownership_percentage?: number | null; consolidation_treatment?: string };
    },
  });
}

export async function logGroupAudit(groupId: string | null | undefined, action: string, meta: Record<string, any> = {}) {
  if (!groupId) return;
  const { data: auth } = await supabase.auth.getUser();
  await sb.from('audit_logs').insert({
    user_id: auth?.user?.id ?? null,
    action,
    entity_type: 'financial_group',
    entity_id: groupId,
    new_value: meta,
  });
}
