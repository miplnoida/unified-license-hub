import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LifecycleStepper } from '@/components/correspondence/LifecycleStepper';
import { AuditTrailPanel } from '@/components/correspondence/AuditTrailPanel';
import { ClassificationPanel } from '@/components/correspondence/ClassificationPanel';
import { AssignmentPanel } from '@/components/correspondence/AssignmentPanel';
import { ReviewApprovalPanel } from '@/components/correspondence/ReviewApprovalPanel';
import { ResponseComposer } from '@/components/correspondence/ResponseComposer';
import { MessageThreadPanel } from '@/components/correspondence/MessageThreadPanel';
import { AttachmentsPanel } from '@/components/correspondence/AttachmentsPanel';
import { RetentionBadge } from '@/components/correspondence/RetentionBadge';
import { useCorrespondenceThread } from '@/hooks/useCorrespondence';
import type { CorrespondenceStatus } from '@/pages/correspondence/types';
import { ArrowLeft } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function CorrespondenceDetail() {
  const { id } = useParams();
  const { data, isLoading, error } = useCorrespondenceThread(id);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-muted-foreground">{(error as any)?.message ?? 'Correspondence not found.'}</p>
          <Button asChild variant="outline"><Link to="/correspondence/inbox">Back to inbox</Link></Button>
        </CardContent></Card>
      </DashboardLayout>
    );
  }

  const { thread: c, messages, attachments, events } = data;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link to="/correspondence/inbox"><ArrowLeft className="h-4 w-4 mr-1" />Back to inbox</Link>
          </Button>
          <PageHeader
            title={c.subject}
            description={`${c.reference} · from ${c.sender_name}${c.sender_org ? ` (${c.sender_org})` : ''}`}
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{c.channel}</Badge>
                <Badge variant="outline">{c.category}</Badge>
                <Badge variant="secondary">{c.status.replace('_', ' ')}</Badge>
                {c.retention_expires_at && <RetentionBadge years={c.retention_years} expiresAt={c.retention_expires_at} />}
              </div>
            }
          />
        </div>

        <Card>
          <CardContent className="pt-4"><LifecycleStepper status={c.status as CorrespondenceStatus} /></CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {c.summary && (
              <Card>
                <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">{c.summary}</CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Conversation</CardTitle></CardHeader>
              <CardContent>
                <MessageThreadPanel
                  threadId={c.id}
                  messages={messages}
                  allowInternalNotes
                  replyLabel="Post a message or internal note"
                />
              </CardContent>
            </Card>

            <Tabs defaultValue="classify">
              <TabsList>
                <TabsTrigger value="classify">Classify</TabsTrigger>
                <TabsTrigger value="assign">Assign</TabsTrigger>
                <TabsTrigger value="review">Review &amp; Approve</TabsTrigger>
                <TabsTrigger value="respond">Respond</TabsTrigger>
                <TabsTrigger value="records">Records</TabsTrigger>
              </TabsList>
              <TabsContent value="classify"><Card><CardContent className="pt-4"><ClassificationPanel threadId={c.id} category={c.category} priority={c.priority} tags={c.tags} /></CardContent></Card></TabsContent>
              <TabsContent value="assign"><Card><CardContent className="pt-4"><AssignmentPanel threadId={c.id} unit={c.assigned_unit} officer={c.assigned_officer} /></CardContent></Card></TabsContent>
              <TabsContent value="review"><Card><CardContent className="pt-4"><ReviewApprovalPanel threadId={c.id} status={c.status} /></CardContent></Card></TabsContent>
              <TabsContent value="respond"><Card><CardContent className="pt-4"><ResponseComposer thread={c} /></CardContent></Card></TabsContent>
              <TabsContent value="records">
                <Card>
                  <CardHeader><CardTitle className="text-base">Attachments &amp; versions</CardTitle></CardHeader>
                  <CardContent><AttachmentsPanel threadId={c.id} attachments={attachments} /></CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Case details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Received" value={`${format(new Date(c.received_at), 'PPp')} (${formatDistanceToNow(new Date(c.received_at), { addSuffix: true })})`} />
                <Row label="SLA due" value={c.due_at ? `${format(new Date(c.due_at), 'PP')} (${c.sla_days} days)` : '—'} />
                <Row label="Assigned unit" value={c.assigned_unit ?? 'Unassigned'} />
                <Row label="Officer" value={c.assigned_officer ?? '—'} />
                <Row label="Priority" value={c.priority} />
                <Row label="Sender email" value={c.sender_email ?? '—'} />
                <Row label="Retention" value={c.retention_expires_at ? `${c.retention_years} years · disposal ${format(new Date(c.retention_expires_at), 'PP')}` : `${c.retention_years} years`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Full audit trail</CardTitle></CardHeader>
              <CardContent><AuditTrailPanel entries={events} /></CardContent>
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
      <div className="text-sm font-medium text-right">{value}</div>
    </div>
  );
}
