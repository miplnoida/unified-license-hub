// ============================================================
// Market Surveillance (Phase 8) client access.
//
// Signal dispositions and investigation referrals are performed exclusively
// through SECURITY DEFINER RPCs — the client never writes disposition columns
// directly (a DB guard rejects it).
// ============================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as any;

export type SignalDisposition =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'FALSE_POSITIVE'
  | 'MONITOR'
  | 'ESCALATED'
  | 'CLOSED';

export const DISPOSITION_LABELS: Record<SignalDisposition, string> = {
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  FALSE_POSITIVE: 'False positive',
  MONITOR: 'Monitor',
  ESCALATED: 'Escalated',
  CLOSED: 'Closed',
};

/** Dispositions a reviewer can set from the workspace (ESCALATED goes via referral). */
export const SETTABLE_DISPOSITIONS: SignalDisposition[] = [
  'UNDER_REVIEW',
  'MONITOR',
  'FALSE_POSITIVE',
  'CLOSED',
];

export const TERMINAL_DISPOSITIONS: SignalDisposition[] = ['ESCALATED', 'CLOSED', 'FALSE_POSITIVE'];

export interface ConductSignal {
  id: string;
  kind: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  title: string;
  explanation: string | null;
  disposition: SignalDisposition;
  disposition_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  observation_start: string | null;
  observation_end: string | null;
  instrument_ref: string | null;
  monitoring_result_id: string | null;
  rule_version: number | null;
  threshold_value: number | null;
  investigation_id: string | null;
  licensee_id: string | null;
  complaint_id: string | null;
  triage_rule_id: string | null;
  source_record_ids: string[] | null;
  rule_snapshot: Record<string, unknown> | null;
  created_at: string;
  licensees?: { name: string } | null;
  conduct_products?: { name: string } | null;
  conduct_channels?: { name: string } | null;
  conduct_risk_categories?: { name: string } | null;
}

export interface SignalEvent {
  id: string;
  signal_id: string;
  from_disposition: string | null;
  to_disposition: string;
  reason: string | null;
  actor_id: string | null;
  investigation_id: string | null;
  created_at: string;
}

export interface SignalEvidence {
  id: string;
  signal_id: string;
  document_id: string | null;
  storage_path: string | null;
  label: string | null;
  note: string | null;
  added_by: string | null;
  created_at: string;
}

const SELECT =
  '*, licensees(name), conduct_products(name), conduct_channels(name), conduct_risk_categories(name)';

export function useSurveillanceSignals(filters: {
  disposition?: string;
  severity?: string;
  kind?: string;
  licensee_id?: string;
} = {}) {
  return useQuery({
    queryKey: ['surveillance-signals', filters],
    queryFn: async (): Promise<ConductSignal[]> => {
      let q = sb
        .from('conduct_alerts')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(300);
      if (filters.disposition && filters.disposition !== 'all') q = q.eq('disposition', filters.disposition);
      if (filters.severity && filters.severity !== 'all') q = q.eq('severity', filters.severity);
      if (filters.kind && filters.kind !== 'all') q = q.eq('kind', filters.kind);
      if (filters.licensee_id) q = q.eq('licensee_id', filters.licensee_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ConductSignal[];
    },
  });
}

export function useSignalEvents(signalId: string | undefined) {
  return useQuery({
    enabled: !!signalId,
    queryKey: ['surveillance-signal-events', signalId],
    queryFn: async (): Promise<SignalEvent[]> => {
      const { data, error } = await sb
        .from('conduct_signal_events')
        .select('*')
        .eq('signal_id', signalId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SignalEvent[];
    },
  });
}

export function useSignalEvidence(signalId: string | undefined) {
  return useQuery({
    enabled: !!signalId,
    queryKey: ['surveillance-signal-evidence', signalId],
    queryFn: async (): Promise<SignalEvidence[]> => {
      const { data, error } = await sb
        .from('conduct_signal_evidence')
        .select('*')
        .eq('signal_id', signalId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SignalEvidence[];
    },
  });
}

function invalidateSignal(qc: ReturnType<typeof useQueryClient>, signalId: string) {
  qc.invalidateQueries({ queryKey: ['surveillance-signals'] });
  qc.invalidateQueries({ queryKey: ['surveillance-signal-events', signalId] });
}

export function useSetSignalDisposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { signal_id: string; disposition: SignalDisposition; reason?: string }) => {
      const { error } = await sb.rpc('set_conduct_signal_disposition', {
        _signal_id: args.signal_id,
        _disposition: args.disposition,
        _reason: args.reason?.trim() || null,
      });
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => {
      invalidateSignal(qc, args.signal_id);
      toast.success(`Signal marked ${DISPOSITION_LABELS[args.disposition].toLowerCase()}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useReferSignalToInvestigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      signal_id: string;
      allegation: string;
      reason?: string;
      priority?: string;
      due_date?: string | null;
    }) => {
      const { data, error } = await sb.rpc('refer_conduct_signal_to_investigation', {
        _signal_id: args.signal_id,
        _allegation: args.allegation.trim(),
        _reason: args.reason?.trim() || null,
        _priority: args.priority || 'medium',
        _due_date: args.due_date || null,
      });
      if (error) throw new Error(error.message);
      return { investigation_id: data as string, signal_id: args.signal_id };
    },
    onSuccess: (res) => {
      invalidateSignal(qc, res.signal_id);
      qc.invalidateQueries({ queryKey: ['conduct-investigations'] });
      toast.success('Signal escalated to a formal investigation');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddSignalEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { signal_id: string; label: string; note?: string; storage_path?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb.from('conduct_signal_evidence').insert({
        signal_id: args.signal_id,
        label: args.label.trim(),
        note: args.note?.trim() || null,
        storage_path: args.storage_path || null,
        added_by: u.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      return args;
    },
    onSuccess: (args) => {
      qc.invalidateQueries({ queryKey: ['surveillance-signal-evidence', args.signal_id] });
      toast.success('Evidence recorded');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** Bucket counts derived from the loaded signal set — no fabricated data. */
export function deriveDispositionCounts(signals: ConductSignal[]) {
  const counts: Record<string, number> = {
    all: signals.length,
    NEW: 0,
    UNDER_REVIEW: 0,
    MONITOR: 0,
    FALSE_POSITIVE: 0,
    ESCALATED: 0,
    CLOSED: 0,
  };
  for (const s of signals) {
    const key = s.disposition ?? 'NEW';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
