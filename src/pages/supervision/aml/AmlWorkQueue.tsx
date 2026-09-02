import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useAmlWorkQueue } from '@/hooks/useAmlSupervision';
import {
  RED,
  WORK_QUEUE_KIND_LABEL,
  fmtDate,
  ratingTone,
  resolveAmlWorkItemHref,
  statusTone,
  titleCase,
} from '@/lib/amlLabels';

export default function AmlWorkQueue() {
  const { data, isLoading, error } = useAmlWorkQueue(300);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const rows = data ?? [];
  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (kind !== 'all' && r.kind !== kind) return false;
        if (overdueOnly && !(r.due_at && r.due_at < today)) return false;
        if (q) {
          const hay = `${r.title ?? ''} ${(r as any).entity_name ?? ''} ${r.kind}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, kind, overdueOnly, q, today],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Work Queue</h1>
          <p className="text-sm text-muted-foreground">
            Every AML/CFT item awaiting your action — assessments, plan and assessment approvals,
            examinations, findings, management responses, remediation and reassessment requirements.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load the work queue</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} item${filtered.length === 1 ? '' : 's'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity or item…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Work type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All work types</SelectItem>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {WORK_QUEUE_KIND_LABEL[k] ?? titleCase(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant={overdueOnly ? 'default' : 'outline'} onClick={() => setOverdueOnly((v) => !v)}>
                Overdue only
              </Button>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT work items match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const overdue = !!r.due_at && r.due_at < today;
                      return (
                        <TableRow key={`${r.kind}-${r.id}`}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {WORK_QUEUE_KIND_LABEL[r.kind] ?? titleCase(r.kind)}
                          </TableCell>
                          <TableCell className="max-w-[22rem] truncate text-sm font-medium">{r.title || '—'}</TableCell>
                          <TableCell className="text-sm">{(r as any).entity_name || '—'}</TableCell>
                          <TableCell>
                            {r.severity ? (
                              <Badge variant="outline" className={ratingTone(r.severity)}>
                                {titleCase(r.severity)}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            {r.status ? (
                              <Badge variant="outline" className={statusTone(r.status)}>
                                {titleCase(r.status)}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`font-mono text-xs ${overdue ? 'text-destructive font-semibold' : ''}`}>
                              {fmtDate(r.due_at)}
                            </span>
                            {overdue ? (
                              <Badge variant="outline" className={`ml-2 ${RED}`}>
                                Overdue
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="outline">
                              <Link to={resolveAmlWorkItemHref(r as any)}>Open</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
