import { useParams, Link } from 'react-router-dom';
import { useEntityHistoricalProfile } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { HistoryButton } from '@/components/audit/HistoryButton';

export default function PrudentialEntityProfile() {
  const { id } = useParams();
  const { data, isLoading } = useEntityHistoricalProfile(id);
  if (isLoading || !data?.entity) return <div className="p-6">Loading…</div>;
  const e: any = data.entity;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{e.name}</h1>
          <p className="text-sm text-muted-foreground">
            Status: <Badge variant="outline">{e.status || '—'}</Badge>
          </p>
        </div>
        <HistoryButton entityType="licensee" entityId={e.id} title={`${e.name} history`} />
      </div>

      <Tabs defaultValue="returns">
        <TabsList>
          <TabsTrigger value="returns">Historical Returns</TabsTrigger>
          <TabsTrigger value="ratios">Ratios</TabsTrigger>
          <TabsTrigger value="breaches">Breaches</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
        </TabsList>

        <TabsContent value="returns">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Return</TableHead><TableHead>Period end</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.returns.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><Link className="text-primary underline" to={`/returns-management/${r.id}`}>{r.unique_id || r.id.slice(0,8)}</Link></TableCell>
                    <TableCell>{r.period_end_date}</TableCell>
                    <TableCell>{r.submit_date ? new Date(r.submit_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell><Badge variant="outline">{r.workflow_status || r.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {!data.returns.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No returns.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ratios">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Ratio</TableHead><TableHead>Value</TableHead><TableHead>Computed</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.ratios.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.label || r.ratio_key}</TableCell>
                    <TableCell>{r.value}</TableCell>
                    <TableCell>{new Date(r.computed_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {!data.ratios.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No ratios yet.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="breaches">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Severity</TableHead><TableHead>Value</TableHead><TableHead>Detected</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.breaches.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.metric_key || b.ratio_key || '—'}</TableCell>
                    <TableCell><Badge>{b.severity || '—'}</Badge></TableCell>
                    <TableCell>{b.observed_value ?? b.value ?? '—'}</TableCell>
                    <TableCell>{new Date(b.detected_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {!data.breaches.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No breaches.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="assessments">
          <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Assessments</CardTitle>
            <Link className="text-primary text-sm underline" to={`/prudential/assessments?entity=${e.id}`}>New assessment</Link>
          </CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.assessments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.period_start} → {a.period_end}</TableCell>
                    <TableCell><Badge>{a.overall_rating || '—'}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                    <TableCell className="text-right"><Link className="text-primary underline" to={`/prudential/assessments/${a.id}`}>Open</Link></TableCell>
                  </TableRow>
                ))}
                {!data.assessments.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No assessments.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.actions.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{a.action_type}</TableCell>
                    <TableCell><Badge>{a.severity}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                    <TableCell>{a.due_date || '—'}</TableCell>
                  </TableRow>
                ))}
                {!data.actions.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No actions.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="escalations">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Decided</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.escalations.map((es: any) => (
                  <TableRow key={es.id}>
                    <TableCell>{es.escalation_type}</TableCell>
                    <TableCell className="max-w-md truncate">{es.reason}</TableCell>
                    <TableCell><Badge variant="outline">{es.status}</Badge></TableCell>
                    <TableCell>{es.decided_at ? new Date(es.decided_at).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {!data.escalations.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No escalations.</TableCell></TableRow>}
              </TableBody></Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
