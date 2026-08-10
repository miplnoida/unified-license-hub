import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: any | null;
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
  const [showJson, setShowJson] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const { data: internalUsers = [] } = useInternalUsers(undefined, {
    activeOnly: false,
    alwaysIncludeIds: row?.recipient_user_id ? [row.recipient_user_id] : [],
  });

  const recipientName = useMemo(() => {
    if (!row?.recipient_user_id) return null;
    const u = internalUsers.find((x) => x.id === row.recipient_user_id);
    return u?.full_name || null;
  }, [internalUsers, row?.recipient_user_id]);

  if (!row) return null;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const dt = (v?: string | null) => (v ? formatDateTime(v) : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0">
        <SheetHeader className="p-6 pb-3">
          <SheetTitle className="text-base">Notification detail</SheetTitle>
          <SheetDescription className="font-mono text-xs">{row.event_key}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-90px)] px-6 pb-10">
          <div className="space-y-5">
            <Section title="Summary">
              <Field label="Event" value={<span className="font-mono text-xs">{row.event_key}</span>} />
              <Field label="Module" value={row.module} />
              <Field label="Channel" value={<Badge variant="secondary" className="text-xs">{row.channel}</Badge>} />
              <Field label="Status" value={<Badge variant={row.status === 'failed' ? 'destructive' : row.status === 'sent' ? 'default' : 'secondary'}>{row.status}</Badge>} />
              <Field label="Delivery state" value={row.communication_state} />
              <Field label="Provider" value={row.provider} />
              <Field label="Template version" value={row.template_version} />
              <Field label="Fallback template" value={row.used_fallback_template ? 'Yes' : null} />
              <Field label="Template tracing" value={row.template_traceability_status} />
            </Section>

            <Separator />

            <Section title="Recipient">
              <Field label="Name" value={recipientName} />
              <Field label="Email" value={row.recipient_email} />
              <Field label="Phone" value={row.recipient_phone} />
              <Field label="Related record" value={row.entity_type} />
              <Field label="Reminder window" value={row.reminder_window} />
            </Section>

            <Separator />

            <Section title="Timeline">
              <Field label="Requested" value={dt(row.requested_at)} />
              <Field label="Queued" value={dt(row.queued_at)} />
              <Field label="Created" value={dt(row.created_at)} />
              <Field label="Sent to provider" value={dt(row.sent_to_provider_at)} />
              <Field label="Sent" value={dt(row.sent_at)} />
              <Field label="Delivered" value={dt(row.delivered_at)} />
              <Field label="Failed" value={dt(row.failed_at)} />
              <Field label="Last attempt" value={dt(row.last_attempt_at)} />
              <Field label="Next attempt" value={dt(row.next_attempt_at)} />
              <Field label="Acknowledged" value={dt(row.acknowledged_at)} />
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

            <Section title="Delivery diagnostics">
              <Field label="Attempts" value={row.attempts ?? row.retry_count} />
              <Field label="Retries" value={row.retry_count} />
              <Field label="Failure category" value={row.failure_category} />
              <Field label="Poisoned" value={row.poisoned ? 'Yes' : null} />
              <Field label="Error" value={row.error ? <span className="text-destructive">{row.error}</span> : null} />
              {row.error_details && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(row.error_details, null, 2)}
                </pre>
              )}
              <Field label="Correlation" value={row.correlation_id ? <span className="font-mono text-xs">{row.correlation_id}</span> : null} />
              <Field label="Dedupe key" value={row.dedupe_key ? <span className="font-mono text-xs">{row.dedupe_key}</span> : null} />
            </Section>

            {row.payload && (
              <>
                <Separator />
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
              </>
            )}

            <Separator />
            <div>
              <Button variant="ghost" size="sm" className="px-0" onClick={() => setShowTech((v) => !v)}>
                {showTech ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                Technical references
              </Button>
              {showTech && (
                <div className="font-mono text-xs text-muted-foreground space-y-1">
                  <div>dispatch: {row.id}</div>
                  {row.notification_id && <div>notification: {row.notification_id}</div>}
                  {row.template_id && <div>template: {row.template_id}</div>}
                  {row.entity_id && <div>record: {row.entity_id}</div>}
                  {row.provider_message_id && <div>provider msg: {row.provider_message_id}</div>}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
