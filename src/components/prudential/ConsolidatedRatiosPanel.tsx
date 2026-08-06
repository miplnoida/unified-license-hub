import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatRatioValue, formatAmount, type ConsolidatedRatio } from '@/lib/groupConsolidation';

/** Consolidated ratio roll-up with gross, eliminated and net columns. */
export function ConsolidatedRatiosPanel({ ratios }: { ratios: ConsolidatedRatio[] }) {
  if (!ratios?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No consolidated figures for this period. Recompute after member returns are validated.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Contributors</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Eliminated</TableHead>
            <TableHead className="text-right">Consolidated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ratios.map((r) => (
            <TableRow key={r.ratio_key}>
              <TableCell className="font-medium">{r.label || r.ratio_key}</TableCell>
              <TableCell><Badge variant="outline" className="text-[11px]">{r.method}</Badge></TableCell>
              <TableCell className="text-right font-mono text-xs">{r.contributors}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatRatioValue(r.gross_value, r.display_format)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatAmount(r.eliminated)}</TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold">{formatRatioValue(r.value, r.display_format)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
