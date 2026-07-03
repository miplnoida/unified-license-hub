import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Search, Microscope, AlertTriangle, ClipboardCheck } from 'lucide-react';

export const THEMATIC_STATUSES = [
  'draft', 'scoped', 'evidence_collection', 'analysis',
  'findings_issued', 'actions_required', 'monitoring', 'closed',
];
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', scoped: 'Scoped', evidence_collection: 'Evidence Collection',
  analysis: 'Analysis', findings_issued: 'Findings Issued',
  actions_required: 'Actions Required', monitoring: 'Monitoring', closed: 'Closed',
};
const STATUS_VARIANT: Record<string, any> = {
  draft: 'outline', scoped: 'secondary', evidence_collection: 'secondary',
  analysis: 'secondary', findings_issued: 'default',
  actions_required: 'default', monitoring: 'default', closed: 'outline',
};

export default function ThematicReviews() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [kpis, setKpis] = useState({ open: 0, monitoring: 0, overdueActions: 0, findingsQuarter: 0 });

  const load = async () => {
    setLoading(true);
    let query = supabase.from('thematic_reviews' as any).select('*').order('created_at', { ascending: false }).limit(300);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) toast.error(error.message); else setRows((data as any[]) || []);
    setLoading(false);
  };

  const loadKpis = async () => {
    const openRes = await supabase.from('thematic_reviews' as any).select('id', { count: 'exact', head: true }).neq('status', 'closed');
    const monRes = await supabase.from('thematic_reviews' as any).select('id', { count: 'exact', head: true }).eq('status', 'monitoring');
    const overdueRes = await supabase.from('conduct_actions' as any).select('id', { count: 'exact', head: true })
      .eq('source_module', 'thematic_review').eq('status', 'overdue');
    const qStart = new Date();
    qStart.setMonth(Math.floor(qStart.getMonth() / 3) * 3, 1);
    qStart.setHours(0, 0, 0, 0);
    const findingsRes = await supabase.from('thematic_review_findings' as any).select('id', { count: 'exact', head: true })
      .gte('created_at', qStart.toISOString());
    setKpis({
      open: openRes.count || 0,
      monitoring: monRes.count || 0,
      overdueActions: overdueRes.count || 0,
      findingsQuarter: findingsRes.count || 0,
    });
  };

  useEffect(() => { load(); }, [status]);
  useEffect(() => { loadKpis(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      (r.title || '').toLowerCase().includes(needle) ||
      (r.code || '').toLowerCase().includes(needle) ||
      (r.description || '').toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Thematic Reviews"
          description="Cross-sector market conduct thematic supervision programmes."
          actions={
            <Button onClick={() => nav('/supervision/thematic-reviews/new')}>
              <Plus className="h-4 w-4 mr-1" /> New Review
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Open reviews" value={kpis.open} icon={<Microscope className="h-4 w-4" />} />
          <KpiCard label="In monitoring" value={kpis.monitoring} icon={<ClipboardCheck className="h-4 w-4" />} />
          <KpiCard label="Overdue actions" value={kpis.overdueActions} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
          <KpiCard label="Findings this quarter" value={kpis.findingsQuarter} icon={<Microscope className="h-4 w-4" />} />
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by title, code or description" value={q} onChange={e => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {THEMATIC_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Microscope className="h-8 w-8 mx-auto mb-2" />
                No thematic reviews yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.code || '—'}</TableCell>
                      <TableCell>
                        <Link to={`/supervision/thematic-reviews/${r.id}`} className="font-medium hover:underline">
                          {r.title}
                        </Link>
                        {r.description && <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] || 'outline'}>{STATUS_LABEL[r.status] || r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.scope_start ? new Date(r.scope_start).toLocaleDateString() : '—'} → {r.scope_end ? new Date(r.scope_end).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.opened_at ? new Date(r.opened_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/supervision/thematic-reviews/${r.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: 'destructive' }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}>{value}</p>
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
