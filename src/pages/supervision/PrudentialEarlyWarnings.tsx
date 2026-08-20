import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Loader2, TrendingDown, TrendingUp, Download, Play, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { logExport } from '@/lib/exportAudit';
import { logAudit } from '@/hooks/useAuditLog';
import { supervisoryPlanActionCreate } from '@/lib/prudentialGovernedOps';

type Warning = {
  licensee_id: string;
  licensee_name: string;
  regulator_id: string | null;
  sector_id: string | null;
  ratio_key: string;
  current_value: number;
  previous_value: number | null;
  delta_pct: number | null;
  recent_breach_count: number;
  warning_level: 'ok' | 'watch' | 'warning' | 'critical';
  last_seen: string;
};

const LEVEL_BADGE: Record<Warning['warning_level'], string> = {
  ok: 'bg-muted text-muted-foreground border-muted',
  watch: 'bg-primary/10 text-primary border-primary/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function PrudentialEarlyWarnings() {
  const nav = useNavigate();
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['prudential-early-warnings'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('v_prudential_early_warnings') as any)
        .select('*').order('last_seen', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as Warning[];
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (levelFilter !== 'all' && r.warning_level !== levelFilter) return false;
      if (search && !`${r.licensee_name} ${r.ratio_key}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, levelFilter, search]);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, watch: 0, ok: 0 };
    data.forEach((r) => { c[r.warning_level] = (c[r.warning_level] ?? 0) + 1; });
    return c;
  }, [data]);

  const seedAction = useMutation({
    mutationFn: async (w: Warning) => {
      // Find any active supervisory plan for this licensee.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: plan } = await (supabase.from('supervisory_plans') as any)
        .select('id').eq('entity_id', w.licensee_id).eq('status', 'active').limit(1).maybeSingle();
      if (!plan?.id) throw new Error('No active supervisory plan for this licensee. Open the licensee first.');
      // Governed operation: authority checks and audit trail run server-side.
      await supervisoryPlanActionCreate({
        planId: plan.id,
        title: `Investigate ${w.ratio_key} deterioration`,
        description: `Automated early-warning: ${w.warning_level} on ${w.ratio_key} (current ${w.current_value}, delta ${w.delta_pct ?? '—'}%, ${w.recent_breach_count} recent breach(es))`,
        dueDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
        source: 'early_warning',
      });
    },
    onSuccess: () => toast.success('Supervisory action created'),
    onError: (e: Error) => toast.error(e.message),
  });

  const runRecompute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('evaluate-prudential-early-warnings', { body: {} });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? 'Failed');
      return data;
    },
    onSuccess: () => { toast.success('Warnings recomputed'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = async () => {
    if (filtered.length === 0) return;
    await authorizedExport('prudential_supervision', 'export', { count: filtered.length });
    const header = ['licensee_name', 'ratio_key', 'current_value', 'previous_value', 'delta_pct', 'recent_breach_count', 'warning_level', 'last_seen'];
    const rows = filtered.map((r) => [r.licensee_name, r.ratio_key, r.current_value, r.previous_value, r.delta_pct, r.recent_breach_count, r.warning_level, r.last_seen]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `prudential-early-warnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    await logExport({ dataset: 'prudential_early_warnings', format: 'csv', rowCount: filtered.length, moduleKey: 'returns_management', payload: csv });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Prudential Early Warnings"
        description="Deteriorating ratios and repeat threshold breaches surfaced before they become formal enforcement events."
        actions={
          <div className="flex gap-2">
            <Button data-rbac="prudential_supervision.edit" variant="outline" size="sm" onClick={() => runRecompute.mutate()} disabled={runRecompute.isPending}>
              {runRecompute.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
              Recompute
            </Button>
            <Button data-rbac="prudential_supervision.export" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-3 w-3 mr-1" />Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {(['critical', 'warning', 'watch', 'ok'] as const).map((lvl) => (
          <Card key={lvl}>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className={`h-6 w-6 ${lvl === 'critical' ? 'text-destructive' : lvl === 'warning' ? 'text-warning' : 'text-muted-foreground'}`} />
              <div>
                <div className="text-2xl font-bold">{counts[lvl]}</div>
                <div className="text-xs uppercase text-muted-foreground">{lvl}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Level</Label>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="watch">Watch</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Search (licensee or ratio)</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. CAR, ACME Bank" />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Warnings ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Licensee</TableHead>
                    <TableHead>Ratio</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Previous</TableHead>
                    <TableHead>Δ %</TableHead>
                    <TableHead>Breaches (180d)</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={`${r.licensee_id}-${r.ratio_key}`}>
                      <TableCell className="font-medium">{r.licensee_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.ratio_key}</TableCell>
                      <TableCell>{r.current_value}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.previous_value ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {r.delta_pct === null ? '—' : (
                          <span className={r.delta_pct < 0 ? 'text-destructive flex items-center gap-1' : 'text-success flex items-center gap-1'}>
                            {r.delta_pct < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}{r.delta_pct}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{r.recent_breach_count}</TableCell>
                      <TableCell><Badge variant="outline" className={LEVEL_BADGE[r.warning_level]}>{r.warning_level}</Badge></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.last_seen).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => nav(`/admin/licensees/${r.licensee_id}`)}>Open</Button>
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => seedAction.mutate(r)} disabled={seedAction.isPending}>
                          <ClipboardList className="h-3 w-3 mr-1" />Seed action
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No warnings match the filters.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
