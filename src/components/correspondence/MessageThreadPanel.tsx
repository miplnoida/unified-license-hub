import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Paperclip, Send } from 'lucide-react';
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

  const send = async () => {
    if (!body.trim()) { toast.error('Please write a message first.'); return; }
    setBusy(true);
    try {
      const messageId = await post.mutateAsync({
        thread_id: threadId,
        body: body.trim(),
        is_internal_note: internal,
        channel: 'portal',
      });
      for (const f of files) await uploadCorrespondenceFile(threadId, f, messageId);
      toast.success(internal ? 'Internal note added' : 'Message posted to the thread');
      onSent?.(body.trim());
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
          const outbound = m.direction === 'outbound';
          return (
            <div key={m.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-lg border p-3 text-sm',
                  m.is_internal_note
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : outbound
                      ? 'bg-primary/10 border-primary/20'
                      : 'bg-muted border-border',
                )}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{m.author_name ?? 'Unknown'}</span>
                  <Badge variant="outline" className="text-[10px]">{m.author_role ?? (outbound ? 'Regulator' : 'Sender')}</Badge>
                  {m.is_internal_note && (
                    <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal note</Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">{format(new Date(m.sent_at), 'PPp')}</span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>

      {canReply && (
        <div className="space-y-2 border-t pt-3">
          <Label className="text-xs">{replyLabel}</Label>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
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
            <Button size="sm" className="ml-auto" onClick={send} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
