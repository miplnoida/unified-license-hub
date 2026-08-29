/**
 * F7-B — canonical returns governance actions.
 *
 * Every write goes through a guarded SECURITY DEFINER RPC; the browser holds no
 * write privilege on any returns table. Maker-checker (requester ≠ decider),
 * reason minimums, deadline recomputation and audit are all enforced server-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface ReturnFilingExtension {
  id: string;
  entity_id: string;
  reporting_period_id: string;
  return_filing_id: string | null;
  original_due_date: string;
  requested_due_date: string;
  granted_due_date: string | null;
  reason: string;
  status: 'REQUESTED' | 'GRANTED' | 'REFUSED' | 'WITHDRAWN';
  decision_reason: string | null;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export interface ReturnFilingEvidence {
  id: string;
  return_filing_id: string;
  return_filing_version_id: string;
  document_name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
}

const EXT_KEY = ['returns', 'extensions'];
const EVI_KEY = ['returns', 'evidence'];

export function useFilingExtensions(filingId?: string | null, periodId?: string | null) {
  return useQuery({
    queryKey: [...EXT_KEY, filingId ?? null, periodId ?? null],
    enabled: !!(filingId || periodId),
    queryFn: async (): Promise<ReturnFilingExtension[]> => {
      let q = db().from('return_filing_extensions').select('*').order('requested_at', { ascending: false });
      q = filingId ? q.eq('return_filing_id', filingId) : q.eq('reporting_period_id', periodId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ReturnFilingExtension[];
    },
  });
}

export function useFilingEvidence(filingId?: string | null) {
  return useQuery({
    queryKey: [...EVI_KEY, filingId ?? null],
    enabled: !!filingId,
    queryFn: async (): Promise<ReturnFilingEvidence[]> => {
      const { data, error } = await db()
        .from('return_filing_evidence')
        .select('*')
        .eq('return_filing_id', filingId)
        .order('uploaded_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ReturnFilingEvidence[];
    },
  });
}

export function useReturnsGovernanceMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: EXT_KEY });
    qc.invalidateQueries({ queryKey: EVI_KEY });
    qc.invalidateQueries({ queryKey: ['wave-c'] });
    qc.invalidateQueries({ queryKey: ['entity-returns'] });
  };

  return {
    raiseRfi: useMutation({
      mutationFn: (v: { versionId: string; message: string; formTemplateId?: string | null }) =>
        rpc<string>('returns_raise_rfi', {
          _version_id: v.versionId, _message: v.message, _form_template_id: v.formTemplateId ?? null,
        }),
      onSuccess: invalidate,
    }),
    requestAmendment: useMutation({
      mutationFn: (v: { filingId: string; reason: string }) =>
        rpc<string>('returns_request_amendment', { _filing_id: v.filingId, _reason: v.reason }),
      onSuccess: invalidate,
    }),
    decideAmendment: useMutation({
      mutationFn: (v: { requestId: string; decision: 'APPROVE' | 'REFUSE'; reason: string }) =>
        rpc<{ decision: string; new_version_id: string | null }>('returns_decide_amendment', {
          _request_id: v.requestId, _decision: v.decision, _reason: v.reason,
        }),
      onSuccess: invalidate,
    }),
    requestExtension: useMutation({
      mutationFn: (v: { periodId: string; requestedDueDate: string; reason: string }) =>
        rpc<string>('returns_request_extension', {
          _period_id: v.periodId, _requested_due_date: v.requestedDueDate, _reason: v.reason,
        }),
      onSuccess: invalidate,
    }),
    decideExtension: useMutation({
      mutationFn: (v: { extensionId: string; decision: 'GRANT' | 'REFUSE'; reason: string; grantedDueDate?: string | null }) =>
        rpc<{ decision: string; granted_due_date?: string }>('returns_decide_extension', {
          _extension_id: v.extensionId, _decision: v.decision, _reason: v.reason,
          _granted_due_date: v.grantedDueDate ?? null,
        }),
      onSuccess: invalidate,
    }),
    attachEvidence: useMutation({
      mutationFn: (v: {
        versionId: string; documentName: string; storagePath: string;
        fileType?: string | null; fileSize?: number | null; description?: string | null;
      }) =>
        rpc<string>('returns_attach_evidence', {
          _version_id: v.versionId, _document_name: v.documentName, _storage_path: v.storagePath,
          _file_type: v.fileType ?? null, _file_size: v.fileSize ?? null, _description: v.description ?? null,
        }),
      onSuccess: invalidate,
    }),
    withdrawEvidence: useMutation({
      mutationFn: (v: { evidenceId: string; reason: string }) =>
        rpc('returns_withdraw_evidence', { _evidence_id: v.evidenceId, _reason: v.reason }),
      onSuccess: invalidate,
    }),
    runOverdueSweep: useMutation({
      mutationFn: (asOf?: string) =>
        rpc<{ as_of: string; recorded: number }>('returns_overdue_sweep', { _as_of: asOf ?? null }),
      onSuccess: invalidate,
    }),
  };
}
