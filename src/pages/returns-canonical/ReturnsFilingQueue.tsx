/**
 * RDM-ENTITY-001 Wave C — canonical returns filing queue (regulator view).
 * Reads `returns_filing_queue`, which is scoped by the caller's permissions.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFilingQueue, FILING_STATUS_LABELS, FREQUENCY_LABELS } from '@/hooks/useWaveC';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { AlertTriangle, CheckCircle, Clock, Eye, FileText, Loader2, Search } from 'lucide-react';

const TABS = ['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'ACCEPTED', 'REJECTED', 'DRAFT'] as const;

function statusClass(status: string) {
  switch (status) {
    case 'ACCEPTED': return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    case 'REJECTED': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'CORRECTION_REQUESTED': return 'bg-orange-500/10 text-orange-700 border-orange-200';
    case 'UNDER_REVIEW': return 'bg-primary/10 text-primary border-primary/20';
    case 'SUBMITTED': return 'bg-warning/10 text-warning border-warning/20';
    default: return '';
  }
}

export default function ReturnsFilingQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>('ALL');
  const [term, setTerm] = useState('');
  const { data: rows = [], isLoading } = useFilingQueue(tab === 'ALL' ? null : tab);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.filing_reference, r.entity_name, r.definition_code, r.definition_name, r.period_label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, term]);

  const overdue = rows.filter((r) => r.is_overdue).length;
  const blocking = rows.filter((r) => r.blocking_errors > 0).length;
  const requests = rows.filter((r) => r.open_requests > 0).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Returns Filing Queue"
          description="Canonical return filings across all supervised entities"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Filings in view" value={rows.length} icon={<FileText className="h-6 w-6" />} />
          <StatCard title="Overdue" value={overdue} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
          <StatCard title="Blocking validations" value={blocking} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Open requests" value={requests} icon={<CheckCircle className="h-6 w-6" />} variant="warning" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <TabsList className="flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t === 'ALL' ? 'All' : FILING_STATUS_LABELS[t] ?? t}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search reference, entity, return…" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
          </div>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Return</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ver.</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No filings found</TableCell></TableRow>
                    ) : filtered.map((r) => (
                      <TableRow key={r.filing_id} className="cursor-pointer" onClick={() => navigate(`/returns/filings/${r.filing_id}`)}>
                        <TableCell className="font-mono text-xs font-medium text-primary">{r.filing_reference}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.entity_name || '—'}</TableCell>
                        <TableCell>
                          <span className="font-medium">{r.definition_code}</span>
                          <span className="block text-xs text-muted-foreground">{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{r.period_label}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateOnly(r.due_date)}
                          {r.is_overdue && <Badge variant="outline" className="ml-2 border-destructive/20 bg-destructive/10 text-destructive">{r.days_late}d late</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusClass(r.status)}>{FILING_STATUS_LABELS[r.status] ?? r.status}</Badge>
                          {r.blocking_errors > 0 && <Badge variant="outline" className="ml-1 border-destructive/20 bg-destructive/10 text-destructive">{r.blocking_errors} errors</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">v{r.current_version_number}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(r.submitted_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/returns/filings/${r.filing_id}`); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
