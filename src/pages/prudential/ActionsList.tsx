import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, RefreshCw, Loader2, AlertTriangle, ExternalLink, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { formatDateOnly } from '@/lib/datetime';
import {
  actionStatusLabel,
  actionTypeLabel,
  lifecycleBadgeClass,
  reviewStatusLabel,
  riskSeverityBadgeClass,
} from '@/lib/prudentialLabels';
import { CreatePrudentialActionDialog } from '@/components/prudential/CreatePrudentialActionDialog';
import { PrudentialActionDrawer } from '@/components/prudential/PrudentialActionDrawer';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useMarkOverdue } from '@/hooks/usePrudentialSupervision';
import {
  ACTION_BUCKETS,
  sourceLink,
  useActionMonitor,
  useSweepBreachedActions,
  type ActionBucket,
  type MonitoredAction,
} from '@/hooks/usePrudentialActionLifecycle';

export default function ActionsList() {
  const { data, isLoading } = useActionMonitor();
  const overdue = useMarkOverdue();
  const breachSweep = useSweepBreachedActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [bucket, setBucket] = useState<ActionBucket>('open');
  const [selected, setSelected] = useState<MonitoredAction | null>(null);
  const [search, setSearch] = useState('');

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? {};
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.bucket !== bucket) return false;
      if (!q) return true;
      return [r.action_reference, r.entity_name, r.title, r.action_type]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rows, bucket, search]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Prudential Actions</h1>
            <p className="text-sm text-muted-foreground">
              Supervisory action monitoring — every row drills through to the action and its source finding.
            </p>
          </div>
          <div className="flex gap-2">
            <Button data-rbac="prudential_supervision.edit" variant="outline" size="sm" disabled={overdue.isPending} onClick={() => overdue.mutate()}>
              {overdue.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sweep overdue
            </Button>
            <Button data-rbac="prudential_supervision.edit" variant="outline" size="sm" disabled={breachSweep.isPending} onClick={() => breachSweep.mutate()}>
              {breachSweep.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
              Sweep breaches
            </Button>
            <Button data-rbac="prudential_supervision.create" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />New action
            </Button>
          </div>
        </div>

        <Tabs value={bucket} onValueChange={(v) => setBucket(v as ActionBucket)}>
          <TabsList className="flex-wrap h-auto">
            {ACTION_BUCKETS.map((b) => (
              <TabsTrigger key={b.key} value={b.key}>
                {b.label}
                <span className="ml-2 text-xs text-muted-foreground">{counts[b.key] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle>{ACTION_BUCKETS.find((b) => b.key === bucket)?.label} ({visible.length})</CardTitle>
            <div className="relative w-64 max-w-full">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search reference, entity, title"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.action_reference}</TableCell>
                        <TableCell>{a.entity_name ?? '—'}</TableCell>
                        <TableCell>{a.title}</TableCell>
                        <TableCell>{actionTypeLabel(a.action_type)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={riskSeverityBadgeClass(a.severity)}>
                            {a.severity ? a.severity[0].toUpperCase() + a.severity.slice(1) : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={lifecycleBadgeClass(a.status)}>
                            {actionStatusLabel(a.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.evidence_required ? reviewStatusLabel(a.review_status) : 'Not required'}
                        </TableCell>
                        <TableCell>{formatDateOnly(a.due_date)}</TableCell>
                        <TableCell>
                          {sourceLink(a) ? (
                            <Link
                              to={sourceLink(a)!}
                              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {a.source_type ? actionTypeLabel(a.source_type) : 'Entity'}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setSelected(a)}>Open</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!visible.length && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                          No supervisory actions in this bucket.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <CreatePrudentialActionDialog open={createOpen} onOpenChange={setCreateOpen} />
        <PrudentialActionDrawer action={selected} onOpenChange={(o) => !o && setSelected(null)} />
      </div>
    </DashboardLayout>
  );
}
