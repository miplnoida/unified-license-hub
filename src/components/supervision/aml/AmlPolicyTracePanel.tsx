/**
 * PCOMP-R2E — integrated policy trace (read-only).
 *
 * Renders exactly what `supervisory_assessment_policy_trace` returns: the pinned
 * policy package, each governed runtime stage with the exact policy version it
 * used, and the rating chain from calculation to the operative risk-of-record.
 * No status, version, rating or eligibility is derived in the browser, and the
 * panel offers no write of any kind.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Route } from 'lucide-react';
import {
  useAmlPolicyTrace,
  TRACE_STAGE_LABEL,
  TRACE_STATUS_LABEL,
  type PolicyTraceLink,
} from '@/hooks/useAmlPolicyTrace';
import { AMBER, EMERALD, NEUTRAL, fmtDate } from '@/lib/amlLabels';

const statusTone = (s: string) =>
  s === 'EVALUATED' ? EMERALD : s === 'UNAVAILABLE' ? AMBER : NEUTRAL;

const Field = ({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm" data-testid={testId}>{value ?? '—'}</div>
  </div>
);

export function AmlPolicyTracePanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, error } = useAmlPolicyTrace(assessmentId);

  const shell = (badge: React.ReactNode, body: React.ReactNode) => (
    <Card data-testid="policy-trace-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Policy trail</CardTitle>
          {badge}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );

  if (isLoading) return shell(null, <Skeleton className="h-24 w-full" />);

  if (error || !data) {
    return shell(
      <Badge variant="outline" className={AMBER} data-testid="policy-trace-status">
        POLICY TRAIL UNAVAILABLE
      </Badge>,
      <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="policy-trace-error">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        The policy trail of this assessment could not be read. Nothing is shown rather than an assumed
        configuration{error ? `: ${(error as Error).message}` : '.'}
      </p>,
    );
  }

  const links: PolicyTraceLink[] = Array.isArray(data.links) ? data.links : [];
  const governed = links.filter((l) => l.status === 'EVALUATED').length;

  return shell(
    <Badge variant="outline" className={EMERALD} data-testid="policy-trace-status">
      {governed} OF {links.length} STAGES GOVERNED
    </Badge>,
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="policy-trace-authority">
        <Route className="mt-0.5 h-4 w-4 shrink-0" />
        {data.authority}
      </p>

      <Table data-testid="policy-trace-links">
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Policy</TableHead>
            <TableHead>Version used</TableHead>
            <TableHead>What the server found</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.map((l) => (
            <TableRow key={l.stage}>
              <TableCell className="text-sm">{TRACE_STAGE_LABEL[l.stage] ?? l.stage}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={statusTone(l.status)}
                  data-testid={`policy-trace-state-${l.stage}`}
                >
                  {TRACE_STATUS_LABEL[l.status] ?? l.status}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{l.policy_component_code ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs" data-testid={`policy-trace-version-${l.stage}`}>
                {l.policy_component_version ? `v${l.policy_component_version}` : '—'}
              </TableCell>
              <TableCell className="text-xs" data-testid={`policy-trace-measure-${l.stage}`}>
                {l.measure ?? l.reason ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Calculated rating" value={data.rating.calculated_rating ?? '—'} testId="policy-trace-calculated" />
        <Field label="Approved rating" value={data.rating.approved_rating ?? '—'} testId="policy-trace-approved" />
        <Field label="Published rating" value={data.rating.published_rating ?? '—'} testId="policy-trace-published" />
        <Field label="Rating of record" value={data.rating.operative_rating ?? '—'} testId="policy-trace-operative" />
        <Field label="Published on" value={fmtDate(data.rating.published_at)} />
        <Field
          label="Supervisory responses recorded"
          value={data.downstream.consequence_decisions}
          testId="policy-trace-consequences"
        />
        <Field
          label="Governed deadlines"
          value={data.downstream.sla_obligations}
          testId="policy-trace-obligations"
        />
        <Field
          label="Calculation fingerprint"
          value={
            data.rating.result_hash
              ? <span className="font-mono text-xs break-all">{data.rating.result_hash}</span>
              : '—'
          }
        />
      </div>
    </div>,
  );
}

export default AmlPolicyTracePanel;
