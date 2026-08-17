import { useState } from 'react';
import { useEscalations, useUpdateEscalation } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/datetime';
import { escalationStatusLabel, escalationTypeLabel, lifecycleBadgeClass } from '@/lib/prudentialLabels';
import { useUserDisplayNames, actorLabel } from '@/hooks/useUserDisplayNames';
import { CreatePrudentialEscalationDialog } from '@/components/prudential/CreatePrudentialEscalationDialog';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function EscalationsList() {
  const { data = [] } = useEscalations();
  const update = useUpdateEscalation();
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveFor, setResolveFor] = useState<string | null>(null);
  const [decision, setDecision] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: names, isLoading: namesLoading, isError: namesError } = useUserDisplayNames(data.map((e: any) => e.created_by));

  const q = search.trim().toLowerCase();
  const rows = data.filter((es: any) => {
    if (statusFilter !== 'all' && es.status !== statusFilter) return false;
    if (!q) return true;
    return [es.licensees?.name, es.escalation_type, es.reason]
      .some((v: any) => String(v ?? '').toLowerCase().includes(q));
  });
  const statuses = Array.from(new Set(data.map((e: any) => e.status))).filter(Boolean) as string[];

  const submitResolve = async () => {
    if (!resolveFor || update.isPending) return;
    try {
      await update.mutateAsync({ id: resolveFor, patch: { status: 'resolved', decision, outcome } });
      setResolveFor(null); setDecision(''); setOutcome('');
    } catch { /* toast from hook */ }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prudential Escalations</h1>
        <Button data-rbac="prudential_supervision.create" size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />New escalation</Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between space-y-0">
          <CardTitle>Escalations ({rows.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')}>All</Button>
            {statuses.map((st) => (
              <Button key={st} size="sm" variant={statusFilter === st ? 'default' : 'outline'} onClick={() => setStatusFilter(st)}>
                {escalationStatusLabel(st)}
              </Button>
            ))}
            <div className="relative w-56">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search entity or reason" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow>
            <TableHead>Entity</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Raised by</TableHead><TableHead>Raised</TableHead><TableHead>Status</TableHead><TableHead>Decision</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((es: any) => (
              <TableRow key={es.id}>
                <TableCell>
                  {es.entity_id ? (
                    <Link to={`/prudential/entities/${es.entity_id}`} className="text-primary hover:underline">
                      {es.licensees?.name || 'Open entity'}
                    </Link>
                  ) : (es.licensees?.name || '—')}
                </TableCell>
                <TableCell>{escalationTypeLabel(es.escalation_type)}</TableCell>
                <TableCell className="max-w-md truncate">{es.reason}</TableCell>
                <TableCell className="text-sm">{actorLabel(es.created_by, names, { isLoading: namesLoading, isError: namesError })}</TableCell>
                <TableCell className="text-sm">{formatDateTime(es.created_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={lifecycleBadgeClass(es.status)}>{escalationStatusLabel(es.status)}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">{es.decision || '—'}</TableCell>
                <TableCell className="space-x-2">
                  {es.status === 'open' && <Button data-rbac="prudential_supervision.view" size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: es.id, patch: { status: 'under_review' } })}>Review</Button>}
                  {['open','under_review'].includes(es.status) && (
                    <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => { setResolveFor(es.id); setDecision(''); setOutcome(''); }}>Resolve</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No escalations match the current filter.</TableCell></TableRow>}
          </TableBody></Table>
        </div>
      </CardContent></Card>

      <CreatePrudentialEscalationDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!resolveFor} onOpenChange={(o) => !o && setResolveFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve escalation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Decision <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} /></div>
            <div><Label>Outcome <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={update.isPending} onClick={() => setResolveFor(null)}>Back</Button>
            <Button disabled={!decision.trim() || !outcome.trim() || update.isPending} onClick={submitResolve}>
              {update.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Confirm resolution'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
