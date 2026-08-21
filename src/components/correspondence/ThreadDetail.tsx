import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, CheckCircle2, Clock, Download, ExternalLink, Lock, RotateCcw, UserPlus, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { MessageThreadPanel } from './MessageThreadPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { AuditTrailPanel } from './AuditTrailPanel';
import { ClassificationPanel } from './ClassificationPanel';
import { AssignmentPanel } from './AssignmentPanel';
import { useIsInternal } from '@/hooks/useUserPermissions';
import {
  CORRESPONDENCE_MODULE_LABELS,
  THREAD_STATE_LABELS,
  THREAD_TYPE_LABELS,
  useAddThreadParticipant,
  useCorrespondenceThread,
  useInternalOfficers,
  useMarkPendingResponse,
  useReopenThread,
  useSetThreadState,
} from '@/hooks/useCorrespondence';
import { exportThreadToPdf } from '@/lib/correspondence/exportThread';

export function ThreadDetail({ threadId, embedded }: { threadId?: string; embedded?: boolean }) {
  const { data, isLoading, error } = useCorrespondenceThread(threadId);
  const setState = useSetThreadState(threadId);
  const markPending = useMarkPendingResponse(threadId);
  const reopenThread = useReopenThread(threadId);
  const addParticipant = useAddThreadParticipant(threadId);
  const { data: officers = [] } = useInternalOfficers();
  const isInternalUser = useIsInternal();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [justification, setJustification] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [newParticipant, setNewParticipant] = useState('');
  const [exporting, setExporting] = useState(false);

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
  const sourceLink = t.source_id
    ? t.source_type === 'application' ? `/applications/${t.source_id}`
    : t.source_type === 'complaint' ? `/complaints/${t.source_id}`
    : t.source_type === 'return' ? `/returns/${t.source_id}`
    : t.source_type === 'licensee' ? `/entities/${t.source_id}`
    : null
    : null;
  const closed = t.thread_state === 'closed';

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
      await reopenThread.mutateAsync({ thread_id: t.id, reason: reopenReason.trim() });
      toast.success('Thread reopened');
      setReopenOpen(false); setReopenReason('');
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('not_authorized')) toast.error('You do not have permission to reopen closed threads.');
      else if (msg.includes('reopen_reason_required')) toast.error('Please record a reason of at least 10 characters.');
      else toast.error(msg || 'Could not reopen thread');
    }
  };

  const setPending = async () => {
    try {
      await markPending.mutateAsync({ thread_id: t.id });
      toast.success('Thread marked as awaiting response — response clock started');
    } catch (e: any) {
      toast.error(String(e?.message ?? '').includes('not_authorized')
        ? 'You do not have permission to change this thread.'
        : e?.message ?? 'Could not update thread');
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportThreadToPdf(t.id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not export thread');
    } finally { setExporting(false); }
  };

  const addColleague = async () => {
    if (!newParticipant) return;
    try {
      await addParticipant.mutateAsync({ thread_id: t.id, user_id: newParticipant });
      toast.success('Colleague added and notified');
      setAddOpen(false); setNewParticipant('');
    } catch (e: any) { toast.error(e?.message ?? 'Could not add colleague'); }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{t.subject}</h2>
            <p className="text-xs text-muted-foreground font-mono">{t.reference}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={doExport} disabled={exporting}>
              <Download className="h-4 w-4 mr-1" />{exporting ? 'Preparing…' : 'Export PDF'}
            </Button>
            {isInternalUser && !closed && t.thread_state !== 'pending_response' && (
              <Button size="sm" variant="outline" onClick={setPending} disabled={markPending.isPending}>
                <Clock className="h-4 w-4 mr-1" />Await response
              </Button>
            )}
            {closed ? (
              isInternalUser && (
                <Button size="sm" variant="outline" onClick={() => setReopenOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-1" />Reopen
                </Button>
              )
            ) : (
              isInternalUser && (
                <Button size="sm" onClick={() => setCloseOpen(true)}><CheckCircle2 className="h-4 w-4 mr-1" />Close thread</Button>
              )
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CORRESPONDENCE_MODULE_LABELS[t.module ?? 'general'] ?? t.module}</Badge>
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
          {t.sla_breached_at && (
            <span className="text-xs text-destructive inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />Response deadline breached
            </span>
          )}
          {!t.sla_breached_at && t.thread_state === 'pending_response' && t.response_due_at && (
            <span className="text-xs text-amber-700 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />Response due {format(new Date(t.response_due_at), 'PPp')}
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
              {p.is_internal && <Lock className="h-2.5 w-2.5" />}
              {p.last_read_at
                ? <span className="text-[10px] text-emerald-700">read {formatDistanceToNow(new Date(p.last_read_at), { addSuffix: true })}</span>
                : <span className="text-[10px]">unread</span>}
            </span>
          ))}
          {isInternalUser && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-3 w-3 mr-1" />Add colleague
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <MessageThreadPanel
          threadId={t.id}
          messages={messages}
          allowInternalNotes={isInternalUser}
          canReply={!closed}
          forceInternal={!t.is_entity_facing}
          sourceType={t.source_type}
          sourceId={t.source_id}
          replyLabel={t.is_entity_facing ? 'Post a message or internal note' : 'Post an internal note'}
        />

        {isInternalUser && !embedded && (
          <Tabs defaultValue="classify">
            <TabsList>
              <TabsTrigger value="classify">Classify</TabsTrigger>
              <TabsTrigger value="assign">Assign</TabsTrigger>
              <TabsTrigger value="files">Attachments</TabsTrigger>
              <TabsTrigger value="audit">Audit trail</TabsTrigger>
            </TabsList>
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
        )}

        {(!isInternalUser || embedded) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Attachments</CardTitle></CardHeader>
            <CardContent><AttachmentsPanel threadId={t.id} attachments={attachments} /></CardContent>
          </Card>
        )}
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

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reopen this thread</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Reopening restores the conversation for further messages. Record the reason (minimum 10 characters) — it is written to the immutable audit trail.
          </p>
          <Textarea rows={4} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Reason for reopening" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button onClick={reopen} disabled={reopenThread.isPending || reopenReason.trim().length < 10}>Reopen thread</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add an internal colleague</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            The colleague is added as an internal participant and notified. Internal participants never appear to external users.
          </p>
          <Select value={newParticipant} onValueChange={setNewParticipant}>
            <SelectTrigger><SelectValue placeholder="Select a colleague" /></SelectTrigger>
            <SelectContent>
              {officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addColleague} disabled={!newParticipant || addParticipant.isPending}>Add colleague</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
