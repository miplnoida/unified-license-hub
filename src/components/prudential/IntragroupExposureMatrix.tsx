import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatAmount, type MatrixCell } from '@/lib/groupConsolidation';

interface Props {
  entities: Array<{ licensee_id: string; name: string }>;
  cells: MatrixCell[];
  total: number;
  largeThresholdPct?: number | null;
}

/** Intra-group exposure matrix: rows are obligors, columns are counterparties. */
export function IntragroupExposureMatrix({ entities, cells, total, largeThresholdPct }: Props) {
  const cellMap = new Map<string, MatrixCell>();
  cells.forEach((c) => cellMap.set(`${c.from_entity_id}|${c.to_entity_id}`, c));

  if (!entities.length) {
    return <p className="text-sm text-muted-foreground">Add group members to build the exposure matrix.</p>;
  }

  const rowTotal = (id: string) =>
    cells.filter((c) => c.from_entity_id === id).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const colTotal = (id: string) =>
    cells.filter((c) => c.to_entity_id === id).reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Total intra-group exposure: <span className="font-mono text-foreground">{formatAmount(total)}</span></span>
        {largeThresholdPct != null && (
          <span>Large-exposure flag at {Number(largeThresholdPct)}% of group total</span>
        )}
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[11px]">Large exposure</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Obligor \ Counterparty</TableHead>
              {entities.map((e) => (
                <TableHead key={e.licensee_id} className="text-right whitespace-nowrap">{e.name}</TableHead>
              ))}
              <TableHead className="text-right">Row total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.map((row) => (
              <TableRow key={row.licensee_id}>
                <TableCell className="font-medium whitespace-nowrap">{row.name}</TableCell>
                {entities.map((col) => {
                  const cell = cellMap.get(`${row.licensee_id}|${col.licensee_id}`);
                  const same = row.licensee_id === col.licensee_id;
                  return (
                    <TableCell
                      key={col.licensee_id}
                      className={cn(
                        'text-right font-mono text-xs',
                        same && 'bg-muted/50',
                        cell?.is_large && 'bg-destructive/10 text-destructive font-semibold',
                      )}
                      title={cell ? Object.entries(cell.types ?? {}).map(([k, v]) => `${k}: ${formatAmount(v as number)}`).join(', ') : undefined}
                    >
                      {same ? '—' : formatAmount(cell?.amount)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-mono text-xs font-semibold">{formatAmount(rowTotal(row.licensee_id))}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Column total</TableCell>
              {entities.map((col) => (
                <TableCell key={col.licensee_id} className="text-right font-mono text-xs font-semibold">
                  {formatAmount(colTotal(col.licensee_id))}
                </TableCell>
              ))}
              <TableCell className="text-right font-mono text-xs font-semibold">{formatAmount(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
