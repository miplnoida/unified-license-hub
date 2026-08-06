/**
 * Complaint RFI (Request for Information) data access.
 *
 * All writes go through SECURITY DEFINER RPCs — the tables deliberately have
 * no INSERT/UPDATE policies, so the server owns the mandatory-question submit
 * gate, draft privacy and audit logging.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ComplaintRfiStatus = 'open' | 'submitted' | 'closed' | 'cancelled';
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
  submitted_at: string | null;
  closure_notes: string | null;
  closed_at: string | null;
  items: ComplaintRfiItem[];
  /** Present on the entity workbench listing only. */
  complaint_number?: string | null;
  complaint_subject?: string | null;
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
    const { data: it } = await supabase
      .from('complaint_rfi_items' as any)
      .select('*')
      .in('rfi_id', ids)
      .order('ordinal', { ascending: true });
    items = (it as any[]) || [];
    const itemIds = items.map((i) => i.id);
    if (itemIds.length) {
      const { data: rs } = await supabase
        .from('complaint_rfi_responses' as any)
        .select('*')
        .in('rfi_item_id', itemIds)
        .order('submitted_at', { ascending: true });
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
    mutationFn: async (input: { summary?: string; due_at?: string | null; items: RaiseRfiQuestion[] }) => {
      const { data, error } = await supabase.rpc('complaint_rfi_raise' as any, {
        p_complaint_id: complaintId,
        p_summary: input.summary ?? null,
        p_due_at: input.due_at ?? null,
        p_items: input.items as any,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaint-rfis', complaintId] }),
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
