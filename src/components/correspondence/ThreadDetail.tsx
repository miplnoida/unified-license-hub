import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Clock, Download, ExternalLink, Lock, RotateCcw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { MessageThreadPanel } from './MessageThreadPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { AuditTrailPanel } from './AuditTrailPanel';
import { ResponseComposer } from './ResponseComposer';
import { ClassificationPanel } from './ClassificationPanel';
import { AssignmentPanel } from './AssignmentPanel';
import {
  THREAD_STATE_LABELS, THREAD_TYPE_LABELS, useCorrespondenceThread, useSetThreadState,
} from '@/hooks/useCorrespondence';
import { exportThreadToPdf } from '@/lib/correspondence/exportThread';

export function ThreadDetail({ threadId }: { threadId?: string }) {
  const { data, isLoading, error } = useCorrespondenceThread(threadId);
  const setState = useSetThreadState(threadId);
  const [closeOpen, setCloseOpen] = useState(false);
  const [justification, setJustification] = useState('');

  if (!threadId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-10 text-center">
        Select a thread from the list to view the conversation.
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-4 space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (error || !data) {
    return <div className="p-10 text-center text-sm text-muted-foreground">{(error as any)?.message ?? 'Thread not available.'}</div>;
  }

  const { thread: t, messages, attachments, events, participants } = data;
  const sourceLink = t.source_type === 'application' && t.source_id ? `/applications/${t.source_id}`
    : t.source_type === 'complaint' && t.source_id ? `/complaints/${t.source_id}`
    : t.source_type === 'return' && t.source_id ? `/returns/${t.source_id}`
    : null;

  const close = async () => {
    try {
      await setState.mutateAsync({ thread_id: t.id, state: 'closed', justification: justification.trim() || undefined });
      toast.success('Thread closed');
      setCloseOpen(false); setJustification('');
    } catch (e: any) {
      if (e?.message?.includes('closure_justification_required')) {
        toast.error('A response is still due — please record a justification of at least 10 characters.');
      } else toast.error(e?.message ?? 'Could not close thread');
    }
  };

  const reopen = async () => {
    try {
      await setState.mutateAsync({ thread_id: t.id, state: 'open' });
      toast.success('Thread reopened');
    } catch (e: any) { toast.error(e?.message ?? 'Could not reopen thread'); }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{t.subject}</h2>
            <p className="text-xs text-muted-foreground font-mono">{t.reference}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => exportThreadToPdf(t, messages)}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            {t.thread_state === 'closed' ? (
              <Button size="sm" variant="outline" onClick={reopen}><RotateCcw className="h-4 w-4 mr-1" />Reopen</Button>
            ) : (
              <Button size="sm" onClick={() => setCloseOpen(true)}><CheckCircle2 className="h-4 w-4 mr-1" />Close thread</Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{THREAD_TYPE_LABELS[t.thread_type] ?? t.thread_type}</Badge>
          <Badge variant="secondary">{THREAD_STATE_LABELS[t.thread_state] ?? t.thread_state}</Badge>
          <Badge variant="outline">{t.channel}</Badge>
          <Badge variant="outline">{t.priority}</Badge>
          {!t.is_entity_facing && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />Internal only</Badge>}
          {t.source_reference && (
            sourceLink ? (
              <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
                <Link to={sourceLink}>{t.source_reference}<ExternalLink className="h-3 w-3 ml-1" /></Link>
              </Button>
            ) : <Badge variant="outline" className="font-mono text-[10px]">{t.source_reference}</Badge>
          )}
          {t.thread_state === 'pending_response' && t.response_due_at && (
            <span className="text-xs text-amber-700 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />Response due {format(new Date(t.response_due_at), 'PP')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {participants.length === 0 && <span>No participants recorded</span>}
          {participants.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
              {p.display_name}
              <span className="opacity-70">({p.party_role ?? p.party_type})</span>
              {p.last_read_at
                ? <span className="text-[10px] text-emerald-700">read {formatDistanceToNow(new Date(p.last_read_at), { addSuffix: true })}</span>
                : <span className="text-[10px]">unread</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <MessageThreadPanel
          threadId={t.id}
          messages={messages}
          allowInternalNotes
          canReply={t.thread_state !== 'closed'}
          replyLabel="Post a message or internal note"
        />

        <Tabs defaultValue="respond">
          <TabsList>
            <TabsTrigger value="respond">Compose response</TabsTrigger>
            <TabsTrigger value="classify">Classify</TabsTrigger>
            <TabsTrigger value="assign">Assign</TabsTrigger>
            <TabsTrigger value="files">Attachments</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>
          <TabsContent value="respond"><Card><CardContent className="pt-4"><ResponseComposer thread={t} /></CardContent></Card></TabsContent>
          <TabsContent value="classify"><Card><CardContent className="pt-4"><ClassificationPanel threadId={t.id} category={t.category} priority={t.priority} tags={t.tags} /></CardContent></Card></TabsContent>
          <TabsContent value="assign"><Card><CardContent className="pt-4"><AssignmentPanel threadId={t.id} unit={t.assigned_unit} officer={t.assigned_officer} /></CardContent></Card></TabsContent>
          <TabsContent value="files">
            <Card>
              <CardHeader><CardTitle className="text-base">Attachments &amp; versions</CardTitle></CardHeader>
              <CardContent><AttachmentsPanel threadId={t.id} attachments={attachments} /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="audit"><Card><CardContent className="pt-4"><AuditTrailPanel entries={events} /></CardContent></Card></TabsContent>
        </Tabs>
      </div>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close this thread</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.thread_state === 'pending_response'
              ? 'A response is still outstanding. Record why the thread is being closed early (minimum 10 characters).'
              : 'Optionally record a closing note for the audit trail.'}
          </p>
          <Textarea rows={4} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Justification / closing note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button onClick={close} disabled={setState.isPending}>Close thread</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
