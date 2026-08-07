/**
 * Submission acknowledgement (FRD 6.1) client access.
 *
 * The record, its PDF and its delivery state are all owned by the
 * `application-acknowledgement` edge function. The client never writes them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AcknowledgementStatus =
  | 'GENERATED'
  | 'DELIVERY_PENDING'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'PROVIDER_NOT_CONFIGURED';

export interface SubmissionAcknowledgementRecord {
  id: string;
  application_id: string;
  submission_version: number;
  reference: string;
  applicant_name: string | null;
  applicant_email: string | null;
  entity_name: string | null;
  license_type: string | null;
  submitted_at: string;
  is_resubmission: boolean;
  ack_text: string | null;
  document_bucket: string | null;
  document_path: string | null;
  document_checksum: string | null;
  status: AcknowledgementStatus;
  provider: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  retry_count: number;
  delivered_at: string | null;
  delivery_history: Array<Record<string, unknown>>;
  created_at: string;
}

async function callAck(action: 'ensure' | 'reconcile' | 'download_url', applicationId: string) {
  const { data, error } = await supabase.functions.invoke('application-acknowledgement', {
    body: { action, application_id: applicationId },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

/** Reads the acknowledgement for the current submission and refreshes delivery state. */
export function useSubmissionAcknowledgement(applicationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['application_acknowledgement', applicationId],
    enabled: !!applicationId && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<SubmissionAcknowledgementRecord | null> => {
      const res = await callAck('reconcile', applicationId!);
      return (res?.acknowledgement ?? null) as SubmissionAcknowledgementRecord | null;
    },
  });
}

/**
 * Idempotent generation. Safe to call repeatedly: the server keys the record to
 * (application, submitted_at), so retries return the existing acknowledgement.
 */
export function useEnsureAcknowledgement(applicationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => callAck('ensure', applicationId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application_acknowledgement', applicationId] });
    },
  });
}

/** Opens a short-lived signed URL for the stored acknowledgement PDF. */
export function useDownloadAcknowledgement(applicationId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      const res = await callAck('download_url', applicationId!);
      if (!res?.url) throw new Error('No acknowledgement document available yet');
      window.open(res.url as string, '_blank', 'noopener,noreferrer');
      return res;
    },
  });
}
