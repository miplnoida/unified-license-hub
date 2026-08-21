/**
 * P12 — canonical correspondence thread workspace (`/correspondence/:threadId`).
 *
 * The header, communication state, service level, waiting-on and next action come
 * from `correspondence_thread_case`. Messages, attachments, participants, internal
 * notes and history are rendered by the existing `ThreadDetail` composition — this
 * page adds no second lifecycle: the parent business case stays in its own module.
 */
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { ThreadDetail } from '@/components/correspondence/ThreadDetail';
import { formatDateTime } from '@/lib/datetime';
import {
  caseHeaderSlaState, useCorrespondenceThreadCase,
  DELIVERY_EVIDENCE_LABELS, DELIVERY_FAILED_STATES, type DeliveryEvidenceState,
} from '@/hooks/useCorrespondenceQueue';
import { CORRESPONDENCE_MODULE_LABELS } from '@/hooks/useCorrespondence';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export default function ThreadWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { data: model, isLoading, error } = useCorrespondenceThreadCase(id);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>
      </DashboardLayout>
    );
  }

  if (error || !model) {
    return (
      <DashboardLayout>
        <Card><CardContent className="space-y-3 py-10 text-center">
          <p className="text-muted-foreground">
            {String((error as Error)?.message ?? '').includes('forbidden')
              ? 'You do not have access to this correspondence thread.'
              : 'Correspondence thread not found.'}
          </p>
          <Button asChild variant="outline"><Link to="/correspondence/inbox">Back to work queue</Link></Button>
        </CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <CaseHeader
          reference={model.reference}
          subject={model.subject}
          subjectHref={model.entity_href}
          caseType={`Correspondence · ${CORRESPONDENCE_MODULE_LABELS[model.module] ?? model.module}`}
          stageLabel={model.stage_label}
          statusLabel={model.status_label}
          ownerName={model.owner_name}
          team={model.team ?? model.entity_name}
          priority={model.priority}
          slaDueAt={model.sla_due_at}
          slaState={caseHeaderSlaState(model.sla_state)}
          waitingOn={model.waiting_on}
          nextActionLabel={model.next_action}
          lastActivityAt={model.last_activity_at}
          actions={
            <Button asChild variant="ghost">
              <Link to="/correspondence/inbox"><ArrowLeft className="mr-1 h-4 w-4" />Work queue</Link>
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <ThreadDetail threadId={model.id} />
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Related case</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {model.related_case ? (
                  <>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {model.related_case.source_type?.replace(/_/g, ' ')}
                    </div>
                    {model.related_case.href ? (
                      <Link to={model.related_case.href} className="inline-flex items-center gap-1 text-primary hover:underline">
                        {model.related_case.reference ?? 'Open case'}<ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : <span>{model.related_case.reference ?? '—'}</span>}
                    <p className="text-xs text-muted-foreground">
                      The case lifecycle is managed in its own module; this thread records the communication only.
                    </p>
                  </>
                ) : <p className="text-muted-foreground">Not linked to a business case.</p>}
              </CardContent>
            </Card>

            {model.rfi_links?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Information requests</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {model.rfi_links.map((r) => (
                    <div key={r.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px]">{r.kind.replace(/_/g, ' ')}</Badge>
                        <Badge variant="secondary" className="text-[10px] capitalize">{r.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{r.summary || '—'}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          Due {r.due_at ? formatDateTime(r.due_at) : '—'}
                        </span>
                        <Link to={r.href} className="text-xs text-primary hover:underline">Open RFI</Link>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Delivery evidence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(model.delivery_evidence ?? []).length === 0 ? (
                  <p className="text-muted-foreground">No dispatched messages yet.</p>
                ) : model.delivery_evidence.map((d) => {
                  const state = (d.evidence_state ?? 'unknown') as DeliveryEvidenceState;
                  const failed = DELIVERY_FAILED_STATES.includes(state);
                  const confirmed = d.delivery_confirmed === true;
                  return (
                    <div key={d.message_id} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="capitalize">{d.channel}</span>
                        <Badge
                          variant={failed ? 'destructive' : confirmed ? 'default' : 'outline'}
                          className="text-[10px]"
                        >
                          {DELIVERY_EVIDENCE_LABELS[state] ?? state}
                        </Badge>
                      </div>
                      {d.recipient && <div className="text-muted-foreground">{d.recipient}</div>}
                      <div className="text-muted-foreground">
                        Sent {d.sent_at ? formatDateTime(d.sent_at) : '—'}
                        {d.delivered_at ? ` · delivered ${formatDateTime(d.delivered_at)}` : ''}
                        {d.opened_at ? ` · opened ${formatDateTime(d.opened_at)}` : ''}
                      </div>
                      {!confirmed && !failed && (
                        <div className="text-muted-foreground">Delivery not confirmed by the provider.</div>
                      )}
                      {failed && (
                        <div className="text-destructive">
                          {d.error_message ?? d.bounce_reason ?? 'Delivery did not succeed.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
