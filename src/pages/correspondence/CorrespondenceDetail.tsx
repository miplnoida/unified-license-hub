import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LifecycleStepper } from '@/components/correspondence/LifecycleStepper';
import { AuditTrailPanel } from '@/components/correspondence/AuditTrailPanel';
import { ClassificationPanel } from '@/components/correspondence/ClassificationPanel';
import { AssignmentPanel } from '@/components/correspondence/AssignmentPanel';
import { ReviewApprovalPanel } from '@/components/correspondence/ReviewApprovalPanel';
import { ResponseComposer } from '@/components/correspondence/ResponseComposer';
import { VersionHistoryList } from '@/components/correspondence/VersionHistoryList';
import { RetentionBadge } from '@/components/correspondence/RetentionBadge';
import { seedCases } from './seed';
import { ArrowLeft } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function CorrespondenceDetail() {
  const { id } = useParams();
  const c = seedCases.find((x) => x.id === id) ?? seedCases[0];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link to="/correspondence/inbox"><ArrowLeft className="h-4 w-4 mr-1" />Back to inbox</Link>
          </Button>
          <PageHeader
            title={c.subject}
            description={`${c.reference} · from ${c.senderName}${c.senderOrg ? ` (${c.senderOrg})` : ''}`}
            actions={
              <div className="flex items-center gap-2">
                <Badge variant="outline">{c.channel}</Badge>
                <Badge variant="outline">{c.category}</Badge>
                <Badge variant="secondary">{c.status.replace('_', ' ')}</Badge>
                <RetentionBadge years={c.retentionYears} expiresAt={c.retentionExpiresAt} />
              </div>
            }
          />
        </div>

        <Card>
          <CardContent className="pt-4"><LifecycleStepper status={c.status} /></CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{c.summary}</CardContent>
            </Card>

            <Tabs defaultValue="classify">
              <TabsList>
                <TabsTrigger value="classify">Classify</TabsTrigger>
                <TabsTrigger value="assign">Assign</TabsTrigger>
                <TabsTrigger value="review">Review &amp; Approve</TabsTrigger>
                <TabsTrigger value="respond">Respond</TabsTrigger>
                <TabsTrigger value="records">Records</TabsTrigger>
              </TabsList>
              <TabsContent value="classify"><Card><CardContent className="pt-4"><ClassificationPanel category={c.category} priority={c.priority} /></CardContent></Card></TabsContent>
              <TabsContent value="assign"><Card><CardContent className="pt-4"><AssignmentPanel unit={c.assignedUnit} officer={c.assignedOfficer} /></CardContent></Card></TabsContent>
              <TabsContent value="review"><Card><CardContent className="pt-4"><ReviewApprovalPanel /></CardContent></Card></TabsContent>
              <TabsContent value="respond"><Card><CardContent className="pt-4"><ResponseComposer recipient={`${c.senderName} <recipient@example.com>`} /></CardContent></Card></TabsContent>
              <TabsContent value="records">
                <Card>
                  <CardHeader><CardTitle className="text-base">Attachments &amp; versions</CardTitle></CardHeader>
                  <CardContent><VersionHistoryList items={c.attachments} /></CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Case details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <Row label="Received" value={`${format(new Date(c.receivedAt), 'PPp')} (${formatDistanceToNow(new Date(c.receivedAt), { addSuffix: true })})`} />
                <Row label="SLA due" value={`${format(new Date(c.dueAt), 'PP')} (${c.slaDays} days)`} />
                <Row label="Assigned unit" value={c.assignedUnit} />
                <Row label="Officer" value={c.assignedOfficer} />
                <Row label="Priority" value={c.priority} />
                <Row label="Retention" value={`${c.retentionYears} years · disposal ${format(new Date(c.retentionExpiresAt), 'PP')}`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Full audit trail</CardTitle></CardHeader>
              <CardContent><AuditTrailPanel entries={c.audit} /></CardContent>
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
