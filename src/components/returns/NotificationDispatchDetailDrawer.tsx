import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Copy, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import {
  humanizeEventKey,
  humanizeStatus,
  humanizeChannel,
  describeStatus,
  humanizeFailureReason,
} from '@/lib/notificationLabels';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: any | null;
}

const RECORD_LABELS: Record<string, string> = {
  return_submission: 'Return submission',
  return_submissions: 'Return submission',
  returns: 'Return',
  application: 'Application',
  applications: 'Application',
  complaint: 'Complaint',
  complaints: 'Complaint',
  license: 'Licence',
  licenses: 'Licence',
  prudential_action: 'Supervisory action',
  prudential_actions: 'Supervisory action',
  escalation: 'Escalation',
  escalations: 'Escalation',
};

function recordLabel(entityType?: string | null) {
  if (!entityType) return null;
  return RECORD_LABELS[entityType] ?? humanizeEventKey(entityType);
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div>{children}</div>
    </div>
  );
}

export function NotificationDispatchDetailDrawer({ open, onOpenChange, row }: Props) {
  const [showTech, setShowTech] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const { data: internalUsers = [] } = useInternalUsers(undefined, {
    activeOnly: false,
    alwaysIncludeIds: row?.recipient_user_id ? [row.recipient_user_id] : [],
  });

  const recipientName = useMemo(() => {
    if (!row?.recipient_user_id) return null;
    const u = internalUsers.find((x) => x.id === row.recipient_user_id);
    return u?.full_name || null;
  }, [internalUsers, row?.recipient_user_id]);

  const timeline = useMemo(() => {
    if (!row) return [] as { label: string; at: string; tone: 'ok' | 'bad' | 'wait' }[];
    const steps: { label: string; at?: string | null; tone: 'ok' | 'bad' | 'wait' }[] = [
      { label: 'Requested', at: row.requested_at || row.created_at, tone: 'wait' },
      { label: 'Queued', at: row.queued_at, tone: 'wait' },
      { label: 'Handed to provider', at: row.sent_to_provider_at, tone: 'ok' },
      { label: 'Sent', at: row.sent_at, tone: 'ok' },
      { label: 'Delivered', at: row.delivered_at, tone: 'ok' },
      { label: 'Failed', at: row.failed_at, tone: 'bad' },
      { label: 'Read / acknowledged', at: row.acknowledged_at, tone: 'ok' },
    ];
    return steps.filter((s) => !!s.at) as { label: string; at: string; tone: 'ok' | 'bad' | 'wait' }[];
  }, [row]);

  if (!row) return null;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const statusText = humanizeStatus(row.status);
  const statusHelp = describeStatus(row.status);
  const failureReason = row.status === 'failed' ? humanizeFailureReason(row) : null;
  const nextAttempt = row.next_attempt_at ? formatDateTime(row.next_attempt_at) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0">
        <SheetHeader className="p-6 pb-3">
          <SheetTitle className="text-base">{humanizeEventKey(row.event_key)}</SheetTitle>
          <SheetDescription>
            {humanizeChannel(row.channel)} notification
            {row.sent_at || row.created_at ? ` · ${formatDateTime(row.sent_at || row.created_at)}` : ''}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-90px)] px-6 pb-10">
          <div className="space-y-5">
            <Section title="What happened">
              <div className="flex items-center gap-2 pt-1">
                <Badge
                  variant={row.status === 'failed' ? 'destructive' : row.status === 'sent' || row.status === 'delivered' ? 'default' : 'secondary'}
                >
                  {statusText}
                </Badge>
                <Badge variant="secondary" className="text-xs">{humanizeChannel(row.channel)}</Badge>
              </div>
              {statusHelp && <p className="pt-2 text-sm text-muted-foreground">{statusHelp}</p>}
              {failureReason && (
                <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {failureReason}
                </p>
              )}
              {row.status !== 'delivered' && nextAttempt && (
                <p className="pt-2 text-sm text-muted-foreground">Next retry: {nextAttempt}</p>
              )}
            </Section>

            <Separator />

            <Section title="Who it went to">
              <Field label="Name" value={recipientName} />
              <Field label="Email" value={row.recipient_email} />
              <Field label="Phone" value={row.recipient_phone} />
              <Field label="About" value={recordLabel(row.entity_type)} />
              <Field label="Reminder window" value={row.reminder_window} />
              {!recipientName && !row.recipient_email && !row.recipient_phone && (
                <p className="py-1 text-sm text-muted-foreground">No recipient contact details recorded.</p>
              )}
            </Section>

            {(row.subject || row.rendered_content) && (
              <>
                <Separator />
                <Section title="Message">
                  <Field label="Subject" value={row.subject} />
                  {row.rendered_content && (
                    <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                      {row.rendered_content}
                    </div>
                  )}
                </Section>
              </>
            )}

            <Separator />

            <Section title="Delivery timeline">
              {timeline.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">No delivery events recorded yet.</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {timeline.map((s, i) => (
                    <li key={`${s.label}-${i}`} className="flex items-start gap-3">
                      {s.tone === 'bad' ? (
                        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                      ) : s.tone === 'ok' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                      ) : (
                        <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="text-sm">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(s.at)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {(row.attempts || row.retry_count) && (
                <p className="pt-3 text-sm text-muted-foreground">
                  Delivery attempts: {row.attempts ?? row.retry_count}
                </p>
              )}
            </Section>

            <Separator />

            <div>
              <Button variant="ghost" size="sm" className="px-0" onClick={() => setShowTech((v) => !v)}>
                {showTech ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                Technical details
              </Button>
              {showTech && (
                <div className="mt-2 space-y-3">
                  <Field label="Event key" value={<span className="font-mono text-xs">{row.event_key}</span>} />
                  <Field label="Module" value={row.module} />
                  <Field label="Delivery state" value={row.communication_state} />
                  <Field label="Provider" value={row.provider} />
                  <Field label="Template version" value={row.template_version} />
                  <Field label="Fallback template" value={row.used_fallback_template ? 'Yes' : null} />
                  <Field label="Template tracing" value={row.template_traceability_status} />
                  <Field label="Failure category" value={row.failure_category} />
                  <Field label="Poisoned" value={row.poisoned ? 'Yes' : null} />
                  <Field
                    label="Raw error"
                    value={row.error ? <span className="text-destructive">{row.error}</span> : null}
                  />
                  {row.error_details && (
                    <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                      {JSON.stringify(row.error_details, null, 2)}
                    </pre>
                  )}
                  <div className="font-mono text-xs text-muted-foreground space-y-1">
                    <div>dispatch: {row.id}</div>
                    {row.notification_id && <div>notification: {row.notification_id}</div>}
                    {row.template_id && <div>template: {row.template_id}</div>}
                    {row.entity_id && <div>record: {row.entity_id}</div>}
                    {row.provider_message_id && <div>provider msg: {row.provider_message_id}</div>}
                    {row.correlation_id && <div>correlation: {row.correlation_id}</div>}
                    {row.dedupe_key && <div>dedupe: {row.dedupe_key}</div>}
                  </div>
                  {row.payload && (
                    <div>
                      <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" className="px-0" onClick={() => setShowJson((v) => !v)}>
                          {showJson ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                          Payload
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => copy(JSON.stringify(row.payload, null, 2))}>
                          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                        </Button>
                      </div>
                      {showJson && (
                        <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                          {JSON.stringify(row.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
