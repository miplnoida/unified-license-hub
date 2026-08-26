/**
 * MC-05 — Signals Register.
 *
 * A signal is a supervisory intelligence item: something a supervisor believes
 * may indicate conduct risk. It is deliberately distinct from an alert (an
 * attention/threshold mechanism) and from a complaint (an individual consumer
 * case). The register is served, filtered, paged and counted by the governed
 * server read model — the browser never queries or writes the signal tables.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Radar, Search, Plus, AlertCircle } from 'lucide-react';
import { useSignalRegister, useCreateSignal, type SignalRow } from '@/hooks/useConductSignals';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { useSectors } from '@/hooks/useMasterConfig';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';
import {
  SEVERITY_LABEL, SEVERITY_VARIANT, SIGNAL_SOURCE_LABEL, SIGNAL_STATUS_LABEL,
  STATUS_VARIANT, SYSTEMIC_LABEL, ageInDays, humanise, label,
} from '@/lib/conductSignalLabels';

const PAGE_SIZE = 25;
const STATUSES = ['new', 'under_review', 'validated', 'escalated', 'dismissed', 'closed'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SOURCES = Object.keys(SIGNAL_SOURCE_LABEL);
const DISPOSED = ['escalated', 'dismissed', 'closed'];

export default function ConductSignals() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('all');
  const [source, setSource] = useState('all');
  const [sector, setSector] = useState('all');
  const [owner, setOwner] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);

  const canManage = useCan('market_conduct', 'manage_complaints')
    || useCan('market_conduct', 'run_conduct_analytics')
    || useCan('market_conduct', 'manage_monitoring_rules');

  const { data: staff = [] } = useInternalUsers();
  const { data: sectors = [] } = useSectors();

  const reset = () => setPage(0);

  const filters = useMemo(() => ({
    statuses: status === 'open' ? ['new', 'under_review', 'validated'] : status === 'all' ? null : [status],
    severities: severity === 'all' ? null : [severity],
    sourceTypes: source === 'all' ? null : [source],
    ownerId: owner === 'all' || owner === 'unassigned' ? null : owner,
    search: search.trim() || null,
    includeDisposed: status === 'all' || DISPOSED.includes(status),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [status, severity, source, owner, search, page]);

  const { data: rows = [], isLoading, isError, error, refetch } = useSignalRegister(filters);

  // Sector and "unassigned owner" are presentation refinements over the
  // governed page — the server read model owns paging and totals.
  const visible = useMemo(() => rows.filter((r) =>
    (sector === 'all' || r.sector_id === sector)
    && (owner !== 'unassigned' || !r.owner_id)), [rows, sector, owner]);

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Conduct Signals"
          description="Supervisory intelligence items raised from complaints, outcomes, observations, alerts or return data. A signal is assessed, validated, dismissed or escalated into an alert — it never replaces the consumer case or the alert it relates to."
          actions={canManage ? (
            <Button onClick={() => setRaiseOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Raise signal
            </Button>
          ) : (
            <Badge variant="outline">View only</Badge>
          )}
        />

        <div className="grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search reference, title or entity"
              value={search}
              onChange={(e) => { setSearch(e.target.value); reset(); }}
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open signals</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{SIGNAL_STATUS_LABEL[s]}</SelectItem>)}
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={(v) => { setSource(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCES.map((s) => <SelectItem key={s} value={s}>{SIGNAL_SOURCE_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={(v) => { setSector(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Sector" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((s: { id: string; name: string }) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => { setOwner(v); reset(); }}>
            <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any owner</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {staff.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || 'Officer'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card><CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              <p className="mt-2 text-sm">Loading signals…</p>
            </div>
          ) : isError ? (
            <div className="p-10 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
              <p className="mt-2 text-sm text-muted-foreground">
                {(error as Error)?.message || 'The signal register could not be loaded.'}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <Radar className="mx-auto h-6 w-6" />
              <p className="mt-2 text-sm">No signals match the current filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Entity / sector / product</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity &amp; risk</TableHead>
                  <TableHead>Systemic potential</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Age / last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <SignalRowView
                    key={row.id}
                    row={row}
                    sectorName={sectors.find((s: { id: string; name: string }) => s.id === row.sector_id)?.name}
                    onOpen={() => navigate(`/conduct/signals/${row.id}`)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>

        {!isLoading && !isError && visible.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{Number(total)} signal{Number(total) === 1 ? '' : 's'} in this view</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <RaiseSignalDialog open={raiseOpen} onOpenChange={setRaiseOpen} />
    </DashboardLayout>
  );
}

function SignalRowView({ row, sectorName, onOpen }: { row: SignalRow; sectorName?: string; onOpen: () => void }) {
  const age = ageInDays(row.created_at);
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-mono text-xs">{row.reference}</TableCell>
      <TableCell className="max-w-[260px]">
        <p className="truncate font-medium">{row.title}</p>
        {row.summary && <p className="truncate text-xs text-muted-foreground">{row.summary}</p>}
      </TableCell>
      <TableCell className="text-xs">
        <p>{row.entity_name || 'No entity recorded'}</p>
        <p className="text-muted-foreground">
          {[sectorName, row.product_name, row.channel_name].filter(Boolean).join(' · ') || 'Sector not recorded'}
        </p>
      </TableCell>
      <TableCell className="text-xs">{label(SIGNAL_SOURCE_LABEL, row.source_type)}</TableCell>
      <TableCell className="text-xs">{row.signal_category ? humanise(row.signal_category) : (row.risk_category_name || '—')}</TableCell>
      <TableCell>
        <Badge variant={SEVERITY_VARIANT[row.severity] ?? 'outline'}>{label(SEVERITY_LABEL, row.severity)}</Badge>
        {row.risk_score != null && <span className="ml-2 text-xs text-muted-foreground">Risk {Number(row.risk_score)}</span>}
      </TableCell>
      <TableCell className="text-xs">{label(SYSTEMIC_LABEL, row.systemic_potential)}</TableCell>
      <TableCell><Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{label(SIGNAL_STATUS_LABEL, row.status)}</Badge></TableCell>
      <TableCell className="text-xs">{row.owner_name || 'Unassigned'}</TableCell>
      <TableCell className="text-right text-xs">
        <p>{age === null ? '—' : `${age} day${age === 1 ? '' : 's'} old`}</p>
        <p className="text-muted-foreground">{row.last_activity_at ? formatDateTime(row.last_activity_at) : '—'}</p>
      </TableCell>
    </TableRow>
  );
}

function RaiseSignalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateSignal();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sourceType, setSourceType] = useState('supervisory_observation');
  const [severity, setSeverity] = useState('medium');
  const [rationale, setRationale] = useState('');

  const valid = title.trim().length >= 5 && rationale.trim().length >= 10;

  const submit = async () => {
    const res = await create.mutateAsync({
      title: title.trim(), summary: summary.trim() || null,
      source_type: sourceType, severity, rationale: rationale.trim(),
    }) as { id?: string };
    onOpenChange(false);
    setTitle(''); setSummary(''); setRationale('');
    if (res?.id) navigate(`/conduct/signals/${res.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a supervisory signal</DialogTitle>
          <DialogDescription>
            Record an intelligence item for supervisory assessment. Complaints and alerts are not converted
            automatically — link them to the signal once it is raised.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Signal title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What has been observed" />
          </div>
          <div>
            <Label>Summary (optional)</Label>
            <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Where it came from</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s} value={s}>{SIGNAL_SOURCE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Initial severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Supervisory rationale</Label>
            <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this warrants supervisory attention (at least 10 characters)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Raise signal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
