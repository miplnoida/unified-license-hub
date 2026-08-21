/**
 * Phase 7 — supervisory action lifecycle (FRD 7A/7B).
 *
 * Every state transition goes through a SECURITY DEFINER RPC that derives the
 * actor from `auth.uid()` and re-checks permission server-side. The client only
 * renders what the server returns; it never decides who may respond, review or
 * close an action.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as any;

export type ActionBucket =
  | 'open'
  | 'due_soon'
  | 'overdue'
  | 'breached'
  | 'awaiting_evidence'
  | 'awaiting_review'
  | 'completed'
  | 'other';

export const ACTION_BUCKETS: Array<{ key: ActionBucket; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'breached', label: 'Breached' },
  { key: 'awaiting_evidence', label: 'Awaiting evidence' },
  { key: 'awaiting_review', label: 'Awaiting supervisor review' },
  { key: 'completed', label: 'Completed' },
];

export interface MonitoredAction {
  id: string;
  action_reference: string;
  entity_id: string | null;
  entity_name: string | null;
  title: string;
  action_type: string | null;
  severity: string | null;
  status: string;
  review_status: string;
  evidence_required: boolean;
  progress_percent: number;
  due_date: string | null;
  breached_at: string | null;
  source_type: string | null;
  source_id: string | null;
  assigned_to: string | null;
  bucket: ActionBucket;
}

export interface ActionMonitorResult {
  rows: MonitoredAction[];
  counts: Partial<Record<ActionBucket, number>>;
  generated_at: string;
}

/** Source drill-through target for a supervisory action. */
export function sourceLink(row: Pick<MonitoredAction, 'source_type' | 'source_id' | 'entity_id'>): string | null {
  if (!row.source_id) return row.entity_id ? `/entities/${row.entity_id}?view=prudential` : null;
  switch (row.source_type) {
    case 'assessment':
      return `/prudential/assessments/${row.source_id}`;
    case 'escalation':
      return '/prudential/escalations';
    case 'examination_finding':
      return '/prudential/examinations';
    case 'return_breach':
    case 'stress_indicator':
      return row.entity_id ? `/entities/${row.entity_id}?view=prudential` : null;
    default:
      return row.entity_id ? `/entities/${row.entity_id}?view=prudential` : null;
  }
}

export function useActionMonitor(entityId?: string | null, dueSoonDays = 7) {
  return useQuery({
    queryKey: ['prudential_action_monitor', entityId ?? null, dueSoonDays],
    staleTime: 15_000,
    queryFn: async (): Promise<ActionMonitorResult> => {
      const { data, error } = await sb.rpc('prudential_action_monitor', {
        _entity_id: entityId ?? null,
        _due_soon_days: dueSoonDays,
      });
      if (error) throw new Error(error.message);
      const res = (data || {}) as any;
      if (res.error) throw new Error(res.error);
      return { rows: res.rows ?? [], counts: res.counts ?? {}, generated_at: res.generated_at };
    },
  });
}

export interface ActionResponse {
  id: string;
  action_id: string;
  kind: 'entity_response' | 'supervisor_review';
  narrative: string | null;
  evidence_document_ids: string[];
  decision: 'accepted' | 'rejected' | null;
  submitted_by: string | null;
  submitted_at: string;
}

export function useActionResponses(actionId?: string | null) {
  return useQuery({
    queryKey: ['prudential_action_responses', actionId],
    enabled: !!actionId,
    queryFn: async (): Promise<ActionResponse[]> => {
      const { data, error } = await sb
        .from('prudential_action_responses')
        .select('*')
        .eq('action_id', actionId)
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ActionEvent {
  id: string;
  action_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
}

export function useActionEvents(actionId?: string | null) {
  return useQuery({
    queryKey: ['prudential_action_events', actionId],
    enabled: !!actionId,
    queryFn: async (): Promise<ActionEvent[]> => {
      const { data, error } = await sb
        .from('prudential_action_events')
        .select('*')
        .eq('action_id', actionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function unwrap(data: any, error: any) {
  if (error) throw new Error(error.message);
  const res = (data || {}) as Record<string, unknown>;
  if (res.error) {
    const err = new Error(String(res.error)) as Error & { code?: string };
    err.code = res.code as string | undefined;
    throw err;
  }
  return res;
}

function useLifecycleInvalidation() {
  const qc = useQueryClient();
  return (actionId?: string) => {
    qc.invalidateQueries({ queryKey: ['prudential_action_monitor'] });
    qc.invalidateQueries({ queryKey: ['prudential_actions'] });
    if (actionId) {
      qc.invalidateQueries({ queryKey: ['prudential_action_responses', actionId] });
      qc.invalidateQueries({ queryKey: ['prudential_action_events', actionId] });
    }
  };
}

/** Regulated entity submits its remediation response and evidence. */
export function useSubmitActionResponse() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({
    mutationFn: async (input: { action_id: string; narrative: string; document_ids?: string[] }) => {
      const { data, error } = await sb.rpc('submit_prudential_action_response', {
        _action_id: input.action_id,
        _narrative: input.narrative,
        _document_ids: input.document_ids ?? [],
      });
      return unwrap(data, error);
    },
    onSuccess: (_r, v) => {
      invalidate(v.action_id);
      toast.success('Response submitted for supervisory review');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit response'),
  });
}

/** Supervisor accepts or rejects the entity's response. */
export function useReviewActionResponse() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({
    mutationFn: async (input: { action_id: string; decision: 'accepted' | 'rejected'; notes: string }) => {
      const { data, error } = await sb.rpc('review_prudential_action_response', {
        _action_id: input.action_id,
        _decision: input.decision,
        _notes: input.notes,
      });
      return unwrap(data, error);
    },
    onSuccess: (_r, v) => {
      invalidate(v.action_id);
      toast.success(v.decision === 'accepted' ? 'Response accepted, action completed' : 'Response rejected, action reopened');
    },
    onError: (e: any) => toast.error(e.message || 'Review failed'),
  });
}

/** Closure gate: refuses completion while required evidence is unaccepted. */
export function useCloseActionGated() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({
    mutationFn: async (input: { action_id: string; kind: 'completed' | 'waived' | 'cancelled'; reason: string }) => {
      const { data, error } = await sb.rpc('close_prudential_action', {
        _action_id: input.action_id,
        _kind: input.kind,
        _reason: input.reason,
      });
      return unwrap(data, error);
    },
    onSuccess: (_r, v) => {
      invalidate(v.action_id);
      toast.success('Action closed');
    },
    onError: (e: any) => toast.error(e.message || 'Closure refused'),
  });
}

export function useSweepBreachedActions() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc('mark_prudential_actions_breached');
      if (error) throw new Error(error.message);
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(`${n} action(s) marked breached`);
    },
    onError: (e: any) => toast.error(e.message || 'Sweep failed'),
  });
}

/** My entity's supervisory actions (licensee-facing). */
export function useMySupervisoryActions() {
  return useQuery({
    queryKey: ['my_supervisory_actions'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('prudential_actions')
        .select('*, licensees(name)')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
