import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useInvestigation, useUpdateInvestigation } from '@/hooks/useMarketConduct';
import { EvidenceRepositoryPanel } from '@/components/conduct/EvidenceRepositoryPanel';
import { InterviewsPanel } from '@/components/conduct/InterviewsPanel';
import { ClosurePanel } from '@/components/conduct/ClosurePanel';
import { InvestigationCaseFilePanel } from '@/components/conduct/InvestigationCaseFilePanel';
import { CommunicationTimeline } from '@/components/notifications/CommunicationTimeline';


import { HistoryButton } from '@/components/audit/HistoryButton';
import { toast } from 'sonner';

import { Loader2, ArrowLeft } from 'lucide-react';

// 'closed' and 'discontinued' are reached only through the formal closure gate.
const STATUSES = ['opened','evidence_gathering','analysis','proposed_outcome'];
const CONCLUDED = ['closed','discontinued'];

export default function InvestigationDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useInvestigation(id);
  const update = useUpdateInvestigation();
  const [status, setStatus] = useState<string>('');

  if (isLoading || !data) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div></DashboardLayout>;
  }

  const concluded = CONCLUDED.includes(data.status);

  const saveStatus = async () => {
    const s = status || data.status;
    if (s === data.status) { toast.info('Status unchanged'); return; }
    await update.mutateAsync({ id: id!, patch: { status: s as any } });
    refetch();

  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title={data.allegation.slice(0, 80)}
          description={`Investigation for ${data.licensees?.name || 'entity'}`}
          actions={
            <div className="flex gap-2">
              <HistoryButton entityType="conduct_investigation" entityId={data.id} title="Investigation history" />
              <Button variant="ghost" asChild><Link to="/conduct/investigations"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
            </div>
          }
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Overview</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Status:</span> <Badge className="capitalize ml-2">{data.status.replace(/_/g, ' ')}</Badge></div>
              <div><span className="text-muted-foreground">Priority:</span> <Badge variant="outline" className="ml-2 capitalize">{data.priority}</Badge></div>
              <div><span className="text-muted-foreground">Severity:</span> <Badge variant="outline" className="ml-2 capitalize">{data.severity}</Badge></div>
              <div><span className="text-muted-foreground">Source:</span> {data.source_type}</div>
              <div><span className="text-muted-foreground">Due:</span> {data.due_date || '—'}</div>
              <div><span className="text-muted-foreground">Allegation:</span><br />{data.allegation}</div>
              {(data as any).discontinuation_ground && (
                <div><span className="text-muted-foreground">Discontinuation ground:</span> {(data as any).discontinuation_ground.replace(/_/g, ' ')}</div>
              )}
              {data.outcome && <div><span className="text-muted-foreground">Outcome:</span><br />{data.outcome}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Change status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={status || data.status} onValueChange={setStatus} disabled={concluded}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(concluded ? [...STATUSES, data.status] : STATUSES).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
              <Button data-rbac="market_conduct.edit" onClick={saveStatus} disabled={update.isPending || concluded} className="w-full">Save</Button>
              <p className="text-xs text-muted-foreground">
                {concluded
                  ? 'This investigation has been concluded through the closure gate.'
                  : 'Closure and discontinuation are handled on the Closure tab and require supervisory approval.'}
              </p>
            </CardContent>
          </Card>
        </div>

        {data.source_type === 'surveillance_signal' && data.metadata?.signal_id && (
          <Card>
            <CardHeader><CardTitle className="text-base">Surveillance provenance</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">Signal kind:</span> {String(data.metadata.signal_kind || '—').replace(/_/g, ' ')}</div>
              <div><span className="text-muted-foreground">Rule version:</span> {data.metadata.signal_rule_version ?? '—'}</div>
              <div><span className="text-muted-foreground">Threshold:</span> {data.metadata.signal_threshold ?? '—'}</div>
              <div>
                <span className="text-muted-foreground">Observation window:</span>{' '}
                {data.metadata.signal_observation_start
                  ? `${new Date(data.metadata.signal_observation_start).toLocaleDateString()} → ${
                      data.metadata.signal_observation_end
                        ? new Date(data.metadata.signal_observation_end).toLocaleDateString()
                        : 'open'
                    }`
                  : '—'}
              </div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Signal explanation:</span> {data.metadata.signal_explanation || '—'}</div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Referral reason:</span> {data.metadata.referral_reason || '—'}</div>
              <div className="md:col-span-2">
                <Link className="text-primary hover:underline text-sm" to="/conduct/surveillance">Open Market Surveillance workspace</Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="casefile">Case file</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="interviews">Interviews</TabsTrigger>
            <TabsTrigger value="closure">Closure</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
          </TabsList>
          <TabsContent value="casefile">
            <InvestigationCaseFilePanel investigation={data as any} locked={concluded} onSaved={refetch} />
          </TabsContent>
          <TabsContent value="evidence"><EvidenceRepositoryPanel investigationId={data.id} entityId={data.licensee_id || undefined} /></TabsContent>
          <TabsContent value="interviews"><InterviewsPanel investigationId={data.id} entityId={data.licensee_id || undefined} /></TabsContent>
          <TabsContent value="closure"><ClosurePanel investigationId={data.id} investigation={data} /></TabsContent>
          <TabsContent value="communications">
            <CommunicationTimeline objectType="conduct_investigation" objectId={data.id} />
          </TabsContent>
        </Tabs>


      </div>
    </DashboardLayout>
  );
}
