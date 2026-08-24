import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Send, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePreviewTemplate,
  useTestSendTemplate,
  useChannelHealth,
  CHANNEL_LABELS,
  type NotificationTemplateRow,
} from '@/hooks/useNotificationAdmin';
import { formatEmailBodyHtml } from '@/lib/emailBodyFormat';


interface Props {
  template: NotificationTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Preview + test-send dialog. Sample data is resolved server-side so the
 * rendered output is byte-identical to what the dispatcher would send, and
 * unresolved merge tokens are surfaced before anyone publishes.
 */
export function TemplatePreviewDialog({ template, open, onOpenChange }: Props) {
  const preview = usePreviewTemplate();
  const testSend = useTestSendTemplate();
  const health = useChannelHealth();
  const [rendered, setRendered] = useState<{ subject: string; body: string; unresolved: string[] } | null>(null);

  useEffect(() => {
    if (!open || !template) {
      setRendered(null);
      return;
    }
    preview
      .mutateAsync({ templateId: template.id })
      .then((res) =>
        setRendered({
          subject: res.subject || '',
          body: res.body || '',
          unresolved: res.unresolved_tokens || [],
        }),
      )
      .catch((e: any) => toast.error(e?.message || 'Preview failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  const channel = (template?.channel || 'in_app') as 'in_app' | 'email' | 'sms';
  const channelHealth = health[channel];

  const handleTestSend = async () => {
    if (!template) return;
    try {
      const res = await testSend.mutateAsync({ templateId: template.id });
      toast.success('Test notification sent to your own account only.');
      if (res.unresolved_tokens?.length) {
        toast.warning(`Unresolved tokens: ${res.unresolved_tokens.join(', ')}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Test send failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview — {template?.name}</DialogTitle>
          <DialogDescription>
            Rendered with sample data by the same engine used for live delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CHANNEL_LABELS[channel] || channel}</Badge>
          <Badge variant={channelHealth.available ? 'secondary' : 'destructive'}>
            {channelHealth.label}
          </Badge>
          {template?.status && <Badge variant="outline">{template.status}</Badge>}
          <Badge variant="outline">v{template?.version ?? 1}</Badge>
        </div>

        {rendered?.unresolved?.length ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Unresolved merge fields: {rendered.unresolved.join(', ')}. These will render empty.
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        {preview.isPending && !rendered ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Rendering preview…
          </div>
        ) : (
          <div className="space-y-3">
            {channel !== 'in_app' && rendered?.subject ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="text-sm font-medium">{rendered.subject}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Body</p>
              {channel === 'email' ? (
                <div
                  className="mt-1 max-h-72 overflow-auto rounded-md border bg-background p-4 text-sm text-muted-foreground"
                  // Content is escaped before formatting in formatEmailBodyHtml.
                  dangerouslySetInnerHTML={{ __html: formatEmailBodyHtml(rendered?.body || '—') }}
                />
              ) : (
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {rendered?.body || '—'}
                </pre>
              )}
            </div>

          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            data-rbac="notification_management.test_send"
            onClick={handleTestSend}
            disabled={testSend.isPending || !template}
          >
            {testSend.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send test to me
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
