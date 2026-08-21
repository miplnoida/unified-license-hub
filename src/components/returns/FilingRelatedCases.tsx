/**
 * EPR-01 — Related Cases for the canonical return filing workspace.
 *
 * Shows only genuinely linked regulatory records (server function
 * `returns_filing_related_cases`, joined on canonical filing/version ids).
 * No relationship is inferred or invented to populate the surface.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { useFilingRelatedCases } from '@/hooks/useWaveC';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';
import { Loader2 } from 'lucide-react';

export function FilingRelatedCases({ filingId }: { filingId: string }) {
  const { data, isLoading, error } = useFilingRelatedCases(filingId);

  if (isLoading) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading related regulatory records…
      </CardContent></Card>
    );
  }
  if (error || !data) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        Related regulatory records could not be loaded.
      </CardContent></Card>
    );
  }

  const total = data.breaches.length + data.ewi_alerts.length + data.assessments.length
    + data.actions.length + data.enforcement.length;

  if (total === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        No other regulatory record is linked to this filing.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.breaches.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Prudential threshold breaches ({data.breaches.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Metric</TableHead><TableHead>Level</TableHead>
                <TableHead className="text-right">Value</TableHead><TableHead className="text-right">Threshold</TableHead>
                <TableHead>Detected</TableHead><TableHead>Acknowledged</TableHead><TableHead>Version</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.breaches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.metric_key ?? '—'}</TableCell>
                    <TableCell><StatusBadge code={b.risk_level ?? b.level} tone={b.level === 'BREACH' ? 'critical' : 'warning'} /></TableCell>
                    <TableCell className="text-right font-mono">{b.value ?? 'Not available'}</TableCell>
                    <TableCell className="text-right font-mono">{b.threshold_value ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(b.detected_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{b.acknowledged_at ? formatDateTime(b.acknowledged_at) : 'Outstanding'}</TableCell>
                    <TableCell className="font-mono text-xs">{b.return_filing_version_id ? `${b.return_filing_version_id.slice(0, 8)}…` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.actions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Supervisory actions ({data.actions.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Reference</TableHead><TableHead>Action</TableHead><TableHead>Status</TableHead>
                <TableHead>Severity</TableHead><TableHead>Due</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.actions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.action_reference ?? '—'}</TableCell>
                    <TableCell>{a.title ?? a.action_type ?? '—'}</TableCell>
                    <TableCell><StatusBadge code={a.status} /></TableCell>
                    <TableCell><StatusBadge code={a.severity} /></TableCell>
                    <TableCell className="whitespace-nowrap">{a.due_date ? formatDateOnly(a.due_date) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.assessments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Prudential assessments ({data.assessments.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.assessments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <Link className="text-primary underline" to={objectRoute.prudentialAssessment(a.id)}>
                  Open assessment
                </Link>
                <StatusBadge code={a.status} />
                <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.ewi_alerts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Early-warning alerts ({data.ewi_alerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.ewi_alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-xs">{a.id.slice(0, 8)}…</span>
                <StatusBadge code={a.severity} />
                <StatusBadge code={a.status} />
                <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.enforcement.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Escalated enforcement ({data.enforcement.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.enforcement.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <Link className="text-primary underline" to={objectRoute.enforcement(e.id)}>Open enforcement case</Link>
                <span className="text-muted-foreground">{formatDateTime(e.escalated_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
