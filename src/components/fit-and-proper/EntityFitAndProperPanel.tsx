/**
 * EPR-04 M2 — Entity 360 fit & proper position.
 *
 * Read-only. Served by `fp_entity_fp_summary()`, which permission-checks the
 * caller against the entity. This panel never operates a case: every drill-down
 * opens the canonical assessment case workspace at `/fpa/assessments/:id`, and
 * people open the person master at `/fpa/individuals/:id`.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { formatDateOnly } from '@/lib/datetime';

interface FpEntitySummary {
  entity_id: string;
  counts: {
    current_appointments: number;
    open_assessments: number;
    reassessments_due: number;
    open_conditions: number;
  };
  appointments: Array<{
    role_id: string;
    individual_id: string;
    person_name: string;
    role_type: string;
    effective_from: string | null;
    reassessment_cycle_months: number | null;
    next_reassessment_due: string | null;
  }>;
  assessments: Array<{
    assessment_id: string;
    reference: string;
    individual_id: string;
    person_name: string;
    assessment_type: string;
    status: string;
    created_at: string;
    outcome: string | null;
  }>;
}

export function useEntityFitAndProperSummary(entityId: string | undefined) {
  return useQuery({
    queryKey: ['fp_entity_fp_summary', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('fp_entity_fp_summary', {
        _entity_id: entityId,
      });
      if (error) throw new Error(error.message);
      return data as FpEntitySummary;
    },
  });
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone === 'danger' && value > 0 ? 'text-destructive' : ''}`}>
        {value}
      </div>
    </div>
  );
}

export function EntityFitAndProperPanel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = useEntityFitAndProperSummary(entityId);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (error) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-destructive">{(error as Error).message}</CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const c = data.counts;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" /> Fit &amp; proper position
          </span>
          <Link
            to={`/fpa/processes?entity=${entityId}`}
            className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
          >
            Open in F&amp;P work queue <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Current appointments" value={c.current_appointments} />
          <Stat label="Open assessments" value={c.open_assessments} />
          <Stat label="Reassessments due" value={c.reassessments_due} tone="danger" />
          <Stat label="Open conditions" value={c.open_conditions} tone="danger" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Approved persons in current appointments
          </p>
          {data.appointments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No current fit &amp; proper appointments recorded for this entity.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Since</TableHead>
                    <TableHead>Reassessment due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.appointments.map((a) => (
                    <TableRow key={a.role_id}>
                      <TableCell>
                        <Link
                          to={`/fpa/individuals/${a.individual_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {a.person_name}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{a.role_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {a.effective_from ? formatDateOnly(a.effective_from) : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {a.next_reassessment_due ? formatDateOnly(a.next_reassessment_due) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assessment cases
          </p>
          {data.assessments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No fit &amp; proper assessment cases recorded against this entity.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.assessments.map((a) => (
                    <TableRow key={a.assessment_id}>
                      <TableCell>
                        <Link
                          to={`/fpa/assessments/${a.assessment_id}`}
                          className="font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {a.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{a.person_name}</TableCell>
                      <TableCell className="capitalize">{a.assessment_type?.replace(/_/g, ' ')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {a.status?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">
                        {a.outcome ? a.outcome.replace(/_/g, ' ') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
