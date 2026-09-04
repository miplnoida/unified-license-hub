/**
 * Materiality parameters — definition register, deliberately read-only.
 *
 * A parameter definition existing is NOT the same as its policy value being
 * approved. There is no edit control here: setting a materiality value is a
 * regulator policy decision taken in the calculation-policy layer, not an
 * administration convenience.
 */
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupervisoryMethodologyParameters } from '@/hooks/useSupervisoryMethodologyAdmin';
import { CountTile, EmptyPanel, ErrorPanel, humanize } from '../labels';

export function ParametersTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologyParameters(methodologyId);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} />;
  if (!data || data.total_count === 0) {
    return <EmptyPanel title="No materiality parameter is defined for this version." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CountTile label="Parameters defined" value={data.total_count} />
        <CountTile label="Policy value not approved" value={data.unapproved_count} />
        <CountTile label="Values recorded" value={data.valued_count} />
      </div>
      <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
        Parameter definition exists; policy value is not approved.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Referenced by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.parameter_code}</TableCell>
                <TableCell className="text-sm">{p.label ?? '—'}</TableCell>
                <TableCell className="text-xs">{humanize(p.parameter_kind)} · {humanize(p.data_type)}</TableCell>
                <TableCell className="text-xs">{p.unit ?? '—'}</TableCell>
                <TableCell><Badge variant="outline">{humanize(p.approval_status)}</Badge></TableCell>
                <TableCell className="font-mono text-xs">
                  {p.has_value ? (p.value_numeric ?? p.value_text) : <span className="text-muted-foreground">Not set</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {p.referenced_by_count === 0 ? <span className="text-muted-foreground">Not referenced</span>
                    : <span className="font-mono">{p.referenced_by.join(', ')}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
