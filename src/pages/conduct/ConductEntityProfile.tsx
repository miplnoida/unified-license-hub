import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useConductEntitySummary, useConductEntityAuditHistory } from '@/hooks/useMarketConduct';
import { EvidenceRepositoryPanel } from '@/components/conduct/EvidenceRepositoryPanel';
import { IssueActionDialog } from '@/components/conduct/IssueActionDialog';
import { Loader2, ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';



const sb = supabase as any;

function useEntityList<T = any>(table: string, filterCol: string, id: string | undefined, select = '*') {
  return useQuery({
    enabled: !!id,
    queryKey: [`entity-${table}`, id],
    queryFn: async () => {
      const { data, error } = await sb.from(table).select(select).eq(filterCol, id).order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    },
  });
}

export default function ConductEntityProfile() {
  const { id } = useParams<{ id: string }>();
  const [issueOpen, setIssueOpen] = useState(false);
  const { data: entity } = useQuery({
    enabled: !!id,
    queryKey: ['entity', id],
    queryFn: async () => {
      const { data } = await sb.from('licensees')
        .select('id, name, status, sector_id, sub_sector_id, sectors(name), sub_sectors(name)')
        .eq('id', id).maybeSingle();
      return data;
    },
  });
  const { data: summary } = useConductEntitySummary(id);
  const { data: audit } = useConductEntityAuditHistory(id);
  const complaints = useEntityList('complaints', 'licensee_id', id, 'id, complaint_number, subject, status, severity, priority, created_at');
  const complaintIds = (complaints.data ?? []).map((c: any) => c.id);

  const alerts = useQuery({
    enabled: !!id,
    queryKey: ['entity-alerts', id, complaintIds.join(',')],
    queryFn: async () => {
      // Alerts are linked to an entity either directly via licensee_id
      // or indirectly via the complaint_id → complaints.licensee_id chain.
      const or = [`licensee_id.eq.${id}`];
      if (complaintIds.length) or.push(`complaint_id.in.(${complaintIds.join(',')})`);
      const { data, error } = await sb.from('conduct_alerts')
        .select('id, title, kind, severity, status, created_at, complaint_id, licensee_id')
        .or(or.join(','))
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const monitoring = useQuery({
    enabled: !!id,
    queryKey: ['entity-monitoring', id, (alerts.data ?? []).map((a: any) => a.id).join(',')],
    queryFn: async () => {
      // Monitoring hits can attach directly via entity_id, or indirectly
      // through the alert_id linkage back to an alert on this entity.
      const alertIds = (alerts.data ?? []).map((a: any) => a.id);
      const or = [`entity_id.eq.${id}`];
      if (alertIds.length) or.push(`alert_id.in.(${alertIds.join(',')})`);
      const { data, error } = await sb.from('conduct_monitoring_results')
        .select('id, rule_id, matched, evaluated_at, metrics, entity_id, alert_id')
        .or(or.join(','))
        .order('evaluated_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const actions = useEntityList('conduct_actions', 'entity_id', id, 'id, title, action_type, status, due_date, created_at');
  const investigations = useEntityList('conduct_investigations', 'licensee_id', id, 'id, allegation, status, priority, severity, created_at');


  if (!entity) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title={entity.name}
          description={`Market conduct profile · ${entity.sectors?.name || 'sector unknown'}`}
          actions={<Button variant="ghost" asChild><Link to="/conduct/entities"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Complaints total', summary?.complaints_total ?? 0],
            ['Open complaints', summary?.complaints_open ?? 0],
            ['High/Critical', summary?.complaints_high ?? 0],
            ['Repeat', summary?.complaints_repeat ?? 0],
            ['Open alerts', summary?.alerts_open ?? 0],
            ['Open actions', summary?.actions_open ?? 0],
            ['Open investigations', summary?.investigations_open ?? 0],
            ['Thematic reviews', summary?.thematic_reviews ?? 0],
          ].map(([label, val]) => (
            <Card key={label as string}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold font-mono">{val as number}</div>
            </CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="complaints">Complaints</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="investigations">Investigations</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring Hits</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card><CardContent className="p-6 space-y-2 text-sm">
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="ml-2 capitalize">{entity.status}</Badge></div>
              <div><span className="text-muted-foreground">Sector:</span> {entity.sectors?.name || '—'} / {entity.sub_sectors?.name || '—'}</div>
            </CardContent></Card>
            <SupervisoryAiPanel
              module="conduct"
              analysisType="conduct_recurrence"
              scope="entity"
              scopeId={id}
              ready={!complaints.isLoading && !alerts.isLoading}
              label={`Conduct profile — ${entity.name}`}
              title="AI recurring conduct pattern observations"
              description="Optional interpretation of this entity's recorded conduct history. The counts and lists on this page remain the record."
              actionLabel="Generate pattern observations"
              stalenessFacts={{
                complaints: (complaints.data ?? []).length,
                alerts: (alerts.data ?? []).length,
                investigations: (investigations.data ?? []).length,
                actions: (actions.data ?? []).length,
                summary,
              }}
              context={{ entity_status: entity.status, sector: entity.sectors?.name ?? null, on_screen_summary: summary }}
            />
          </TabsContent>


          <TabsContent value="complaints">
            <ListCard rows={complaints.data} loading={complaints.isLoading} columns={['complaint_number','subject','severity','priority','status','created_at']} linkFn={r => `/complaints/${r.id}`} />
          </TabsContent>
          <TabsContent value="alerts">
            <ListCard rows={alerts.data} loading={alerts.isLoading} columns={['title','kind','severity','status','created_at']} linkFn={() => '/conduct/alerts'} />
          </TabsContent>
          <TabsContent value="investigations">
            <ListCard rows={investigations.data} loading={investigations.isLoading} columns={['allegation','status','priority','severity','created_at']} linkFn={r => `/conduct/investigations/${r.id}`} />
          </TabsContent>
          <TabsContent value="evidence">
            <EvidenceRepositoryPanel entityId={id} title="All evidence for this entity" />
          </TabsContent>
          <TabsContent value="actions">
            <div className="flex justify-end mb-2">
              <Button data-rbac="conduct_management.create" size="sm" onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4 mr-1" /> Issue action</Button>
            </div>
            <IssueActionDialog
              open={issueOpen}
              onOpenChange={setIssueOpen}
              defaultEntityId={id}
              defaultSourceModule="entity"
              defaultSourceId={id}
              onCreated={() => actions.refetch()}
            />
            <ListCard rows={actions.data} loading={actions.isLoading} columns={['title','action_type','status','due_date','created_at']} linkFn={() => '/conduct/actions'} />
          </TabsContent>
          <TabsContent value="monitoring">
            <ListCard rows={monitoring.data} loading={monitoring.isLoading} columns={['rule_id','matched','evaluated_at']} linkFn={() => '/admin/conduct/monitoring-rules'} />
          </TabsContent>
          <TabsContent value="audit">
            <Card>
              <CardHeader><CardTitle className="text-base">Unified audit history</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Object</TableHead><TableHead>Justification</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(audit ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No audit entries yet.</TableCell></TableRow>}
                    {(audit ?? []).map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{new Date(r.logged_at).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline">{r.action_type}</Badge></TableCell>
                        <TableCell className="text-xs">{r.object_type}</TableCell>
                        <TableCell className="text-xs max-w-md truncate">{r.justification || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

const DATETIME_COLS = new Set(['created_at', 'updated_at', 'evaluated_at', 'closed_at', 'acknowledged_at', 'window_start', 'window_end']);
const DATE_ONLY_COLS = new Set(['due_date']);

function formatCell(col: string, val: any) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return String(val);
  if (DATETIME_COLS.has(col)) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleString();
  }
  if (DATE_ONLY_COLS.has(col)) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  }
  const s = String(val);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

function ListCard({ rows, loading, columns, linkFn }: { rows: any[] | undefined; loading: boolean; columns: string[]; linkFn: (r: any) => string }) {
  if (loading) return <Card><CardContent className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></CardContent></Card>;
  const r = rows ?? [];
  if (r.length === 0) return <Card><CardContent className="p-6 text-center text-muted-foreground">Nothing recorded.</CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>{columns.map(c => <TableHead key={c}>{c.replace(/_/g, ' ')}</TableHead>)}<TableHead /></TableRow></TableHeader>
        <TableBody>
          {r.map((row: any) => (
            <TableRow key={row.id}>
              {columns.map(c => (
                <TableCell key={c} className="text-sm">{formatCell(c, row[c])}</TableCell>
              ))}
              <TableCell className="text-right"><Button size="sm" variant="ghost" asChild><Link to={linkFn(row)}>Open</Link></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
