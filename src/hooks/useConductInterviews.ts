// ============================================================
// Formal Investigation — Interview Record (Market Conduct)
// Additive hook. Access is enforced by RLS on conduct_interviews*
// (mirrors the parent investigation's permissions).
// ============================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logComplianceAudit } from '@/lib/complianceAudit';
import { conductEvidenceUpload } from '@/lib/conductGovernedOps';

import { dispatchNotificationEvent } from '@/lib/notificationEvents';

const sb = supabase as any;

async function audit(
  action_type: Parameters<typeof logComplianceAudit>[0]['action_type'],
  object_id: string | null | undefined,
  before: any = null,
  after: any = null,
  justification?: string | null,
) {
  try {
    await logComplianceAudit({
      action_type,
      object_type: 'conduct_interview',
      object_id: object_id ?? null,
      before_value: before,
      after_value: after,
      justification: justification ?? null,
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[conduct interview audit] failed', e);
  }
}

export type InterviewStatus = 'scheduled' | 'conducted' | 'recorded' | 'cancelled';
export type AttestationOutcome = 'pending' | 'signed' | 'refused' | 'not_required';

export interface ConductInterview {
  id: string;
  investigation_id: string;
  reference_code: string | null;
  interviewee_name: string;
  interviewee_role: string | null;
  interviewee_organisation: string | null;
  licensee_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  interview_type: 'in_person' | 'virtual' | 'telephone' | 'written';
  location: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  purpose: string | null;
  key_information: string | null;
  topics_covered: string | null;
  admissions: string | null;
  follow_up_actions: string | null;
  status: InterviewStatus;
  cancellation_reason: string | null;
  attestation_outcome: AttestationOutcome;
  attestation_name: string | null;
  attestation_at: string | null;
  attestation_captured_by: string | null;
  signed_document_url: string | null;
  refusal_reason: string | null;
  refusal_witnessed_by: string | null;
  finalised_by: string | null;
  finalised_at: string | null;
  amendments: Array<{ amended_at: string; amended_by: string | null; justification: string; patch: any }>;
  metadata: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewParticipant {
  id: string;
  interview_id: string;
  participant_type: 'interviewer' | 'observer' | 'legal_representative' | 'interpreter' | 'other';
  name: string;
  role: string | null;
  organisation: string | null;
  user_id: string | null;
  created_at: string;
}

export interface InterviewAttachment {
  id: string;
  interview_id: string;
  title: string;
  file_url: string | null;
  storage_bucket: string | null;
  file_name: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  produced_by_interviewee: boolean;
  exhibit_reference: string | null;
  evidence_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ---------- Queries ----------
export function useInterviews(investigationId: string | undefined) {
  return useQuery({
    enabled: !!investigationId,
    queryKey: ['conduct-interviews', investigationId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('conduct_interviews')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ConductInterview[];
    },
  });
}

export function useInterviewParticipants(interviewId: string | undefined) {
  return useQuery({
    enabled: !!interviewId,
    queryKey: ['conduct-interview-participants', interviewId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('conduct_interview_participants')
        .select('*')
        .eq('interview_id', interviewId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as InterviewParticipant[];
    },
  });
}

export function useInterviewAttachments(interviewId: string | undefined) {
  return useQuery({
    enabled: !!interviewId,
    queryKey: ['conduct-interview-attachments', interviewId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('conduct_interview_attachments')
        .select('*')
        .eq('interview_id', interviewId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as InterviewAttachment[];
    },
  });
}

// ---------- Mutations ----------
export function useCreateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ConductInterview> & { investigation_id: string; interviewee_name: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await sb
        .from('conduct_interviews')
        .insert({ ...payload, created_by: user.user?.id ?? null })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      await audit('CREATE', data.id, null, data);
      await dispatchNotificationEvent({
        event_key: 'conduct.interview_scheduled',
        entity_type: 'conduct_interview',
        entity_id: data.id,
        payload: {
          interviewee_name: data.interviewee_name,
          investigation_code: data.investigation_id,
        },
      });
      return data as ConductInterview;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['conduct-interviews', d.investigation_id] });
      toast.success('Interview record created');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, justification }: { id: string; patch: Partial<ConductInterview>; justification?: string }) => {
      const { data: before } = await sb.from('conduct_interviews').select('*').eq('id', id).maybeSingle();
      const { data, error } = await sb.from('conduct_interviews').update(patch).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);
      await audit('UPDATE', id, before, data, justification);
      return data as ConductInterview;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['conduct-interviews', d.investigation_id] });
      toast.success('Interview record updated');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useFinaliseInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      attestation_outcome: 'signed' | 'refused' | 'not_required';
      attestation_name?: string | null;
      signed_document_url?: string | null;
      refusal_reason?: string | null;
      refusal_witnessed_by?: string | null;
    }) => {
      const { data, error } = await sb.rpc('conduct_finalise_interview', {
        _interview_id: args.id,
        _attestation_outcome: args.attestation_outcome,
        _attestation_name: args.attestation_name ?? null,
        _signed_document_url: args.signed_document_url ?? null,
        _refusal_reason: args.refusal_reason ?? null,
        _refusal_witnessed_by: args.refusal_witnessed_by ?? null,
      });
      if (error) throw new Error(error.message);
      const rec = data as ConductInterview;
      await audit('APPROVE', rec.id, null, rec, args.refusal_reason ?? null);
      await dispatchNotificationEvent({
        event_key: args.attestation_outcome === 'refused'
          ? 'conduct.interview_signature_refused'
          : 'conduct.interview_record_finalised',
        entity_type: 'conduct_interview',
        entity_id: rec.id,
        payload: {
          interviewee_name: rec.interviewee_name,
          investigation_code: rec.investigation_id,
          refusal_reason: rec.refusal_reason ?? '',
        },
      });
      return rec;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['conduct-interviews', d.investigation_id] });
      toast.success('Interview record finalised');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAmendInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, justification }: { id: string; patch: Record<string, string>; justification: string }) => {
      const { data, error } = await sb.rpc('conduct_amend_interview', {
        _interview_id: id,
        _patch: patch,
        _justification: justification,
      });
      if (error) throw new Error(error.message);
      const rec = data as ConductInterview;
      await audit('OVERRIDE', rec.id, null, rec, justification);
      return rec;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['conduct-interviews', d.investigation_id] });
      toast.success('Amendment recorded');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<InterviewParticipant> & { interview_id: string; name: string }) => {
      const { data, error } = await sb.from('conduct_interview_participants').insert(payload).select('*').single();
      if (error) throw new Error(error.message);
      await audit('CREATE', payload.interview_id, null, data);
      return data as InterviewParticipant;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['conduct-interview-participants', d.interview_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, interview_id }: { id: string; interview_id: string }) => {
      const { error } = await sb.from('conduct_interview_participants').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await audit('DELETE', interview_id, { participant_id: id }, null);
      return { interview_id };
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['conduct-interview-participants', d.interview_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddInterviewAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<InterviewAttachment> & { interview_id: string; title: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await sb
        .from('conduct_interview_attachments')
        .insert({ ...payload, uploaded_by: user.user?.id ?? null })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      await audit('CREATE', payload.interview_id, null, data);
      return data as InterviewAttachment;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['conduct-interview-attachments', d.interview_id] });
      toast.success('Document recorded');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/**
 * Promote an interview document into the investigation's evidence repository so
 * the material also appears in the canonical evidence trail.
 */
export function usePromoteAttachmentToEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attachment, investigationId, entityId }: {
      attachment: InterviewAttachment; investigationId: string; entityId?: string | null;
    }) => {
      // Governed: uploader attribution and audit are derived server-side.
      const ev: any = await conductEvidenceUpload({
        title: attachment.title,
        evidence_type: 'document',
        file_url: attachment.file_url,
        description: `Produced during interview record ${attachment.interview_id}`,
        source: 'investigation_interview',
        confidentiality_level: 'internal',
        investigation_id: investigationId,
        entity_id: entityId ?? null,
        metadata: {
          storage_bucket: attachment.storage_bucket,
          storage_path: attachment.file_url,
          interview_attachment_id: attachment.id,
        },
      });

      const { error: linkErr } = await sb
        .from('conduct_interview_attachments')
        .update({ evidence_id: ev.id })
        .eq('id', attachment.id);
      if (linkErr) throw new Error(linkErr.message);
      await audit('UPDATE', attachment.interview_id, null, { evidence_id: ev.id }, 'Promoted interview document to evidence');
      return ev;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['conduct-interview-attachments', v.attachment.interview_id] });
      qc.invalidateQueries({ queryKey: ['conduct-evidence'] });
      toast.success('Added to evidence repository');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export async function signedInterviewFileUrl(bucket: string | null, path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await (supabase as any).storage
    .from(bucket || 'fp-evidence')
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl as string;
}
