import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { useAmlExaminations } from '@/hooks/useAmlSupervision';
import { AMBER, EMERALD, RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

export default function AmlExaminations() {
  const { data, isLoading, error } = useAmlExaminations();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);

  const rows = (data ?? []) as any[];
  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.stage).filter(Boolean))), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (stage !== 'all' && r.stage !== stage) return false;
        if (openOnly && r.closed_at) return false;
        if (q) {
          const hay = `${r.entity_name ?? ''} ${r.reference ?? ''} ${r.title ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, stage, openOnly, q],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Examinations</h1>
          <p className="text-sm text-muted-foreground">
            Filtered view of the canonical examination model, scoped to the AML/CFT domain — engagement
            type, lifecycle stage, fieldwork window and lead examiner.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load examinations</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} examination${filtered.length === 1 ? '' : 's'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity, reference or title…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s as string} value={s as string}>
                      {titleCase(s as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant={openOnly ? 'default' : 'outline'} onClick={() => setOpenOnly((v) => !v)}>
                Open only
              </Button>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT examinations match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Engagement</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Risk focus</TableHead>
                      <TableHead>Fieldwork</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id} className={focus === r.id ? 'bg-muted/60' : undefined}>
                        <TableCell className="font-mono text-xs">
                          {r.reference || '—'}
                          <div className="max-w-[14rem] truncate font-sans text-xs text-muted-foreground">{r.title}</div>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-sm">{r.entity_name || '—'}</TableCell>
                        <TableCell className="text-xs">
                          <div>{titleCase(r.engagement_type)}</div>
                          <div className="text-muted-foreground">{titleCase(r.examination_type)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusTone(r.stage)}>
                            {titleCase(r.stage)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ratingTone(r.risk_rating)}>
                            {titleCase(r.risk_rating)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fmtDate(r.fieldwork_start)} → {fmtDate(r.fieldwork_end)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={r.closed_at ? EMERALD : AMBER}>
                            {r.closed_at ? `Closed ${fmtDate(r.closed_at)}` : 'In progress'}
                          </Badge>
                          {r.reassessment_required ? (
                            <Badge variant="outline" className={`mt-1 block w-fit ${RED}`}>
                              Reassessment required
                            </Badge>
                          ) : null}
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
          Examination scoping, team assignment, stage transitions and closure are performed through the
          governed supervisory examination operations. Findings issued from an examination appear in{' '}
          <Link className="underline" to="/supervision/aml/findings">
            Findings &amp; Remediation
          </Link>
          .
        </p>
      </div>
    </DashboardLayout>
  );
}
