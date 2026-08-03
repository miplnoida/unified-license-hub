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
import { dispatchNotificationEvent } from '@/lib/notificationEvents';
import type { CorrespondenceStatus } from '@/pages/correspondence/types';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

export default function MyCorrespondenceDetail() {
  const { id } = useParams();
  const { data, isLoading, error } = useCorrespondenceThread(id);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center space-y-3">
          <p className="text-muted-foreground">{(error as any)?.message ?? 'Correspondence not found.'}</p>
          <Button asChild variant="outline"><Link to="/entity/correspondence">Back</Link></Button>
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
            <Link to="/entity/correspondence"><ArrowLeft className="h-4 w-4 mr-1" />Back to my correspondence</Link>
          </Button>
          <PageHeader
            title={c.subject}
            description={`${c.reference} · received ${format(new Date(c.received_at), 'PP')}`}
            actions={<Badge variant="secondary">{c.status.replace('_', ' ')}</Badge>}
          />
        </div>

        <Card><CardContent className="pt-4"><LifecycleStepper status={c.status as CorrespondenceStatus} /></CardContent></Card>

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
                  replyLabel="Write a reply to the regulator"
                  onSent={(body) => {
                  }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
              <CardContent><AttachmentsPanel threadId={c.id} attachments={attachments} /></CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Category" value={c.category} />
                <Row label="Channel" value={c.channel} />
                <Row label="Response due" value={c.due_at ? format(new Date(c.due_at), 'PP') : '—'} />
                <Row label="Handled by" value={c.assigned_unit ?? 'Being assigned'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Progress history</CardTitle></CardHeader>
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
      <div className="text-sm font-medium text-right capitalize">{value}</div>
    </div>
  );
}
