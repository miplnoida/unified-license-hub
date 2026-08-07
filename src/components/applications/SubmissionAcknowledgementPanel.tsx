/**
 * Submission acknowledgement panel (FRD 6.1).
 *
 * Shows the acknowledgement issued for the CURRENT submission: reference,
 * timestamp, applicant/entity, declaration text, delivery state and a download
 * of the stored PDF. Delivery state is reported exactly as the notification
 * engine recorded it — "sent to provider" is never shown as "delivered".
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileCheck2, Download, RefreshCw, AlertTriangle, MailCheck, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSubmissionAcknowledgement,
  useEnsureAcknowledgement,
  useDownloadAcknowledgement,
  type AcknowledgementStatus,
} from '@/hooks/useSubmissionAcknowledgement';

interface Props {
  applicationId: string;
  /** Hide entirely while the application has never been submitted. */
  submitted: boolean;
}

const STATUS_META: Record<AcknowledgementStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; hint: string }> = {
  GENERATED: {
    label: 'Acknowledgement issued',
    variant: 'secondary',
    hint: 'Receipt recorded. Email delivery has not been attempted yet.',
  },
  DELIVERY_PENDING: {
    label: 'Delivery in progress',
    variant: 'outline',
    hint: 'The acknowledgement email has been queued or accepted by the mail provider. Confirmed delivery is shown once the provider reports it.',
  },
  DELIVERED: {
    label: 'Delivered',
    variant: 'default',
    hint: 'The mail provider confirmed delivery of the acknowledgement email.',
  },
  DELIVERY_FAILED: {
    label: 'Delivery failed',
    variant: 'destructive',
    hint: 'The acknowledgement email could not be delivered. The receipt below remains valid and downloadable.',
  },
  PROVIDER_NOT_CONFIGURED: {
    label: 'Email not configured',
    variant: 'destructive',
    hint: 'No outgoing mail provider is configured, so no email was sent. The receipt below remains valid and downloadable.',
  },
};

export function SubmissionAcknowledgementPanel({ applicationId, submitted }: Props) {
  const { data: ack, isLoading, refetch, isFetching } = useSubmissionAcknowledgement(applicationId, submitted);
  const ensure = useEnsureAcknowledgement(applicationId);
  const download = useDownloadAcknowledgement(applicationId);

  if (!submitted) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading submission acknowledgement…
        </CardContent>
      </Card>
    );
  }

  if (!ack) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck2 className="h-4 w-4" /> Submission acknowledgement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No acknowledgement has been generated for this submission yet.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={ensure.isPending}
            onClick={() =>
              ensure.mutate(undefined, {
                onSuccess: () => toast.success('Acknowledgement generated'),
                onError: (e: unknown) => toast.error((e as Error).message),
              })
            }
          >
            {ensure.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck2 className="h-4 w-4 mr-2" />}
            Generate acknowledgement
          </Button>
        </CardContent>
      </Card>
    );
  }

  const meta = STATUS_META[ack.status] ?? STATUS_META.GENERATED;
  const failed = ack.status === 'DELIVERY_FAILED' || ack.status === 'PROVIDER_NOT_CONFIGURED';

  const field = (label: string, value: React.ReactNode) => (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm font-medium mt-0.5 break-words">{value ?? '—'}</div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck2 className="h-4 w-4" /> Submission acknowledgement
          {ack.is_resubmission && <Badge variant="outline">Resubmission</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={meta.variant} className="whitespace-nowrap">
            {failed ? <MailWarning className="h-3 w-3 mr-1" /> : <MailCheck className="h-3 w-3 mr-1" />}
            {meta.label}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} title="Refresh delivery state">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('Reference', <span className="font-mono">{ack.reference}</span>)}
          {field('Submission version', `v${ack.submission_version}`)}
          {field('Submitted at', new Date(ack.submitted_at).toLocaleString())}
          {field('Applicant / entity', ack.entity_name || ack.applicant_name)}
          {field('Notified address', ack.applicant_email)}
          {field('Licence / service', ack.license_type)}
        </div>

        {ack.ack_text && (
          <div className="rounded-md border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Applicant declaration</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{ack.ack_text}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground flex items-start gap-2">
          {failed && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />}
          <span>
            {meta.hint}
            {ack.failure_reason && <> Reason: <span className="font-mono">{ack.failure_reason}</span>.</>}
            {ack.delivered_at && <> Confirmed {new Date(ack.delivered_at).toLocaleString()}.</>}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={download.isPending || !ack.document_path}
            onClick={() => download.mutate(undefined, { onError: (e: unknown) => toast.error((e as Error).message) })}
          >
            {download.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download acknowledgement (PDF)
          </Button>
          {!ack.document_path && (
            <Button
              size="sm"
              variant="ghost"
              disabled={ensure.isPending}
              onClick={() =>
                ensure.mutate(undefined, {
                  onSuccess: () => toast.success('Acknowledgement document generated'),
                  onError: (e: unknown) => toast.error((e as Error).message),
                })
              }
            >
              {ensure.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Regenerate document
            </Button>
          )}
          {ack.document_checksum && (
            <span className="text-[10px] text-muted-foreground font-mono">
              SHA-256 {ack.document_checksum.slice(0, 16)}…
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
