import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Check, CheckCheck, Eye, Loader2, Lock, Paperclip, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  usePostCorrespondenceMessage,
  uploadCorrespondenceFile,
  type CorrespondenceMessage,
} from '@/hooks/useCorrespondence';

interface Props {
  threadId: string;
  messages: CorrespondenceMessage[];
  canReply?: boolean;
  allowInternalNotes?: boolean;
  replyLabel?: string;
  onSent?: (body: string) => void;
}

const MAX_CHARS = 5000;

function kindStyles(m: CorrespondenceMessage) {
  const kind = m.message_kind ?? (m.is_internal_note ? 'internal' : m.direction === 'outbound' ? 'external_outbound' : 'external_inbound');
  switch (kind) {
    case 'system':
      return { wrap: 'bg-muted/60 border-border text-muted-foreground', align: 'justify-center', label: 'System' };
    case 'internal':
      return { wrap: 'bg-purple-50 border-purple-200 text-purple-950 relative overflow-hidden', align: 'justify-end', label: 'Internal' };
    case 'external_outbound':
      return { wrap: 'bg-blue-50 border-blue-200 text-blue-950', align: 'justify-end', label: 'Sent' };
    default:
      return { wrap: 'bg-emerald-50 border-emerald-200 text-emerald-950', align: 'justify-start', label: 'Received' };
  }
}

function DeliveryChip({ m }: { m: CorrespondenceMessage }) {
  if (m.message_kind !== 'external_outbound') return null;
  const s = m.delivery_status;
  if (s === 'bounced') {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1" title={m.bounce_reason ?? undefined}>
        <AlertTriangle className="h-2.5 w-2.5" />Bounced
      </Badge>
    );
  }
  const icon = s === 'opened' ? <Eye className="h-2.5 w-2.5" /> : s === 'delivered' ? <CheckCheck className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />;
  return <Badge variant="outline" className="text-[10px] gap-1">{icon}{s}</Badge>;
}

export function MessageThreadPanel({
  threadId,
  messages,
  canReply = true,
  allowInternalNotes = false,
  replyLabel = 'Reply',
  onSent,
}: Props) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const post = usePostCorrespondenceMessage(threadId);

  const submit = async (isDraft: boolean) => {
    if (!body.trim()) { toast.error('Please write a message first.'); return; }
    setBusy(true);
    try {
      const messageId = await post.mutateAsync({
        thread_id: threadId,
        body: body.trim(),
        is_internal_note: internal,
        channel: 'portal',
        is_draft: isDraft,
      });
      for (const f of files) await uploadCorrespondenceFile(threadId, f, messageId);
      toast.success(isDraft ? 'Draft saved' : internal ? 'Internal note added' : 'Message posted to the thread');
      if (!isDraft) onSent?.(body.trim());
      setBody(''); setFiles([]); setInternal(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not post message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No messages on this thread yet.</p>
        )}
        {messages.map((m) => {
          const s = kindStyles(m);
          return (
            <div key={m.id} className={cn('flex', s.align)}>
              <div className={cn('max-w-[85%] rounded-lg border p-3 text-sm', s.wrap)}>
                {(m.message_kind === 'internal' || m.is_internal_note) && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-purple-300/40 text-2xl font-bold rotate-[-18deg] select-none">
                    INTERNAL
                  </span>
                )}
                <div className="relative flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{m.author_name ?? 'Unknown'}</span>
                  <Badge variant="outline" className="text-[10px]">{m.author_role ?? s.label}</Badge>
                  {(m.message_kind === 'internal' || m.is_internal_note) && (
                    <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal note</Badge>
                  )}
                  {m.is_draft && <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                  <DeliveryChip m={m} />
                  <span className="text-[11px] opacity-70">{format(new Date(m.sent_at), 'PPp')}</span>
                </div>
                <div className="relative whitespace-pre-wrap leading-relaxed">{m.body}</div>
                {m.delivery_status === 'bounced' && m.bounce_reason && (
                  <div className="relative mt-1 text-[11px] text-destructive">Delivery failed: {m.bounce_reason}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canReply && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{replyLabel}</Label>
            <span className={cn('text-[11px]', body.length > MAX_CHARS ? 'text-destructive' : 'text-muted-foreground')}>
              {body.length} / {MAX_CHARS}
            </span>
          </div>
          <Textarea
            rows={4}
            maxLength={MAX_CHARS}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Input type="file" multiple className="max-w-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />{files.length} file(s)
              </span>
            )}
            {allowInternalNotes && (
              <label className="text-xs inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note (not visible to the licensee)
              </label>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => submit(true)} disabled={busy}>Save draft</Button>
              <Button size="sm" onClick={() => submit(false)} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
