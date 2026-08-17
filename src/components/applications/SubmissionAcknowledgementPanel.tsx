/**
 * Submission acknowledgement panel (FRD 6.1).
 *
 * One immutable artifact, three presentations:
 *  - `applicant` : primary applicant/licensee surface — reference, submitted
 *                  date + time, submission status and a single view/download
 *                  action. No internal delivery-engine metadata.
 *  - `internal`  : secondary read-only support view for authorised internal
 *                  users — keeps delivery state, failure reason, checksum and
 *                  the regenerate affordance.
 *  - `artifact`  : compact read-only row for document/artifact history.
 *
 * All variants read the same acknowledgement record through the same hook and
 * download the same stored PDF version. Delivery state is reported exactly as
 * the notification engine recorded it — "sent to provider" is never shown as
 * "delivered".
 */
import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileCheck2, Download, RefreshCw, AlertTriangle, MailCheck, MailWarning, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
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
  /** Presentation. Defaults to the internal support view. */
  variant?: 'applicant' | 'internal' | 'artifact';
  /** Applicant reference shown instead of any internal identifier. */
  applicationNumber?: string | null;
  /** Emphasise the card right after a successful submission. */
  highlight?: boolean;
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

export function SubmissionAcknowledgementPanel({
  applicationId,
  submitted,
  variant = 'internal',
  applicationNumber,
  highlight = false,
}: Props) {
  const { data: ack, isLoading, refetch, isFetching } = useSubmissionAcknowledgement(applicationId, submitted);
  const ensure = useEnsureAcknowledgement(applicationId);
  const download = useDownloadAcknowledgement(applicationId);
  const isApplicant = variant === 'applicant';
  const isArtifact = variant === 'artifact';
  const autoEnsured = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Applicant surfaces trigger the existing idempotent `ensure` once when no
  // document exists yet. Repeat views never create another artifact.
  useEffect(() => {
    if (!submitted || isLoading || autoEnsured.current) return;
    if (!isApplicant && !isArtifact) return;
    if (ack?.document_path) return;
    autoEnsured.current = true;
    ensure.mutate(undefined, { onError: () => { /* non-blocking */ } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, isLoading, ack?.document_path, isApplicant, isArtifact]);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlight]);

  if (!submitted) return null;

  const handleDownload = () =>
    download.mutate(undefined, { onError: (e: unknown) => toast.error((e as Error).message) });

  // ---------------------------------------------------------------- artifact
  if (isArtifact) {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading submission acknowledgement…
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <FileCheck2 className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Submission Acknowledgement
            <Badge variant="outline" className="ml-2 align-middle text-[10px]">System generated</Badge>
            <Badge variant="outline" className="ml-1 align-middle text-[10px]">Read-only</Badge>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{applicationNumber || ack?.reference || '—'}</span>
            {ack && (
              <>
                <span>·</span>
                <span>v{ack.submission_version}</span>
                <span>·</span>
                <span>{formatDateTime(ack.created_at || ack.submitted_at)}</span>
              </>
            )}
          </div>
        </div>
        {ack?.document_path ? (
          <Button size="sm" variant="outline" disabled={download.isPending} onClick={handleDownload}>
            {download.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            View / Download
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Acknowledgement being generated
          </span>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading submission acknowledgement…
        </CardContent>
      </Card>
    );
  }

  // --------------------------------------------------------------- applicant
  if (isApplicant) {
    return (
      <Card ref={cardRef} className={highlight ? 'border-primary shadow-md' : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck2 className="h-4 w-4" /> Submission Acknowledgement
            {ack?.is_resubmission && <Badge variant="outline">Resubmission</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Application Reference</p>
              <p className="text-sm font-medium font-mono mt-0.5 break-all">
                {applicationNumber || ack?.reference || '—'}
              </p>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted Date &amp; Time</p>
              <p className="text-sm font-medium mt-0.5">{formatDateTime(ack?.submitted_at)}</p>
            </div>
          </div>


          <div className="flex flex-wrap items-center gap-2">
            {ack?.document_path ? (
              <Button size="sm" disabled={download.isPending} onClick={handleDownload}>
                {download.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                View / Download Submission Acknowledgement
              </Button>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" /> Acknowledgement being generated — it will appear here shortly.
                </span>
                <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching || ensure.isPending}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Check again
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This acknowledgement confirms receipt of your submission only. It is not a decision, approval or licence.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------- internal
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
          <Badge variant="outline">Read-only</Badge>
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
          {field('Submitted at', formatDateTime(ack.submitted_at))}
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
            {ack.delivered_at && <> Confirmed {formatDateTime(ack.delivered_at)}.</>}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={download.isPending || !ack.document_path}
            onClick={handleDownload}
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
