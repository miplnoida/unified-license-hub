import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';
import { fetchCanonicalEntityFilingHistory } from '@/lib/returns/canonicalReturnsSummary';
import { objectRoute } from '@/lib/routes/objectRoutes';

/**
 * EPR-01 — Entity 360 Returns tab.
 *
 * Reads the canonical returns spine (`return_filings` via
 * `returns_entity_filing_history`), not the retired `compliance_returns`
 * table. Each row links to the canonical filing workspace.
 */
export default function ReturnsTab({ entityId }: { entityId: string; licenseId?: string | null }) {
  const navigate = useNavigate();
  const { data: filings = [], isLoading } = useQuery({
    queryKey: ['entity_canonical_filing_history', entityId],
    queryFn: () => fetchCanonicalEntityFilingHistory(entityId),
    enabled: !!entityId,
    staleTime: 60_000,
  });

  const statusColor = (s: string | null) => {
    switch (s) {
      case 'ACCEPTED':
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'CORRECTION_REQUESTED':
        return 'bg-orange-500/10 text-orange-700 border-orange-200';
      case 'REJECTED':
      case 'WITHDRAWN':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5 text-primary" />
          Regulatory Return Filings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No return filings recorded for this entity.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Return</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Breaches</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filings.map((f) => (
                  <TableRow key={f.filing_id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {f.filing_reference ?? f.filing_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{f.definition_name ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {f.period_label ??
                        `${formatDateOnly(f.period_start)} – ${formatDateOnly(f.period_end)}`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateOnly(f.due_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(f.submitted_at)}</TableCell>
                    <TableCell className="font-mono text-xs">v{f.current_version_number ?? 1}</TableCell>
                    <TableCell className="font-mono text-xs">{f.breach_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(f.status)}>
                        {f.status_label ?? f.status ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(objectRoute.returnFiling(f.filing_id))}
                      >
                        <ExternalLink className="h-4 w-4" />
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
  );
}
