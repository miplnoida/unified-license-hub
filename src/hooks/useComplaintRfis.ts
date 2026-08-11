/**
 * Complaint RFI (Request for Information) data access.
 *
 * All writes go through SECURITY DEFINER RPCs — the tables deliberately have
 * no INSERT/UPDATE policies, so the server owns the mandatory-question submit
 * gate, draft privacy and audit logging.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ComplaintRfiStatus = 'draft' | 'open' | 'submitted' | 'closed' | 'cancelled';
export type ComplaintRfiApprovalState = 'draft' | 'pending_approval' | 'rejected' | 'dispatched';
export type ComplaintRfiItemStatus = 'pending' | 'draft' | 'responded' | 'returned';
export type ComplaintRfiQuestionType = 'text' | 'document' | 'both';

export interface ComplaintRfiResponse {
  id: string;
  rfi_item_id: string;
  response_text: string | null;
  file_upload_ids: string[];
  is_draft: boolean;
  submitted_by: string | null;
  submitted_at: string;
}

export interface ComplaintRfiItem {
  id: string;
  rfi_id: string;
  ordinal: number;
  prompt: string;
  question_type: ComplaintRfiQuestionType;
  required: boolean;
  response_status: ComplaintRfiItemStatus;
  returned_reason: string | null;
  responses: ComplaintRfiResponse[];
}

export interface ComplaintRfi {
  id: string;
  complaint_id: string;
  licensee_id: string;
  raised_by: string | null;
  raised_at: string;
  due_at: string | null;
  summary: string | null;
  status: ComplaintRfiStatus;
  approval_state: ComplaintRfiApprovalState;
  approver_id: string | null;
  submitted_for_approval_at: string | null;
  submitted_for_approval_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  rejection_reason: string | null;
  dispatched_at: string | null;
  submitted_at: string | null;
  closure_notes: string | null;
  closed_at: string | null;
  items: ComplaintRfiItem[];
  /** Present on the entity workbench + approval queue listings only. */
  complaint_number?: string | null;
  complaint_subject?: string | null;
  licensee_name?: string | null;
}


export interface RfiFileMeta {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
}

async function hydrate(rfiRows: any[]): Promise<ComplaintRfi[]> {
  const ids = rfiRows.map((r) => r.id);
  let items: any[] = [];
  let responses: any[] = [];
  if (ids.length) {
    // Hydration failures must propagate: silently returning [] would show
    // "0 questions" / "no responses" as if that were the real state.
    const { data: it, error: itErr } = await supabase
      .from('complaint_rfi_items' as any)
      .select('*')
      .in('rfi_id', ids)
      .order('ordinal', { ascending: true });
    if (itErr) throw itErr;
    items = (it as any[]) || [];
    const itemIds = items.map((i) => i.id);
    if (itemIds.length) {
      const { data: rs, error: rsErr } = await supabase
        .from('complaint_rfi_responses' as any)
        .select('*')
        .in('rfi_item_id', itemIds)
        .order('submitted_at', { ascending: true });
      if (rsErr) throw rsErr;
      responses = (rs as any[]) || [];
    }
  }
  return rfiRows.map((r) => ({
    ...r,
    items: items
      .filter((i) => i.rfi_id === r.id)
      .map((i) => ({ ...i, responses: responses.filter((x) => x.rfi_item_id === i.id) })),
  })) as ComplaintRfi[];
}

/** Regulator-side: RFIs raised on one complaint. */
export function useComplaintRfis(complaintId: string | undefined) {
  return useQuery({
    queryKey: ['complaint-rfis', complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_rfis' as any)
        .select('*')
        .eq('complaint_id', complaintId)
        .order('raised_at', { ascending: false });
      if (error) throw error;
      return hydrate((data as any[]) || []);
    },
  });
}

/** Entity-side workbench: every RFI issued against the caller's entity. */
export function useMyComplaintRfis() {
  return useQuery({
    queryKey: ['my-complaint-rfis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_rfis' as any)
        .select('*, complaints(complaint_number, subject)')
        .order('raised_at', { ascending: false });
      if (error) throw error;
      const rows = ((data as any[]) || []).map((r) => ({
        ...r,
        complaint_number: r.complaints?.complaint_number ?? null,
        complaint_subject: r.complaints?.subject ?? null,
      }));
      return hydrate(rows);
    },
  });
}

export function useRfiFileMeta(fileIds: string[]) {
  const key = [...fileIds].sort().join(',');
  return useQuery({
    queryKey: ['complaint-rfi-files', key],
    enabled: fileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('file_uploads')
        .select('id, file_name, file_path, file_size')
        .in('id', fileIds);
      if (error) throw error;
      return (data || []) as RfiFileMeta[];
    },
  });
}

export interface RaiseRfiQuestion {
  prompt: string;
  question_type: ComplaintRfiQuestionType;
  required: boolean;
}

export function useRaiseComplaintRfi(complaintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      summary?: string;
      due_at?: string | null;
      items: RaiseRfiQuestion[];
      as_draft?: boolean;
      approver_id?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('complaint_rfi_raise' as any, {
        p_complaint_id: complaintId,
        p_summary: input.summary ?? null,
        p_due_at: input.due_at ?? null,
        p_items: input.items as any,
        p_as_draft: input.as_draft ?? null,
        p_approver_id: input.approver_id ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint-rfis', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint-rfi-queue'] });
    },

  });
}

export function useSaveComplaintRfiDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { item_id: string; response_text: string | null; file_upload_ids: string[] }) => {
      const { data, error } = await supabase.rpc('complaint_rfi_save_draft' as any, {
        p_item_id: input.item_id,
        p_response_text: input.response_text,
        p_file_upload_ids: input.file_upload_ids,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-complaint-rfis'] }),
  });
}

export function useSubmitComplaintRfi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rfiId: string) => {
      const { data, error } = await supabase.rpc('complaint_rfi_submit' as any, { p_rfi_id: rfiId });
      if (error) throw error;
      return data as { ok: boolean; missing?: string[]; answers?: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-complaint-rfis'] }),
  });
}

export function useReturnComplaintRfiItem(complaintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { item_id: string; reason: string }) => {
      const { error } = await supabase.rpc('complaint_rfi_return_item' as any, {
        p_item_id: input.item_id,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaint-rfis', complaintId] }),
  });
}

export function useCloseComplaintRfi(complaintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rfi_id: string; notes?: string; cancel?: boolean }) => {
      const { error } = await supabase.rpc(
        (input.cancel ? 'complaint_rfi_cancel' : 'complaint_rfi_close') as any,
        input.cancel
          ? { p_rfi_id: input.rfi_id, p_reason: input.notes ?? null }
          : { p_rfi_id: input.rfi_id, p_notes: input.notes ?? null },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaint-rfis', complaintId] }),
  });
}

/* ------------------------------------------------------------------ *
 * Approval & oversight (RFI Approval Queue)
 * ------------------------------------------------------------------ */

export interface ComplaintRfiSettings {
  approval_required: boolean;
}

export function useComplaintRfiSettings() {
  return useQuery({
    queryKey: ['complaint-rfi-settings'],
    queryFn: async (): Promise<ComplaintRfiSettings> => {
      const { data, error } = await supabase
        .from('complaint_rfi_settings' as any)
        .select('approval_required')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { approval_required: (data as any)?.approval_required ?? true };
    },
    staleTime: 60_000,
  });
}

export function useSetComplaintRfiApprovalRequired() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (required: boolean) => {
      const { error } = await supabase.rpc('complaint_rfi_set_approval_required' as any, {
        p_required: required,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaint-rfi-settings'] }),
  });
}

/** Every RFI the caller can see, hydrated with complaint + entity labels. */
export function useComplaintRfiQueue() {
  return useQuery({
    queryKey: ['complaint-rfi-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_rfis' as any)
        .select('*, complaints(complaint_number, subject), licensees(name)')
        .order('submitted_for_approval_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = ((data as any[]) || []).map((r) => ({
        ...r,
        complaint_number: r.complaints?.complaint_number ?? null,
        complaint_subject: r.complaints?.subject ?? null,
        licensee_name: r.licensees?.name ?? null,
      }));
      return hydrate(rows);
    },
  });
}

function invalidateRfiCaches(qc: ReturnType<typeof useQueryClient>, complaintId?: string) {
  qc.invalidateQueries({ queryKey: ['complaint-rfi-queue'] });
  qc.invalidateQueries({ queryKey: ['my-complaint-rfis'] });
  if (complaintId) qc.invalidateQueries({ queryKey: ['complaint-rfis', complaintId] });
  else qc.invalidateQueries({ queryKey: ['complaint-rfis'] });
}

export function useUpdateComplaintRfiDraft(complaintId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rfi_id: string;
      summary: string | null;
      due_at: string | null;
      items: RaiseRfiQuestion[];
    }) => {
      const { error } = await supabase.rpc('complaint_rfi_update_draft' as any, {
        p_rfi_id: input.rfi_id,
        p_summary: input.summary,
        p_due_at: input.due_at,
        p_items: input.items as any,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRfiCaches(qc, complaintId),
  });
}

export function useSubmitComplaintRfiForApproval(complaintId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rfi_id: string; approver_id?: string | null }) => {
      const { error } = await supabase.rpc('complaint_rfi_submit_for_approval' as any, {
        p_rfi_id: input.rfi_id,
        p_approver_id: input.approver_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRfiCaches(qc, complaintId),
  });
}

export function useApproveComplaintRfi(complaintId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rfi_id: string; notes?: string | null; due_at?: string | null }) => {
      const { data, error } = await supabase.rpc('complaint_rfi_approve' as any, {
        p_rfi_id: input.rfi_id,
        p_notes: input.notes ?? null,
        p_due_at: input.due_at ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; questions: number; licensee_id: string; complaint_id: string; due_at: string | null };
    },
    onSuccess: () => invalidateRfiCaches(qc, complaintId),
  });
}

export function useRejectComplaintRfi(complaintId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rfi_id: string; reason: string }) => {
      const { data, error } = await supabase.rpc('complaint_rfi_reject' as any, {
        p_rfi_id: input.rfi_id,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data as { ok: boolean; drafter_id: string | null; complaint_id: string };
    },
    onSuccess: () => invalidateRfiCaches(qc, complaintId),
  });
}
