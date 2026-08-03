import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase as any).rpc(fn, args ?? {});

export interface EscalationFilters {
  modules?: string[];
  types?: string[];
  severities?: string[];
  tiers?: number[];
  statuses?: string[];
  owner?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EscalationRow {
  id: string;
  escalation_ref: string;
  source_module: string;
  source_event: string;
  source_reference: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  escalation_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  current_tier: number;
  status: string;
  assigned_role: string | null;
  assigned_user_id: string | null;
  owner_name: string | null;
  rule_name: string | null;
  acknowledgement_deadline: string | null;
  acknowledged_at: string | null;
  resolution_deadline: string | null;
  resolved_at: string | null;
  created_at: string;
  hours_open: number;
  ack_overdue: boolean;
  resolution_overdue: boolean;
}

export function useEscalationFeed(filters: EscalationFilters) {
  return useQuery({
    queryKey: ['escalation_feed', filters],
    queryFn: async () => {
      const { data, error } = await rpc('escalation_feed', {
        _modules: filters.modules?.length ? filters.modules : null,
        _types: filters.types?.length ? filters.types : null,
        _severities: filters.severities?.length ? filters.severities : null,
        _tiers: filters.tiers?.length ? filters.tiers : null,
        _statuses: filters.statuses?.length ? filters.statuses : null,
        _owner: filters.owner || null,
        _from: filters.from || null,
        _to: filters.to || null,
        _search: filters.search || null,
        _limit: filters.limit ?? 50,
        _offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return (data ?? { rows: [], total: 0 }) as { rows: EscalationRow[]; total: number };
    },
    staleTime: 15_000,
  });
}

export function useEscalationStats() {
  return useQuery({
    queryKey: ['escalation_stats'],
    queryFn: async () => {
      const { data, error } = await rpc('escalation_stats');
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
    staleTime: 30_000,
  });
}

export function useEscalationDetail(id: string | null) {
  return useQuery({
    queryKey: ['escalation_detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await rpc('escalation_detail', { _id: id });
      if (error) throw error;
      return data as any;
    },
  });
}

export function useEscalationRules() {
  return useQuery({
    queryKey: ['escalation_rules'],
    queryFn: async () => {
      const { data, error } = await rpc('escalation_rules_list');
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
}

export function useEscalationHealth() {
  return useQuery({
    queryKey: ['escalation_health'],
    queryFn: async () => {
      const { data, error } = await rpc('escalation_health_report');
      if (error) throw error;
      return (data ?? { signals: [], open_health_escalations: [] }) as {
        signals: Array<{
          signal_key: string;
          subject: string;
          failure_count: number;
          last_seen: string;
          escalation_type: string;
        }>;
        open_health_escalations: any[];
      };
    },
    staleTime: 30_000,
  });
}

export function useEscalationRulePreview(ruleId: string | null) {
  return useQuery({
    queryKey: ['escalation_rule_preview', ruleId],
    enabled: !!ruleId,
    queryFn: async () => {
      const { data, error } = await rpc('escalation_rule_preview', { _rule_id: ruleId });
      if (error) throw error;
      return data as any;
    },
  });
}

function useEscalationMutation<TArgs>(fn: string, build: (a: TArgs) => Record<string, unknown>, success: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { data, error } = await rpc(fn, build(args));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(success);
      qc.invalidateQueries({ queryKey: ['escalation_feed'] });
      qc.invalidateQueries({ queryKey: ['escalation_stats'] });
      qc.invalidateQueries({ queryKey: ['escalation_detail'] });
      qc.invalidateQueries({ queryKey: ['escalation_health'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Action failed'),
  });
}

export const useAcknowledgeEscalation = () =>
  useEscalationMutation<{ id: string; note?: string }>(
    'escalation_acknowledge',
    (a) => ({ _id: a.id, _note: a.note ?? null }),
    'Escalation acknowledged',
  );

export const useTakeEscalationOwnership = () =>
  useEscalationMutation<{ id: string; note?: string }>(
    'escalation_take_ownership',
    (a) => ({ _id: a.id, _note: a.note ?? null }),
    'You now own this escalation',
  );

export const useEscalateTier = () =>
  useEscalationMutation<{ id: string; reason?: string }>(
    'escalation_escalate_tier',
    (a) => ({ _id: a.id, _reason: a.reason ?? null }),
    'Escalated to the next tier',
  );

export const useResolveEscalation = () =>
  useEscalationMutation<{ id: string; narrative: string; rootCause?: string; close?: boolean }>(
    'escalation_resolve',
    (a) => ({
      _id: a.id,
      _resolution_narrative: a.narrative,
      _root_cause: a.rootCause ?? null,
      _close: a.close ?? false,
    }),
    'Escalation resolved',
  );

export function useSaveEscalationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await rpc('escalation_rule_save', { _payload: payload });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success('Routing rule saved');
      qc.invalidateQueries({ queryKey: ['escalation_rules'] });
      qc.invalidateQueries({ queryKey: ['escalation_rule_preview'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save rule'),
  });
}

export const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  medium: 'bg-primary/10 text-primary border-primary/30',
  low: 'bg-muted text-muted-foreground border-border',
};

export const TIER_LABEL: Record<number, string> = {
  0: 'Initial',
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
};

export const humanise = (v?: string | null) =>
  (v ?? '').replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
