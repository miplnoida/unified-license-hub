/**
 * P08.12–P08.16 — Remediation register.
 *
 * Remediation requirements are supervisory obligations, not a to-do list: the
 * register is served, filtered, paged and counted by
 * `conduct_action_register` / `conduct_action_register_counts`, and nothing on
 * this screen writes to the store. Progression happens inside the case
 * workspace through `conduct_action_step`.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { IssueActionDialog } from '@/components/conduct/IssueActionDialog';
import { useRemediationCounts, useRemediationRegister } from '@/hooks/useConductRegisters';
import { formatDateOnly as formatDate } from '@/lib/datetime';

const SOURCE_TYPES = ['complaint', 'conduct_investigation', 'conduct_finding', 'thematic_review', 'monitoring', 'enforcement', 'entity', 'product', 'other'];
const STATUSES = ['open', 'in_progress', 'under_review', 'returned', 'escalated', 'completed', 'waived', 'cancelled'];
const PAGE_SIZE = 25;

const SLA_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  breached: 'destructive', due_soon: 'secondary', on_track: 'outline', paused: 'outline',
};

export default function ConductActions() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [issueOpen, setIssueOpen] = useState(false);

  const filters = useMemo(() => ({
    statuses: status === 'all' ? null : [status],
    sourceTypes: source === 'all' ? null : [source],
    overdueOnly,
    search: search.trim() || null,
    includeClosed: status !== 'all' ? true : false,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [status, source, overdueOnly, search, page]);

  const { data: rows = [], isLoading } = useRemediationRegister(filters);
  const { data: counts } = useRemediationCounts();
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Remediation Register"
          description="Supervisory remediation obligations arising from complaints, findings, investigations, thematic reviews, monitoring and enforcement. Evidence must be submitted and reviewed before a requirement can be satisfied."
          actions={
            <Button data-rbac="market_conduct.issue_enforcement_action" onClick={() => setIssueOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Issue requirement
            </Button>
          }
        />
        <IssueActionDialog open={issueOpen} onOpenChange={setIssueOpen} defaultSourceModule="other" onCreated={() => setPage(0)} />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Kpi label="Open" value={Number(counts?.total_open ?? 0)} />
          <Kpi label="Overdue" value={Number(counts?.overdue ?? 0)} tone="destructive" />
          <Kpi label="Evidence outstanding" value={Number(counts?.evidence_outstanding ?? 0)} />
          <Kpi label="Under review" value={Number(counts?.under_review ?? 0)} />
          <Kpi label="Escalated" value={Number(counts?.escalated ?? 0)} tone="destructive" />
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search reference, title, description or entity"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Open statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={overdueOnly ? 'default' : 'outline'} onClick={() => { setOverdueOnly((v) => !v); setPage(0); }}>
            Overdue only
          </Button>
        </div>

        <Card><CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No remediation requirements match.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Next action</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/conduct/actions/${r.id}`)}
                >
                  <TableCell className="font-mono text-xs">{r.action_reference}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    {r.action_type ? <div className="text-xs text-muted-foreground">{r.action_type}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">{r.entity_name ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {r.source_href ? (
                      <Link to={r.source_href} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.source_reference || (r.source_type ?? '').replace(/_/g, ' ')}
                      </Link>
                    ) : (
                      <Badge variant="outline" className="text-xs">{(r.source_type ?? 'other').replace(/_/g, ' ')}</Badge>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{r.stage_label}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r.evidence_status === 'outstanding' ? 'secondary' : 'outline'} className="capitalize">
                      {r.evidence_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.assigned_to_name ?? 'Unassigned'}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={SLA_VARIANT[r.sla_state] ?? 'outline'}>
                      {r.due_date ? formatDate(r.due_date) : 'No date'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.next_action_label ?? '—'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent></Card>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{total} requirement(s) · page {page + 1} of {pages}</span>
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
