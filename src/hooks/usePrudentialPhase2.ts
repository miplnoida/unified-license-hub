/**
 * Phase 2 — Prudential supervisory intelligence data hooks.
 *
 * Early Warning Indicators (PRU-ANA-001), configurable CAMELS components
 * (PRU-ASS-001) and group data-coverage state (PRU-GRP-001). All writes go
 * through RLS-protected tables or SECURITY DEFINER RPCs that re-check
 * `can_act_on_prudential` / `can_read_prudential_entity` server-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GroupDataState } from '@/lib/prudentialPhase2';

const sb = supabase as any;

// ---------------- EWI rules & alerts ----------------
export interface EwiRule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rule_type: 'repeated_breach' | 'multi_ratio_warning' | 'sharp_deterioration' | 'adverse_trend' | 'late_return';
  sector_id: string | null;
  params: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  version: number;
  is_active: boolean;
}

export interface EwiAlert {
  id: string;
  entity_id: string;
  rule_id: string;
  rule_code: string;
  rule_version: number;
  period_end: string | null;
  metric_key: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'dismissed' | 'resolved';
  evidence: Record<string, any>;
  executed_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  notes: string | null;
  prudential_ewi_rules?: { name: string; description: string | null; rule_type: string } | null;
}

export function useEwiRules() {
  return useQuery({
    queryKey: ['prudential_ewi_rules'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('prudential_ewi_rules')
        .select('*')
        .order('code');
      if (error) throw error;
      return (data ?? []) as EwiRule[];
    },
  });
}

export function useEwiAlerts(entityId?: string | null) {
  return useQuery({
    queryKey: ['prudential_ewi_alerts', entityId ?? 'all'],
    enabled: entityId !== undefined,
    queryFn: async () => {
      let q = sb
        .from('prudential_ewi_alerts')
        .select('*, prudential_ewi_rules(name, description, rule_type)')
        .order('executed_at', { ascending: false });
      if (entityId) q = q.eq('entity_id', entityId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EwiAlert[];
    },
  });
}

/** Runs every active EWI rule for an entity/period and persists explainable alerts. */
export function useEvaluateEwi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entityId, periodEnd }: { entityId: string; periodEnd: string }) => {
      const { data, error } = await sb.rpc('prudential_ewi_evaluate', {
        _entity_id: entityId,
        _period_end: periodEnd,
      });
      if (error) throw error;
      return data as { alerts_written: number; executed_at: string };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['prudential_ewi_alerts'] });
      toast.success(`Early warning evaluation complete — ${r?.alerts_written ?? 0} indicator(s) recorded`);
    },
    onError: (e: any) => toast.error(e.message || 'Early warning evaluation failed'),
  });
}

export function useAcknowledgeEwi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes, status }: { id: string; notes?: string; status?: 'acknowledged' | 'dismissed' | 'resolved' }) => {
      const { data, error } = await sb.rpc('prudential_ewi_acknowledge', {
        _alert_id: id,
        _notes: notes ?? null,
        _status: status ?? 'acknowledged',
      });
      if (error) throw error;
      return data as EwiAlert;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prudential_ewi_alerts'] });
      toast.success('Indicator updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update indicator'),
  });
}

// ---------------- CAMELS components ----------------
export interface AssessmentComponent {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sector_id: string | null;
  weight: number;
  sort_order: number;
  is_active: boolean;
}

export interface ComponentRating {
  id: string;
  assessment_id: string;
  component_id: string | null;
  component_code: string;
  rating: string | null;
  auto_suggested_rating: string | null;
  suggestion_source: Record<string, any>;
  narrative: string | null;
  evidence: any[];
  override_justification: string | null;
  updated_at: string;
}

/** Configurable component set; sector-specific rows win over the global set. */
export function useAssessmentComponents(sectorId?: string | null) {
  return useQuery({
    queryKey: ['prudential_assessment_components', sectorId ?? 'global'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('prudential_assessment_components')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      const rows = (data ?? []) as AssessmentComponent[];
      const sectorRows = sectorId ? rows.filter((r) => r.sector_id === sectorId) : [];
      return sectorRows.length ? sectorRows : rows.filter((r) => r.sector_id === null);
    },
  });
}

export function useComponentRatings(assessmentId?: string | null) {
  return useQuery({
    queryKey: ['prudential_assessment_component_ratings', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('prudential_assessment_component_ratings')
        .select('*')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      return (data ?? []) as ComponentRating[];
    },
  });
}

export function useUpsertComponentRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<ComponentRating> & { assessment_id: string; component_code: string }) => {
      // Governed operation: assessment-state and authority checks plus the
      // audit entry are enforced server-side.
      const saved = await prudentialComponentRatingSave({
        assessmentId: row.assessment_id,
        componentCode: row.component_code,
        rating: (row as any).rating,
        narrative: (row as any).narrative ?? null,
        componentId: (row as any).component_id ?? null,
        evidence: (row as any).evidence ?? [],
        autoSuggestedRating: (row as any).auto_suggested_rating ?? null,
        suggestionSource: (row as any).suggestion_source ?? null,
        overrideJustification: (row as any).override_justification ?? null,
      });
      return saved as ComponentRating;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prudential_assessment_component_ratings'] });
      toast.success('Component rating saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save component rating'),
  });
}

// ---------------- Group data coverage ----------------
export interface GroupCoverage {
  members_total: number;
  members_missing: number;
  members_with_data: number;
  excluded_members: Array<{ licensee_id: string; name: string | null; reason: string }>;
  data_state: GroupDataState;
}

export function useGroupDataCoverage(groupId?: string | null, periodKey?: string | null) {
  return useQuery({
    queryKey: ['group_data_coverage', groupId, periodKey],
    enabled: !!groupId && !!periodKey,
    queryFn: async () => {
      const { data, error } = await sb.rpc('group_data_coverage', {
        _group_id: groupId,
        _period_key: periodKey,
      });
      if (error) throw error;
      return data as GroupCoverage;
    },
  });
}
