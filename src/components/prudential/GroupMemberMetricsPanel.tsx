/**
 * EPR-01 / P07 — member-level canonical reported facts for a financial group.
 *
 * Every row is a metric value reported on a canonical return filing
 * (`return_metric_values` on the accepted/current version). Nothing is
 * recomputed in the browser and nothing is zero-filled: if a member has not
 * filed for the period, it simply has no rows. Each row links to the source
 * filing through the canonical object-route registry.
 */
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { returnStatusLabel } from '@/lib/prudentialLabels';

export interface GroupMemberMetric {
  licensee_id: string;
  name: string | null;
  filing_id: string | null;
  filing_reference: string | null;
  return_filing_version_id: string | null;
  reporting_period_id: string | null;
  period: string | null;
  period_end: string | null;
  filing_status: string | null;
  metric_code: string;
  metric_name: string | null;
  unit: string | null;
  value: number | null;
}

function formatValue(value: number | null, unit?: string | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const u = String(unit ?? '').trim();
  const num = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (u === '%' ) return `${num}%`;
  return u ? `${num} ${u}` : num;
}

export function GroupMemberMetricsPanel({ metrics, period }: {
  metrics: GroupMemberMetric[];
  period?: string | null;
}) {
  if (!metrics?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No member has a canonical return filing with reported metric values for
        {period ? ` ${period}` : ' this period'}. Consolidated figures cannot be derived until members file.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Reported value</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Source filing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((m, i) => (
            <TableRow key={`${m.licensee_id}-${m.metric_code}-${i}`}>
              <TableCell className="text-sm">{m.name ?? '—'}</TableCell>
              <TableCell className="text-sm font-medium">{m.metric_name || m.metric_code}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatValue(m.value, m.unit)}</TableCell>
              <TableCell className="font-mono text-xs">{m.period ?? '—'}</TableCell>
              <TableCell className="text-xs">
                {m.filing_id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Link className="text-primary underline" to={objectRoute.returnFiling(m.filing_id)}>
                      {m.filing_reference || m.filing_id.slice(0, 8)}
                    </Link>
                    <Badge variant="outline" className="text-[11px]">{returnStatusLabel(m.filing_status)}</Badge>
                  </span>
                ) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
