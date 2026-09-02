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
import { useAmlAssessments } from '@/hooks/useAmlSupervision';
import { EMERALD, NEUTRAL, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

export default function AmlAssessments() {
  const { data, isLoading, error } = useAmlAssessments();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const rows = (data ?? []) as any[];
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== 'all' && r.status !== status) return false;
        if (q) {
          const hay = `${r.entity_name ?? ''} ${r.reference ?? ''} ${r.assessment_type ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, status, q],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Risk Assessments</h1>
          <p className="text-sm text-muted-foreground">
            Canonical supervisory assessments scoped to the AML/CFT domain, with methodology version,
            rating outcome, maker–checker state and review period.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load assessments</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} assessment${filtered.length === 1 ? '' : 's'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity, reference or type…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s as string} value={s as string}>
                      {titleCase(s as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT assessments match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Type / trigger</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Methodology</TableHead>
                      <TableHead>Ratings</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          {r.reference || '—'}
                          {r.is_current ? (
                            <Badge variant="outline" className={`ml-2 ${EMERALD}`}>
                              Current
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-sm">{r.entity_name || '—'}</TableCell>
                        <TableCell className="text-xs">
                          <div>{titleCase(r.assessment_type)}</div>
                          <div className="text-muted-foreground">{titleCase(r.trigger_type)}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fmtDate(r.period_start)} → {fmtDate(r.period_end)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.methodology_version ? `v${r.methodology_version}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={ratingTone(r.residual_rating)}>
                            {titleCase(r.residual_rating)}
                          </Badge>
                          <div className="mt-1 text-muted-foreground">
                            I: {titleCase(r.inherent_rating)} · C: {titleCase(r.control_rating)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusTone(r.status)}>
                            {titleCase(r.status)}
                          </Badge>
                          {r.approved_at ? (
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {fmtDate(r.approved_at)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/supervision/aml/assessments/${r.id}`}>Open</Link>
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

        <p className="text-xs text-muted-foreground">
          Assessments are created, submitted, reviewed and approved through the governed supervisory
          operations; this register is read-only. <Badge variant="outline" className={NEUTRAL}>Domain: AML/CFT</Badge>
        </p>
      </div>
    </DashboardLayout>
  );
}
