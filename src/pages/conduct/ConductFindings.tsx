/**
 * P08.9–P08.11 — Conduct findings register.
 *
 * Findings are the canonical conduct conclusions store: every row keeps the
 * exact provenance of the investigation, complaint or alert it came from. The
 * register is served, filtered, paged and counted by `conduct_finding_register`.
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
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFindingCounts, useFindingRegister } from '@/hooks/useConductRegisters';
import { formatDate } from '@/lib/datetime';

const STATUSES = ['draft', 'under_analysis', 'awaiting_entity_response', 'response_received', 'confirmed', 'remediation_required', 'dismissed', 'closed'];
const SOURCES = ['conduct_investigation', 'complaint', 'conduct_alert', 'thematic_review', 'examination', 'other'];
const PAGE_SIZE = 25;

const SEV_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline', medium: 'secondary', high: 'default', critical: 'destructive',
};

export default function ConductFindings() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filters = useMemo(() => ({
    statuses: status === 'all' ? null : [status],
    sourceType: source === 'all' ? null : source,
    search: search.trim() || null,
    includeClosed: status !== 'all',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [status, source, search, page]);

  const { data: rows = [], isLoading } = useFindingRegister(filters);
  const { data: counts } = useFindingCounts();
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Conduct Findings"
          description="Canonical conduct conclusions. Each finding keeps its source provenance and drives remediation requirements or an enforcement referral — findings are raised from a case, never invented here."
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Kpi label="Open" value={Number(counts?.open ?? 0)} />
          <Kpi label="Under analysis" value={Number(counts?.under_analysis ?? 0)} />
          <Kpi label="Confirmed" value={Number(counts?.confirmed ?? 0)} />
          <Kpi label="Remediation required" value={Number(counts?.remediation_required ?? 0)} />
          <Kpi label="Dismissed" value={Number(counts?.dismissed ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search reference, title or entity"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Open statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card><CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No findings match.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remediation</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((f) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/conduct/findings/${f.id}`)}>
                  <TableCell className="font-mono text-xs">{f.finding_reference}</TableCell>
                  <TableCell>
                    <div className="font-medium">{f.title}</div>
                    {f.category ? <div className="text-xs text-muted-foreground">{f.category}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">{f.entity_name ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {f.source_href ? (
                      <Link to={f.source_href} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {(f.source_type ?? '').replace(/_/g, ' ')}
                      </Link>
                    ) : (f.source_type ?? '—').replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SEV_VARIANT[f.severity ?? 'low'] ?? 'outline'} className="capitalize">{f.severity}</Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{f.status.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {f.remediation_required ? `${f.open_remediation} open` : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{f.owner_name ?? 'Unassigned'}</TableCell>
                  <TableCell className="text-xs">{f.opened_at ? formatDate(f.opened_at) : '—'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent></Card>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{total} finding(s) · page {page + 1} of {pages}</span>
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
