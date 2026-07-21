import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, Download, Plus } from 'lucide-react';
import { logAction } from '@/hooks/useAuditLog';
import { IssueActionDialog } from '@/components/conduct/IssueActionDialog';

const SOURCE_MODULES = ['complaint', 'thematic_review', 'monitoring', 'enforcement', 'entity', 'product', 'other'];
const STATUSES = ['open', 'in_progress', 'completed', 'overdue', 'waived', 'cancelled'];

export default function ConductActions() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [issueOpen, setIssueOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('conduct_actions' as any).select('*, licensees(name)').order('due_date', { ascending: true }).limit(500);
    if (status !== 'all') query = query.eq('status', status);
    if (source !== 'all') query = query.eq('source_module', source);
    const { data, error } = await query;
    if (error) toast.error(error.message); else setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [status, source]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      (r.title || '').toLowerCase().includes(needle) ||
      (r.description || '').toLowerCase().includes(needle) ||
      (r.licensees?.name || '').toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const kpis = useMemo(() => ({
    open: rows.filter(r => r.status === 'open' || r.status === 'in_progress').length,
    overdue: rows.filter(r => r.status === 'overdue').length,
    waived: rows.filter(r => r.status === 'waived').length,
    completed: rows.filter(r => r.status === 'completed').length,
  }), [rows]);

  const complete = async (a: any) => {
    const { error } = await supabase.from('conduct_actions' as any)
      .update({ status: 'completed', closed_at: new Date().toISOString() }).eq('id', a.id);
    if (error) return toast.error(error.message);
    await logAction('conduct_action.completed', 'conduct_action', a.id, { before: { status: a.status }, after: { status: 'completed' } });
    load();
  };

  const exportCsv = () => {
    const header = ['title', 'source_module', 'action_type', 'status', 'due_date', 'licensee', 'assigned_to'];
    const csv = [header.join(',')].concat(filtered.map(r => [
      JSON.stringify(r.title || ''), r.source_module, r.action_type, r.status,
      r.due_date || '', JSON.stringify(r.licensees?.name || ''), r.assigned_to || '',
    ].join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `conduct-actions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Conduct Action Ledger"
          description="Unified ledger of remediation, restitution and follow-up actions across complaints, thematic reviews, monitoring and enforcement."
          actions={<div className="flex gap-2">
            <Button data-rbac="conduct_management.create" onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4 mr-1" /> Issue action</Button>
            <Button data-rbac="conduct_management.export" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>}
        />
        <IssueActionDialog open={issueOpen} onOpenChange={setIssueOpen} defaultSourceModule="other" onCreated={load} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Open" value={kpis.open} />
          <Kpi label="Overdue" value={kpis.overdue} tone="destructive" />
          <Kpi label="Waived" value={kpis.waived} />
          <Kpi label="Completed" value={kpis.completed} />
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search title, description or licensee" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCE_MODULES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card><CardContent className="p-0">
          {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          : filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No actions match.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Title</TableHead><TableHead>Source</TableHead><TableHead>Type</TableHead>
                <TableHead>Licensee</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{filtered.map(a => (
                <TableRow key={a.id}>
                  <TableCell><div className="font-medium">{a.title}</div>{a.description && <div className="text-xs text-muted-foreground line-clamp-1">{a.description}</div>}</TableCell>
                  <TableCell><SourceLink a={a} /></TableCell>
                  <TableCell><Badge variant="outline">{a.action_type}</Badge></TableCell>
                  <TableCell className="text-xs">{a.licensees?.name || '—'}</TableCell>
                  <TableCell className="text-xs">{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}</TableCell>
                  <TableCell><Badge variant={a.status === 'overdue' ? 'destructive' : a.status === 'completed' ? 'default' : 'outline'}>{a.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {a.status !== 'completed' && a.status !== 'waived' && (
                      <Button size="sm" variant="outline" onClick={() => complete(a)}>Complete</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'destructive' }) {
  return <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-2xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}>{value}</p></CardContent></Card>;
}
function SourceLink({ a }: { a: any }) {
  if (a.source_module === 'complaint' && a.source_id) return <Link to={`/complaints/${a.source_id}`} className="text-primary text-xs hover:underline">Complaint</Link>;
  if (a.source_module === 'thematic_review' && a.source_id) return <Link to={`/supervision/thematic-reviews/${a.source_id}`} className="text-primary text-xs hover:underline">Thematic</Link>;
  if (a.source_module === 'enforcement' && a.source_id) return <Link to={`/enforcement/${a.source_id}`} className="text-primary text-xs hover:underline">Enforcement</Link>;
  return <Badge variant="outline" className="text-xs">{a.source_module}</Badge>;
}
