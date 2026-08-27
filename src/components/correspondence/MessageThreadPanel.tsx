import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle, Check, CheckCheck, Cog, Eye, FileText, Loader2, Lock, Paperclip, Pencil, Send, Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RichTextComposer, htmlToPlainText } from './RichTextComposer';
import {
  useCaseDocuments,
  useDiscardDraft,
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
  /** Case the thread is linked to — enables linking authorised case documents. */
  sourceType?: string | null;
  sourceId?: string | null;
  /** Fixed visibility: internal-only threads cannot send external messages. */
  forceInternal?: boolean;
  templates?: Array<{ id: string; name: string; body: string }>;
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
        <AlertTriangle className="h-2.5 w-2.5" />Delivery failed
      </Badge>
    );
  }
  const icon = s === 'opened' ? <Eye className="h-2.5 w-2.5" /> : s === 'delivered' ? <CheckCheck className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />;
  return <Badge variant="outline" className="text-[10px] gap-1">{icon}{s}</Badge>;
}

/** Renders composer output, allowing only the formatting the composer produces. */
function MessageBody({ m }: { m: CorrespondenceMessage }) {
  if (m.body_format === 'text' || !/<[a-z]/i.test(m.body)) {
    return <div className="relative whitespace-pre-wrap leading-relaxed">{m.body}</div>;
  }
  const safe = m.body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
  return (
    <div
      className="relative leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export function MessageThreadPanel({
  threadId,
  messages,
  canReply = true,
  allowInternalNotes = false,
  replyLabel = 'Reply',
  onSent,
  sourceType,
  sourceId,
  forceInternal = false,
  templates = [],
}: Props) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(forceInternal);
  const [files, setFiles] = useState<File[]>([]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const post = usePostCorrespondenceMessage(threadId);
  const discard = useDiscardDraft(threadId);
  const { data: caseDocs = [] } = useCaseDocuments(sourceType, sourceId);

  const plain = useMemo(() => htmlToPlainText(body), [body]);
  const visible = messages.filter((m) => !m.is_draft);
  const drafts = messages.filter((m) => m.is_draft);

  const resetComposer = () => {
    setBody(''); setFiles([]); setDocIds([]); setDraftId(null);
    setInternal(forceInternal); setPreview(false);
  };

  const submit = async (isDraft: boolean) => {
    if (!plain) { toast.error('Please write a message first.'); return; }
    if (plain.length > MAX_CHARS) { toast.error(`Messages are limited to ${MAX_CHARS} characters.`); return; }
    setBusy(true);
    try {
      const messageId = await post.mutateAsync({
        thread_id: threadId,
        body,
        body_format: 'html',
        is_internal_note: forceInternal || internal,
        channel: 'portal',
        is_draft: isDraft,
        document_ids: docIds.length ? docIds : undefined,
        draft_message_id: draftId,
      });
      for (const f of files) await uploadCorrespondenceFile(threadId, f, messageId);
      toast.success(isDraft ? 'Draft saved' : (forceInternal || internal) ? 'Internal note added' : 'Message sent');
      if (!isDraft) onSent?.(plain);
      resetComposer();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('thread_closed')) toast.error('This thread is closed. Reopen it before adding messages.');
      else if (msg.includes('not_authorized')) toast.error('You are not authorised to post on this thread.');
      else toast.error(msg || 'Could not post message');
    } finally {
      setBusy(false);
    }
  };

  const editDraft = (m: CorrespondenceMessage) => {
    setDraftId(m.id);
    setBody(m.body);
    setInternal(forceInternal || m.is_internal_note);
    setDocIds(m.linked_document_ids ?? []);
    setPreview(false);
  };

  const removeDraft = async (id: string) => {
    try {
      await discard.mutateAsync(id);
      if (draftId === id) resetComposer();
      toast.success('Draft discarded');
    } catch (e: any) { toast.error(e?.message ?? 'Could not discard draft'); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No messages on this thread yet.</p>
        )}
        {visible.map((m) => {
          const s = kindStyles(m);
          const isInternalMsg = m.message_kind === 'internal' || m.is_internal_note;
          return (
            <div key={m.id} className={cn('flex', s.align)}>
              <div className={cn('max-w-[85%] rounded-lg border p-3 text-sm', s.wrap)}>
                {isInternalMsg && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-purple-300/40 text-2xl font-bold rotate-[-18deg] select-none">
                    INTERNAL
                  </span>
                )}
                <div className="relative flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{m.author_name ?? 'Unknown'}</span>
                  <Badge variant="outline" className="text-[10px]">{m.author_role ?? s.label}</Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {m.direction === 'inbound' ? 'Inbound' : m.direction === 'outbound' ? 'Outbound' : 'Internal'}
                  </Badge>
                  {isInternalMsg ? (
                    <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal — staff only</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Visible to entity</Badge>
                  )}
                  {m.sent_by_system && (
                    <Badge variant="outline" className="text-[10px] gap-1"><Cog className="h-2.5 w-2.5" />System generated</Badge>
                  )}
                  <DeliveryChip m={m} />
                  <span className="text-[11px] opacity-70">{format(new Date(m.sent_at), 'PPp')}</span>
                </div>
                <MessageBody m={m} />
                {(m.linked_document_ids?.length ?? 0) > 0 && (
                  <div className="relative mt-2 text-[11px] inline-flex items-center gap-1 opacity-80">
                    <FileText className="h-3 w-3" />{m.linked_document_ids!.length} linked case document(s)
                  </div>
                )}
                {m.delivery_status === 'bounced' && m.bounce_reason && (
                  <div className="relative mt-1 text-[11px] text-destructive">Delivery failed: {m.bounce_reason}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {drafts.length > 0 && (
        <div className="rounded-md border border-dashed p-2 space-y-1">
          <p className="text-xs font-medium">Your drafts</p>
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <span className="line-clamp-1 flex-1 text-muted-foreground">{htmlToPlainText(d.body) || 'Empty draft'}</span>
              <Button data-rbac="notification_management.dispatch" size="sm" variant="ghost" className="h-6 px-2" onClick={() => editDraft(d)}>
                <Pencil className="h-3 w-3 mr-1" />Edit
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => removeDraft(d.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {canReply && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{draftId ? 'Editing saved draft' : replyLabel}</Label>
            <span className={cn('text-[11px]', plain.length > MAX_CHARS ? 'text-destructive' : 'text-muted-foreground')}>
              {plain.length} / {MAX_CHARS}
            </span>
          </div>

          {templates.length > 0 && (
            <Select onValueChange={(id) => {
              const tpl = templates.find((t) => t.id === id);
              if (tpl) setBody(tpl.body);
            }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Insert a template…" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {preview ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <MessageBody m={{ body, body_format: 'html' } as CorrespondenceMessage} />
            </div>
          ) : (
            <RichTextComposer value={body} onChange={setBody} placeholder="Write your message…" disabled={busy} />
          )}

          {caseDocs.length > 0 && (
            <details className="rounded-md border p-2">
              <summary className="text-xs cursor-pointer">
                Link case documents{docIds.length > 0 ? ` (${docIds.length} selected)` : ''}
              </summary>
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                {caseDocs.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={docIds.includes(d.id)}
                      onChange={(e) => setDocIds((prev) => e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id))}
                    />
                    <FileText className="h-3 w-3" />{d.file_name}
                  </label>
                ))}
              </div>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Input type="file" multiple className="max-w-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />{files.length} file(s)
              </span>
            )}
            {allowInternalNotes && !forceInternal && (
              <label className="text-xs inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note (never visible to the entity)
              </label>
            )}
            {forceInternal && (
              <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal thread</Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)} disabled={busy || !plain}>
                {preview ? 'Edit' : 'Preview'}
              </Button>
              <Button data-rbac="notification_management.dispatch" size="sm" variant="outline" onClick={() => submit(true)} disabled={busy}>Save draft</Button>
              <Button data-rbac="notification_management.view" size="sm" onClick={() => submit(false)} disabled={busy}>
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
