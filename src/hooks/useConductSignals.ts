/**
 * MC-05 — Conduct signal register and case read models.
 *
 * Both lists are served, filtered, paged and counted by the governed server
 * read models (`conduct_signal_register`, `conduct_signal_case`). The browser
 * never selects from the signal tables directly and never writes to them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  signalAssign, signalCreate, signalDismiss, signalEscalateToAlert,
  signalLinkAlert, signalLinkEvidence, signalReopen, signalValidate,
} from '@/lib/conductSignalOps';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface SignalRow {
  id: string;
  reference: string;
  title: string;
  summary: string | null;
  source_type: string;
  signal_category: string | null;
  severity: string;
  risk_score: number | null;
  systemic_potential: string;
  status: string;
  entity_id: string | null;
  entity_name: string | null;
  sector_id: string | null;
  product_name: string | null;
  channel_name: string | null;
  risk_category_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  rationale: string | null;
  disposition: string | null;
  disposition_reason: string | null;
  created_at: string;
  validated_at: string | null;
  dismissed_at: string | null;
  escalated_at: string | null;
  escalated_alert_id: string | null;
  alert_links: number;
  source_links: number;
  evidence_count: number;
  last_activity_at: string | null;
  canonical_href: string;
  total_count: number;
}

export interface SignalFilters {
  statuses?: string[] | null;
  severities?: string[] | null;
  sourceTypes?: string[] | null;
  entityId?: string | null;
  ownerId?: string | null;
  search?: string | null;
  includeDisposed?: boolean;
  limit?: number;
  offset?: number;
}

export function useSignalRegister(filters: SignalFilters = {}) {
  return useQuery({
    queryKey: ['conduct_signal_register', filters],
    queryFn: () => rpc<SignalRow[]>('conduct_signal_register', {
      _statuses: filters.statuses ?? null,
      _severities: filters.severities ?? null,
      _source_types: filters.sourceTypes ?? null,
      _entity_id: filters.entityId ?? null,
      _owner_id: filters.ownerId ?? null,
      _search: filters.search ?? null,
      _include_disposed: filters.includeDisposed ?? false,
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
  });
}

export interface SignalSource {
  id: string;
  source_type: string;
  source_table: string | null;
  source_id: string | null;
  source_reference: string | null;
  note: string | null;
  created_at: string;
}

export interface SignalAlertLink {
  link_id: string;
  link_type: string;
  rationale: string | null;
  alert_id: string;
  alert_title: string | null;
  alert_status: string | null;
  alert_severity: string | null;
  alert_created_at: string | null;
}

export interface SignalEvidenceItem {
  id: string;
  title: string | null;
  evidence_type: string | null;
  restricted: boolean | null;
  uploaded_at: string | null;
}

export interface SignalHistoryItem {
  id: string;
  action_code: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
}

export interface SignalCase {
  signal: SignalRow & {
    licensee_id: string | null;
    regulator_id: string | null;
    assigned_at: string | null;
    reopened_at: string | null;
    closed_at: string | null;
  };
  sources: SignalSource[];
  alerts: SignalAlertLink[];
  evidence: SignalEvidenceItem[];
  history: SignalHistoryItem[];
}

export function useSignalCase(signalId?: string) {
  return useQuery({
    queryKey: ['conduct_signal_case', signalId],
    enabled: !!signalId,
    queryFn: () => rpc<SignalCase>('conduct_signal_case', { _signal_id: signalId }),
  });
}

/* ------------------------------------------------------------- mutations */

function useSignalMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  successMessage: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conduct_signal_case'] });
      qc.invalidateQueries({ queryKey: ['conduct_signal_register'] });
      qc.invalidateQueries({ queryKey: ['conduct_alert_register'] });
      qc.invalidateQueries({ queryKey: ['conduct-evidence'] });
      toast.success(successMessage);
    },
    onError: (e: Error) => toast.error(e.message || 'The action could not be completed'),
  });
}

export const useCreateSignal = () =>
  useSignalMutation<Record<string, unknown>>((p) => signalCreate(p), 'Signal raised');

export const useAssignSignal = () =>
  useSignalMutation<{ id: string; ownerId: string; note?: string }>(
    (a) => signalAssign(a.id, a.ownerId, a.note), 'Owner assigned');

export const useValidateSignal = () =>
  useSignalMutation<{ id: string; rationale: string; severity?: string | null; systemicPotential?: string | null; riskScore?: number | null }>(
    (a) => signalValidate(a.id, a.rationale, a), 'Signal validated');

export const useDismissSignal = () =>
  useSignalMutation<{ id: string; reason: string }>((a) => signalDismiss(a.id, a.reason), 'Signal dismissed');

export const useReopenSignal = () =>
  useSignalMutation<{ id: string; reason: string }>((a) => signalReopen(a.id, a.reason), 'Signal reopened');

export const useEscalateSignal = () =>
  useSignalMutation<{ id: string; rationale: string; severity?: string | null }>(
    (a) => signalEscalateToAlert(a.id, a.rationale, a.severity), 'Signal escalated — alert raised');

export const useLinkSignalAlert = () =>
  useSignalMutation<{ id: string; alertId: string; rationale: string; linkType?: 'related' | 'source' }>(
    (a) => signalLinkAlert(a.id, a.alertId, a.rationale, a.linkType ?? 'related'), 'Alert linked');

export const useLinkSignalEvidence = () =>
  useSignalMutation<{ id: string; evidenceId: string; note?: string }>(
    (a) => signalLinkEvidence(a.id, a.evidenceId, a.note), 'Evidence linked');
