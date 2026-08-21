/**
 * P08.17–P08.19 — Conduct alert register.
 *
 * The register is served by `conduct_alert_register` with server paging,
 * filtering and counts, and exposes the full signal lineage (source, rule and
 * version, observation window, explanation). Every disposition — acknowledge,
 * dismiss, link to an existing case, or promote to an investigation — runs
 * through a governed RPC that requires a written rationale and audits itself.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Bell, ChevronLeft, ChevronRight, ArrowUpRight, Search } from 'lucide-react';
import { conductAlertAcknowledge } from '@/lib/conductGovernedOps';
import { useAlertCounts, useAlertDispose, useAlertPromote, useAlertRegister, type AlertRow } from '@/hooks/useConductRegisters';
import { formatDateTime } from '@/lib/datetime';

const SEV_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline', medium: 'secondary', high: 'default', critical: 'destructive',
};
const PAGE_SIZE = 25;

export default function ConductAlerts() {
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dispose, setDispose] = useState<AlertRow | null>(null);
  const [promote, setPromote] = useState<AlertRow | null>(null);

  const filters = useMemo(() => ({
    statuses: status === 'all' ? null : [status],
    severities: severity === 'all' ? null : [severity],
    search: search.trim() || null,
    includeClosed: status === 'all' || status === 'closed' || status === 'dismissed',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [status, severity, search, page]);

  const { data: rows = [], isLoading, refetch } = useAlertRegister(filters);
  const { data: counts } = useAlertCounts();
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const acknowledge = async (row: AlertRow) => {
    setBusyId(row.id);
    try {
      await conductAlertAcknowledge(row.id);
      toast.success('Alert acknowledged');
      refetch();
    } catch (e) {
      toast.error((e as Error).message || 'Could not acknowledge alert');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Conduct Alert Register"
          description="Detected conduct signals with their full lineage: source, rule and version, observation window and explanation. Each alert must be dispositioned — dismissed with reasons, linked to an existing case, or promoted to an investigation."
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Kpi label="Open" value={Number(counts?.open ?? 0)} />
          <Kpi label="Acknowledged" value={Number(counts?.acknowledged ?? 0)} />
          <Kpi label="High / critical open" value={Number(counts?.high_severity_open ?? 0)} tone="destructive" />
          <Kpi label="Promoted" value={Number(counts?.promoted ?? 0)} />
          <Kpi label="Disposed" value={Number(counts?.closed ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search alert title or entity"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {['critical', 'high', 'medium', 'low'].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card><CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Bell className="mx-auto mb-2 h-8 w-8" />No alerts match.
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Observation window</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status / disposition</TableHead>
                <TableHead>Linked case</TableHead>
                <TableHead className="text-right">Disposition</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.reference}
                    <div className="text-[11px] text-muted-foreground">{r.generated_at ? formatDateTime(r.generated_at) : ''}</div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {(r.kind ?? '').replace(/_/g, ' ')}
                      {r.source ? ` · ${r.source}` : ''}
                      {r.rule_id ? ` · rule v${r.rule_version ?? 1}` : ''}
                    </div>
                    {r.explanation ? (
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.explanation}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.entity_name ?? '—'}
                    <div className="text-xs text-muted-foreground">
                      {[r.product_name, r.channel_name, r.risk_category_name].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.observation_start || r.observation_end
                      ? `${r.observation_start ? formatDateTime(r.observation_start) : '—'} → ${r.observation_end ? formatDateTime(r.observation_end) : '—'}`
                      : 'Not recorded'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SEV_VARIANT[r.severity ?? 'low'] ?? 'outline'} className="capitalize">{r.severity}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{r.status}</Badge>
                    {r.disposition ? (
                      <div className="mt-1 text-xs capitalize text-muted-foreground">{r.disposition.replace(/_/g, ' ')}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.investigation_href ? (
                      <Link to={r.investigation_href} className="text-primary hover:underline">Investigation</Link>
                    ) : r.complaint_href ? (
                      <Link to={r.complaint_href} className="text-primary hover:underline">Complaint</Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'open' && (
                      <Button
                        data-rbac="market_conduct.edit"
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => acknowledge(r)}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />Acknowledge
                      </Button>
                    )}
                    {!['closed', 'dismissed'].includes(r.status) && (
                      <>
                        {!r.investigation_id && (
                          <Button
                            data-rbac="market_conduct.initiate_investigation"
                            size="sm"
                            variant="ghost"
                            className="ml-1"
                            onClick={() => setPromote(r)}
                          >
                            <ArrowUpRight className="mr-1 h-3 w-3" />Promote
                          </Button>
                        )}
                        <Button
                          data-rbac="market_conduct.edit"
                          size="sm"
                          variant="ghost"
                          className="ml-1"
                          onClick={() => setDispose(r)}
                        >
                          Dispose
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent></Card>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{total} alert(s) · page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {dispose ? <DisposeDialog alert={dispose} onClose={() => setDispose(null)} /> : null}
      {promote ? <PromoteDialog alert={promote} onClose={() => setPromote(null)} /> : null}
    </DashboardLayout>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'destructive' }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone === 'destructive' && value > 0 ? 'text-destructive' : ''}`}>{value}</p>
    </CardContent></Card>
  );
}

function DisposeDialog({ alert, onClose }: { alert: AlertRow; onClose: () => void }) {
  const dispose = useAlertDispose();
  const [disposition, setDisposition] = useState<'DISMISS' | 'LINK_TO_EXISTING_COMPLAINT' | 'LINK_TO_EXISTING_INVESTIGATION'>('DISMISS');
  const [reason, setReason] = useState('');
  const [targetId, setTargetId] = useState('');

  const needsTarget = disposition !== 'DISMISS';
  const submit = async () => {
    try {
      await dispose.mutateAsync({ alertId: alert.id, disposition, reason, targetId: needsTarget ? targetId : null });
      toast.success('Disposition recorded');
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Disposition rejected');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disposition alert {alert.reference}</DialogTitle>
          <DialogDescription>
            The disposition and its rationale are recorded against the alert and audited. Nothing is closed silently.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Disposition</Label>
            <Select value={disposition} onValueChange={(v) => setDisposition(v as typeof disposition)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DISMISS">Dismiss — no regulatory concern</SelectItem>
                <SelectItem value="LINK_TO_EXISTING_COMPLAINT">Link to an existing complaint</SelectItem>
                <SelectItem value="LINK_TO_EXISTING_INVESTIGATION">Link to an existing investigation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsTarget && (
            <div>
              <Label className="text-xs">
                {disposition === 'LINK_TO_EXISTING_COMPLAINT' ? 'Complaint id' : 'Investigation id'} *
              </Label>
              <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="UUID of the existing case" />
            </div>
          )}
          <div>
            <Label className="text-xs">Rationale * (min 10 characters)</Label>
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-rbac="market_conduct.edit"
            disabled={dispose.isPending || reason.trim().length < 10 || (needsTarget && !targetId.trim())}
            onClick={submit}
          >
            {dispose.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Record disposition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromoteDialog({ alert, onClose }: { alert: AlertRow; onClose: () => void }) {
  const promote = useAlertPromote();
  const [rationale, setRationale] = useState('');
  const [allegation, setAllegation] = useState(alert.title ?? '');
  const [dueDate, setDueDate] = useState('');

  const submit = async () => {
    try {
      const res = await promote.mutateAsync({ alertId: alert.id, rationale, allegation, dueDate }) as { code?: string };
      toast.success(`Investigation ${res?.code ?? ''} opened from this alert`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Promotion rejected');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote alert {alert.reference} to an investigation</DialogTitle>
          <DialogDescription>
            The new investigation carries this alert's exact lineage — signal source, rule and version, observation
            window, threshold and explanation — so the reason it exists remains provable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Allegation / scope summary</Label>
            <Input value={allegation} onChange={(e) => setAllegation(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Target completion date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Promotion rationale * (min 20 characters)</Label>
            <Textarea rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-rbac="market_conduct.initiate_investigation"
            disabled={promote.isPending || rationale.trim().length < 20}
            onClick={submit}
          >
            {promote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Open investigation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
