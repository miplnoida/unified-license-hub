/**
 * AML/CFT work queue.
 *
 * The queue reads the single enterprise work model (`supervisory_work_queue`)
 * filtered to the AML/CFT domain, so an AML item, a prudential item and a
 * conduct item are the same kind of object with the same states, priorities and
 * due dates. Nothing is counted or prioritised in the browser: scope counts,
 * overdue/due-soon flags and the route to open each item all come from the read
 * model, so this queue can never disagree with the case file it points at.
 */
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
import {
  WORK_SCOPES,
  WORK_SCOPE_LABELS,
  useSupervisoryWorkQueue,
  type WorkScope,
} from '@/hooks/useSupervisoryWork';
import { RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

const SCOPE_LABELS: Record<WorkScope, string> = { ...WORK_SCOPE_LABELS, ALL: 'All AML/CFT work' };

export default function AmlWorkQueue() {
  const [scope, setScope] = useState<WorkScope>('MY_WORK');
  const [q, setQ] = useState('');
  const [workType, setWorkType] = useState('all');
  const { data, isLoading, error } = useSupervisoryWorkQueue({
    scope,
    domain: 'AML_CFT',
    workType: workType === 'all' ? null : workType,
    limit: 300,
  });

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};
  const workTypes = useMemo(
    () => Array.from(new Map(items.map((i) => [i.work_type, i.work_type_label])).entries()).sort(),
    [items],
  );

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (!q) return true;
        const hay = `${i.title ?? ''} ${i.entity_name ?? ''} ${i.reference ?? ''} ${i.work_type_label}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      }),
    [items, q],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Work Queue</h1>
          <p className="text-sm text-muted-foreground">
            Every AML/CFT item awaiting action, drawn from the enterprise supervisory work model — assessments,
            approvals, examinations, findings, management responses, remediation and reassessment requirements.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load the work queue</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {WORK_SCOPES.map((s) => (
            <Button key={s} size="sm" variant={scope === s ? 'default' : 'outline'} onClick={() => setScope(s)}>
              {SCOPE_LABELS[s]}
              {counts[s] != null ? (
                <span className="ml-1.5 font-mono text-xs opacity-80">{counts[s]}</span>
              ) : null}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} item${filtered.length === 1 ? '' : 's'} — ${SCOPE_LABELS[scope]}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity, reference or item…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={workType} onValueChange={setWorkType}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Work type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All work types</SelectItem>
                  {workTypes.map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label || titleCase(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT work items in this scope.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((i) => (
                      <TableRow key={i.work_key}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {i.work_type_label || titleCase(i.work_type)}
                          {i.decision_point ? (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Decision
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[22rem]">
                          <div className="truncate text-sm font-medium">{i.title || '—'}</div>
                          {i.reference ? (
                            <div className="font-mono text-[11px] text-muted-foreground">{i.reference}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{i.entity_name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ratingTone(i.priority)}>
                            {titleCase(i.priority)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusTone(i.work_state)}>
                            {titleCase(i.work_state)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {i.is_unassigned ? 'Unassigned' : i.assignment_note || 'Assigned'}
                        </TableCell>
                        <TableCell>
                          <span className={`font-mono text-xs ${i.is_overdue ? 'font-semibold text-destructive' : ''}`}>
                            {fmtDate(i.due_date)}
                          </span>
                          {i.is_overdue ? (
                            <Badge variant="outline" className={`ml-2 ${RED}`}>
                              Overdue
                            </Badge>
                          ) : i.is_due_soon ? (
                            <Badge variant="outline" className="ml-2">
                              Due soon
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to={i.route}>Open</Link>
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
