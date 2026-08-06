import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { bandTone, camelsColumns, humanizeKey } from '@/lib/groupConsolidation';

export interface HeatmapRow {
  licensee_id: string;
  name: string;
  member_role?: string;
  risk_score?: number | null;
  risk_band?: string | null;
  open_breaches?: number;
  ratings?: Record<string, string | number> | null;
}

/** Subsidiary-level risk heatmap across CAMELS-style components. */
export function SubsidiaryRiskHeatmap({ rows }: { rows: HeatmapRow[] }) {
  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground">No member risk data available for this period.</p>;
  }
  const cols = camelsColumns(rows);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Member</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Band</TableHead>
            {cols.map((c) => <TableHead key={c} className="text-center whitespace-nowrap">{humanizeKey(c)}</TableHead>)}
            <TableHead className="text-right">Open breaches</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.licensee_id}>
              <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
              <TableCell className="text-right font-mono text-xs">{r.risk_score ?? '—'}</TableCell>
              <TableCell>
                {r.risk_band
                  ? <Badge variant="outline" className={cn('text-[11px]', bandTone(r.risk_band))}>{r.risk_band}</Badge>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </TableCell>
              {cols.map((c) => {
                const v = r.ratings?.[c];
                return (
                  <TableCell key={c} className={cn('text-center text-xs font-mono border', v != null ? bandTone(String(v)) : 'text-muted-foreground')}>
                    {v ?? '—'}
                  </TableCell>
                );
              })}
              <TableCell className="text-right font-mono text-xs">{r.open_breaches ?? 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
