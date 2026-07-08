import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AssessmentType =
  | 'initial'
  | 'renewal'
  | 'change_of_role'
  | 'triggered'
  | 'ongoing_monitoring'
  | 'cycle'
  | 'material_change'
  | 'adverse_event';

type AssessmentStatus =
  | 'draft'
  | 'submitted'
  | 'screening'
  | 'awaiting_committee'
  | 'determined'
  | 'closed';

interface AssessmentRow {
  id: string;
  individual_id: string | null;
  assessment_type: AssessmentType;
  status: AssessmentStatus;
  submitted_at: string | null;
  determined_at: string | null;
  created_at: string;
  created_by: string | null;
  fp_individuals: { id: string; full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CLASS: Record<AssessmentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  screening: 'bg-amber-100 text-amber-800',
  awaiting_committee: 'bg-purple-100 text-purple-800',
  determined: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-700',
};

function formatType(t: string): string {
  if (!t) return '';
  return t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function trimUuid(uuid: string | null): string {
  if (!uuid) return '—';
  return uuid.slice(0, 8);
}

export function exportCsv(rows: AssessmentRow[]) {
  const headers = ['Individual', 'Type', 'Status', 'Created', 'Submitted', 'Determined'];
  const lines = rows.map(r =>
    [
      (r.fp_individuals as any)?.full_name ?? '',
      r.assessment_type,
      r.status,
      r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
      r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '',
      r.determined_at ? new Date(r.determined_at).toLocaleDateString() : '',
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'fp-initiation-log.csv';
  a.click();
}

const ASSESSMENT_TYPES: AssessmentType[] = [
  'initial',
  'renewal',
  'change_of_role',
  'triggered',
  'ongoing_monitoring',
  'cycle',
  'material_change',
  'adverse_event',
];

const STATUSES: AssessmentStatus[] = [
  'draft',
  'submitted',
  'screening',
  'awaiting_committee',
  'determined',
  'closed',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FpInitiationLog() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const { data: rawRows = [], isLoading } = useQuery<AssessmentRow[]>({
    queryKey: ['fp_initiation_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select(
          'id, individual_id, assessment_type, status, submitted_at, determined_at, created_at, created_by, fp_individuals(id, full_name)'
        )
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as AssessmentRow[];
    },
  });

  const filtered = useMemo(() => {
    return rawRows.filter(r => {
      if (typeFilter !== 'all' && r.assessment_type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (dateFrom) {
        const created = new Date(r.created_at);
        if (created < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const created = new Date(r.created_at);
        // include the full dateTo day
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (created > end) return false;
      }
      if (search.trim()) {
        const name = (r.fp_individuals?.full_name ?? '').toLowerCase();
        if (!name.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rawRows, typeFilter, statusFilter, dateFrom, dateTo, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="FP Initiation Log"
          description="Read-only log of all fit-and-proper assessments initiated across the register."
          backHref="/fit-and-proper"
          backLabel="Register"
          actions={
            <Button size="sm" variant="outline" onClick={() => exportCsv(filtered)}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          }
        />

        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Filter toolbar */}
            <div className="flex gap-3 flex-wrap items-end">
              {/* Assessment type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ASSESSMENT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>
                        {formatType(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUSES.map(s => (
                      <SelectItem key={s} value={s}>
                        {formatType(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date from */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  className="w-36"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                />
              </div>

              {/* Date to */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  className="w-36"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>

              {/* Individual search */}
              <div className="flex flex-col gap-1 flex-1 min-w-40">
                <label className="text-xs text-muted-foreground">Search individual</label>
                <Input
                  placeholder="Name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Reset */}
              {(typeFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo || search) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-end"
                  onClick={() => {
                    setTypeFilter('all');
                    setStatusFilter('all');
                    setDateFrom('');
                    setDateTo('');
                    setSearch('');
                  }}
                >
                  Reset
                </Button>
              )}
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
                Loading assessments…
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Showing {filtered.length} of {rawRows.length} assessments
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Individual</TableHead>
                        <TableHead>Assessment Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Initiated By</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Determined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No assessments match the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map(row => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              {row.fp_individuals ? (
                                <Link
                                  to={`/fit-and-proper/individuals/${row.fp_individuals.id}`}
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  {row.fp_individuals.full_name}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground italic">Unknown</span>
                              )}
                            </TableCell>
                            <TableCell>{formatType(row.assessment_type)}</TableCell>
                            <TableCell>
                              <Badge
                                className={`text-xs font-medium ${STATUS_CLASS[row.status] ?? 'bg-slate-100 text-slate-700'}`}
                                variant="outline"
                              >
                                {formatType(row.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {trimUuid(row.created_by)}
                            </TableCell>
                            <TableCell className="text-sm">{fmtDate(row.created_at)}</TableCell>
                            <TableCell className="text-sm">{fmtDate(row.submitted_at)}</TableCell>
                            <TableCell className="text-sm">{fmtDate(row.determined_at)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
