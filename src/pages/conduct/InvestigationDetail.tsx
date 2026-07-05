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
import { HistoryButton } from '@/components/audit/HistoryButton';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Loader2, ArrowLeft } from 'lucide-react';

const STATUSES = ['opened','evidence_gathering','analysis','proposed_outcome','closed'];

export default function InvestigationDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useInvestigation(id);
  const update = useUpdateInvestigation();
  const [status, setStatus] = useState<string>('');
  const [outcome, setOutcome] = useState('');

  if (isLoading || !data) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div></DashboardLayout>;
  }

  const saveStatus = async () => {
    const s = status || data.status;
    if (s === 'closed') {
      const res = await Swal.fire({
        title: 'Close investigation?', input: 'textarea',
        inputLabel: 'Outcome / closure reason (min 10 chars)',
        inputValue: outcome,
        inputValidator: v => (!v || v.trim().length < 10) ? 'Required' : null,
        showCancelButton: true, confirmButtonText: 'Close investigation',
      });
      if (!res.isConfirmed) return;
      await update.mutateAsync({ id: id!, patch: { status: 'closed', outcome: res.value, closure_reason: res.value }, justification: res.value });
    } else {
      await update.mutateAsync({ id: id!, patch: { status: s as any } });
    }
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
              {data.outcome && <div><span className="text-muted-foreground">Outcome:</span><br />{data.outcome}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Change status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={status || data.status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={saveStatus} disabled={update.isPending} className="w-full">Save</Button>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
          </TabsList>
          <TabsContent value="evidence"><EvidenceRepositoryPanel investigationId={data.id} entityId={data.licensee_id || undefined} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
