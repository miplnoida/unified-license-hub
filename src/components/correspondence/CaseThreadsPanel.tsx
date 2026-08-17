import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock, ExternalLink, Lock, MessageSquare } from 'lucide-react';
import { IntakeForm } from './IntakeForm';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { ThreadDetail } from './ThreadDetail';
import { useIsInternal } from '@/hooks/useUserPermissions';
import {
  THREAD_STATE_LABELS, THREAD_TYPE_LABELS, useThreadFeed, type FeedThread,
} from '@/hooks/useCorrespondence';

interface Props {
  /** Case type as recorded on the thread, e.g. application | complaint | return. */
  sourceType: string;
  sourceId: string;
  sourceReference?: string | null;
  licenseeId?: string | null;
  title?: string;
}

function Row({ t, onOpen }: { t: FeedThread; onOpen: () => void }) {
  const unread = (t.unread_count ?? 0) > 0;
  return (
    <button onClick={onOpen} className="w-full text-left rounded-md border p-3 space-y-1.5 hover:bg-muted/60 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className={unread ? 'text-sm font-semibold' : 'text-sm font-medium'}>{t.subject}</span>
        {unread && (
          <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {t.unread_count}
          </span>
        )}
      </div>
      {t.last_message_preview && <p className="text-xs text-muted-foreground line-clamp-2">{t.last_message_preview}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">{THREAD_TYPE_LABELS[t.thread_type] ?? t.thread_type}</Badge>
        <Badge variant="secondary" className="text-[10px]">{THREAD_STATE_LABELS[t.thread_state] ?? t.thread_state}</Badge>
        {!t.is_entity_facing
          ? <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal</Badge>
          : t.effective_direction === 'inbound'
            ? <Badge variant="outline" className="text-[10px] gap-1"><ArrowDownLeft className="h-2.5 w-2.5" />Inbound</Badge>
            : <Badge variant="outline" className="text-[10px] gap-1"><ArrowUpRight className="h-2.5 w-2.5" />Outbound</Badge>}
        {t.sla_breached_at && (
          <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />SLA breached</Badge>
        )}
        {!t.sla_breached_at && t.thread_state === 'pending_response' && (
          <Badge variant="outline" className="text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Awaiting response</Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(t.last_message_at ?? t.received_at), { addSuffix: true })}
        </span>
      </div>
    </button>
  );
}

/**
 * Case-screen embed of the Communication Thread Manager. Shows only the threads
 * linked to this case that the signed-in user is authorised to see.
 */
export function CaseThreadsPanel({ sourceType, sourceId, sourceReference, licenseeId, title }: Props) {
  const isInternal = useIsInternal();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useThreadFeed(
    { source_type: sourceType, source_id: sourceId },
    0,
    25,
  );
  const threads = data?.rows ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base inline-flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />{title ?? 'Communications'}
          {threads.length > 0 && <Badge variant="outline">{threads.length}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="text-xs">
            <Link to="/correspondence">Open manager<ExternalLink className="h-3 w-3 ml-1" /></Link>
          </Button>
          {isInternal && (
            <IntakeForm
              caseContext={{ sourceType, sourceId, sourceReference, licenseeId }}
              triggerLabel="New thread"
              triggerVariant="outline"
              onCreated={(id) => { setOpenId(id); refetch(); }}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isError && (
          <QueryErrorState
            title="We couldn’t load communications"
            message="Communication threads could not be loaded. Please try again."
            onRetry={() => refetch()}
            compact
          />
        )}
        {!isError && isLoading && <><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></>}
        {!isError && !isLoading && threads.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No communication threads on this case yet.
          </p>
        )}
        {!openId && threads.map((t) => <Row key={t.id} t={t} onOpen={() => setOpenId(t.id)} />)}

        {openId && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b p-2">
              <span className="text-xs text-muted-foreground">Viewing thread</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpenId(null)}>
                Back to list
              </Button>
            </div>
            <ThreadDetail threadId={openId} embedded />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
