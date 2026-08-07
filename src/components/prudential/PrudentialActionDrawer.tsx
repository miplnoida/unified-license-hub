/**
 * Supervisory action case view: source drill-through, entity response history,
 * supervisor review and the append-only lifecycle log.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import {
  useActionEvents,
  useActionResponses,
  useReviewActionResponse,
  useCloseActionGated,
  sourceLink,
  type MonitoredAction,
} from '@/hooks/usePrudentialActionLifecycle';

interface Props {
  action: MonitoredAction | null;
  onOpenChange: (open: boolean) => void;
}

export function PrudentialActionDrawer({ action, onOpenChange }: Props) {
  const { data: responses = [] } = useActionResponses(action?.id);
  const { data: events = [] } = useActionEvents(action?.id);
  const review = useReviewActionResponse();
  const close = useCloseActionGated();
  const [notes, setNotes] = useState('');
  const [closeKind, setCloseKind] = useState<'completed' | 'waived' | 'cancelled' | null>(null);
  const [closeReason, setCloseReason] = useState('');

  if (!action) return null;
  const link = sourceLink(action);
  const canReview = action.status === 'awaiting_review';

  return (
    <Sheet open={!!action} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{action.action_reference}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div>
            <div className="font-medium">{action.title}</div>
            <div className="text-muted-foreground">{action.entity_name ?? '—'}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Status</span><div><Badge variant="outline">{action.status}</Badge></div></div>
            <div><span className="text-muted-foreground">Review</span><div><Badge variant="outline">{action.review_status}</Badge></div></div>
            <div><span className="text-muted-foreground">Severity</span><div>{action.severity ?? '—'}</div></div>
            <div><span className="text-muted-foreground">Due</span><div>{action.due_date ?? '—'}</div></div>
            <div><span className="text-muted-foreground">Evidence required</span><div>{action.evidence_required ? 'Yes' : 'No'}</div></div>
            <div><span className="text-muted-foreground">Progress</span><div>{action.progress_percent}%</div></div>
          </div>

          <div>
            <span className="text-muted-foreground">Source</span>
            <div className="flex items-center gap-2">
              <span>{action.source_type ?? 'manual'}</span>
              {link && (
                <Button asChild size="sm" variant="outline">
                  <Link to={link}>Open source <ExternalLink className="h-3 w-3 ml-1" /></Link>
                </Button>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <div className="font-medium mb-2">Responses and reviews ({responses.length})</div>
            {responses.length === 0 && <div className="text-muted-foreground">No response submitted yet.</div>}
            <div className="space-y-2">
              {responses.map((r) => (
                <div key={r.id} className="rounded border p-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={r.kind === 'supervisor_review' ? 'default' : 'secondary'}>
                      {r.kind === 'supervisor_review' ? `Supervisor review — ${r.decision}` : 'Entity response'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{r.narrative}</div>
                  {r.evidence_document_ids?.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">{r.evidence_document_ids.length} evidence document(s)</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {canReview && (
            <div className="rounded border p-3 space-y-2">
              <Label>Review notes <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex gap-2">
                <Button
                  data-rbac="prudential_supervision.workflow_action"
                  size="sm"
                  disabled={notes.trim().length < 5 || review.isPending}
                  onClick={() => review.mutate({ action_id: action.id, decision: 'accepted', notes })}
                >
                  {review.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                  Accept
                </Button>
                <Button
                  data-rbac="prudential_supervision.workflow_action"
                  size="sm"
                  variant="outline"
                  disabled={notes.trim().length < 5 || review.isPending}
                  onClick={() => review.mutate({ action_id: action.id, decision: 'rejected', notes })}
                >
                  <XCircle className="h-4 w-4 mr-1" />Reject
                </Button>
              </div>
            </div>
          )}

          {!['completed', 'waived', 'cancelled'].includes(action.status) && (
            <div className="rounded border p-3 space-y-2">
              <div className="flex gap-2">
                {(['completed', 'waived', 'cancelled'] as const).map((k) => (
                  <Button key={k} size="sm" variant={closeKind === k ? 'default' : 'outline'} onClick={() => setCloseKind(k)}>
                    {k === 'completed' ? 'Complete' : k === 'waived' ? 'Waive' : 'Cancel'}
                  </Button>
                ))}
              </div>
              {closeKind && (
                <>
                  <Label>Reason <span className="text-destructive">*</span></Label>
                  <Textarea rows={3} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
                  <Button
                    data-rbac="prudential_supervision.edit"
                    size="sm"
                    disabled={closeReason.trim().length < 5 || close.isPending}
                    onClick={() =>
                      close.mutate(
                        { action_id: action.id, kind: closeKind, reason: closeReason },
                        { onSuccess: () => { setCloseKind(null); setCloseReason(''); } },
                      )
                    }
                  >
                    {close.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Confirm
                  </Button>
                </>
              )}
            </div>
          )}

          <Separator />

          <div>
            <div className="font-medium mb-2">Lifecycle log ({events.length})</div>
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="text-xs">
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>{' '}
                  <span className="font-medium">{e.event_type}</span>
                  {e.from_status || e.to_status ? ` (${e.from_status ?? '—'} → ${e.to_status ?? '—'})` : ''}
                  {e.reason ? ` — ${e.reason}` : ''}
                </div>
              ))}
              {events.length === 0 && <div className="text-muted-foreground text-xs">No events recorded.</div>}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
