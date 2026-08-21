/**
 * P12 — entity-side view of the canonical correspondence thread.
 *
 * Identity, lifecycle stage, service level, waiting-on, next action and delivery
 * evidence all come from the governed `correspondence_thread_case` read model —
 * the same authority the regulator workspace uses — so the two sides can never
 * disagree. Only the conversation and document rendering is local, and internal
 * notes / RFI links are withheld by the server for non-staff users.
 */
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LifecycleStepper } from '@/components/correspondence/LifecycleStepper';
import { MessageThreadPanel } from '@/components/correspondence/MessageThreadPanel';
import { AttachmentsPanel } from '@/components/correspondence/AttachmentsPanel';
import { AuditTrailPanel } from '@/components/correspondence/AuditTrailPanel';
import { useCorrespondenceThread } from '@/hooks/useCorrespondence';
import {
  useCorrespondenceThreadCase, DELIVERY_EVIDENCE_LABELS, DELIVERY_FAILED_STATES,
  type DeliveryEvidenceState,
} from '@/hooks/useCorrespondenceQueue';
import type { CorrespondenceStatus } from '@/pages/correspondence/types';
import { ArrowLeft } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';

export default function MyCorrespondenceDetail() {
  const { id } = useParams();
  const { data: model, isLoading, error } = useCorrespondenceThreadCase(id);
  const { data: content } = useCorrespondenceThread(model ? id : undefined);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>
      </DashboardLayout>
    );
  }

  if (error || !model) {
    const forbidden = String((error as Error)?.message ?? '').includes('forbidden');
    return (
      <DashboardLayout>
        <Card><CardContent className="space-y-3 py-10 text-center">
          <p className="text-muted-foreground">
            {forbidden
              ? 'You do not have access to this correspondence.'
              : 'Correspondence not found.'}
          </p>
          <Button asChild variant="outline"><Link to="/entity/correspondence">Back</Link></Button>
        </CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link to="/entity/correspondence"><ArrowLeft className="h-4 w-4 mr-1" />Back to my correspondence</Link>
          </Button>
          <PageHeader
            title={model.subject}
            description={`${model.reference}${model.last_activity_at ? ` · last activity ${formatDateTime(model.last_activity_at)}` : ''}`}
            actions={<Badge variant="secondary">{model.status_label}</Badge>}
          />
        </div>

        <Card><CardContent className="pt-4">
          <LifecycleStepper status={(content?.thread.status ?? model.thread_state) as CorrespondenceStatus} />
        </CardContent></Card>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {model.summary && (
              <Card>
                <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">{model.summary}</CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle className="text-base">Conversation</CardTitle></CardHeader>
              <CardContent>
                <MessageThreadPanel
                  threadId={model.id}
                  messages={content?.messages ?? []}
                  replyLabel="Write a reply to the regulator"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
              <CardContent><AttachmentsPanel threadId={model.id} attachments={content?.attachments ?? []} /></CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Category" value={model.category} />
                <Row label="Channel" value={model.channel} />
                <Row label="Stage" value={model.stage_label} />
                <Row label="Response due" value={model.sla_due_at ? formatDateTime(model.sla_due_at) : '—'} />
                <Row label="Service level" value={model.sla_state === 'none' ? 'Not applicable' : model.sla_state.replace(/_/g, ' ')} />
                <Row label="Waiting on" value={model.waiting_on ?? '—'} />
                <Row label="Next action" value={model.next_action ?? '—'} />
                <Row label="Handled by" value={model.team ?? 'Being assigned'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Delivery evidence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(model.delivery_evidence ?? []).length === 0 ? (
                  <p className="text-muted-foreground">No dispatched messages yet.</p>
                ) : model.delivery_evidence.map((d) => {
                  const state = (d.evidence_state ?? 'unknown') as DeliveryEvidenceState;
                  const failed = DELIVERY_FAILED_STATES.includes(state);
                  return (
                    <div key={d.message_id} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="capitalize">{d.channel}</span>
                        <Badge variant={failed ? 'destructive' : d.delivery_confirmed ? 'default' : 'outline'} className="text-[10px]">
                          {DELIVERY_EVIDENCE_LABELS[state] ?? state}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        Sent {d.sent_at ? formatDateTime(d.sent_at) : '—'}
                        {d.delivered_at ? ` · delivered ${formatDateTime(d.delivered_at)}` : ''}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Progress history</CardTitle></CardHeader>
              <CardContent><AuditTrailPanel entries={content?.events ?? []} /></CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-right capitalize">{value}</div>
    </div>
  );
}
