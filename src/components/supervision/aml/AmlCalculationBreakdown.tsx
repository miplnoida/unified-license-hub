/**
 * AML-CLOSE-04 — reads the server's factor contribution breakdown and aggregation.
 * Every number is copied from the recorded calculation run; nothing is derived here.
 */
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Dim = Record<string, unknown>;
type Side = { numerator?: number; denominator?: number; unrounded?: number; score?: number; band?: string };

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const CONTRIBUTION: Record<string, string> = {
  INCLUDED: 'Included',
  EXCLUDED_FROM_DENOMINATOR: 'Excluded (not in denominator)',
  NOT_CALCULABLE_BLOCKS_RESULT: 'Not calculable — blocks result',
};

export function AmlCalculationBreakdown({ trace }: { trace: unknown }) {
  const t = (trace ?? {}) as { dimensions?: Dim[]; aggregation?: Record<string, unknown>; config_version?: unknown };
  const dims = Array.isArray(t.dimensions) ? t.dimensions : [];
  const agg = t.aggregation as
    | { inherent?: Side; control?: Side; residual?: Record<string, unknown>; rounding?: Record<string, unknown>;
        weight_treatment?: string }
    | undefined;
  if (!agg) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="calc-breakdown-legacy">
        This run was recorded by an earlier engine version that did not store a contribution breakdown. Recalculate to
        record one.
      </p>
    );
  }
  const sideRow = (label: string, s?: Side, id?: string) => (
    <TableRow data-testid={id}>
      <TableCell className="text-muted-foreground">{label}</TableCell>
      <TableCell className="font-mono text-xs">
        {show(s?.numerator)} ÷ {show(s?.denominator)} = {show(s?.unrounded)} → rounded {show(s?.score)} → band{' '}
        <strong>{show(s?.band)}</strong>
      </TableCell>
    </TableRow>
  );
  return (
    <div className="space-y-3" data-testid="calc-breakdown">
      <h4 className="text-sm font-semibold">Factor contributions (settings v{show(t.config_version)})</h4>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factor</TableHead><TableHead>Side</TableHead><TableHead>Contribution</TableHead>
              <TableHead>Raw score</TableHead><TableHead>Score</TableHead><TableHead>Weight</TableHead>
              <TableHead>Score × weight</TableHead><TableHead>Share</TableHead><TableHead>Band</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dims.map((d) => (
              <TableRow key={String(d.dimension_code)} data-testid={`calc-factor-${String(d.dimension_code)}`}
                data-contribution={String(d.contribution ?? '')}>
                <TableCell className="font-mono text-xs">{show(d.dimension_code)}</TableCell>
                <TableCell className="text-xs">{show(d.side)}</TableCell>
                <TableCell>
                  <Badge variant={d.contribution === 'INCLUDED' ? 'default' : d.contribution === 'NOT_CALCULABLE_BLOCKS_RESULT' ? 'destructive' : 'secondary'}>
                    {CONTRIBUTION[String(d.contribution)] ?? show(d.contribution)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{show(d.raw_score)}</TableCell>
                <TableCell className="font-mono text-xs">{show(d.score)}</TableCell>
                <TableCell className="font-mono text-xs">{show(d.weight)}</TableCell>
                <TableCell className="font-mono text-xs">{show(d.weighted_contribution)}</TableCell>
                <TableCell className="font-mono text-xs">{show(d.weight_share)}</TableCell>
                <TableCell className="font-mono text-xs">{show(d.band)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs">
                  {d.status === 'CALCULATED' ? '—' : show(d.reason ?? d.reason_code)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Table>
        <TableBody>
          {sideRow('Inherent risk', agg.inherent, 'calc-agg-inherent')}
          {sideRow('Control effectiveness', agg.control, 'calc-agg-control')}
          <TableRow data-testid="calc-agg-residual">
            <TableCell className="text-muted-foreground">Residual risk</TableCell>
            <TableCell className="font-mono text-xs">
              matrix(inherent {show(agg.residual?.inherent_band)}, control {show(agg.residual?.control_band)}) ={' '}
              <strong>{show(agg.residual?.residual_rating)}</strong>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Weights and rounding</TableCell>
            <TableCell className="text-xs">
              {show(agg.weight_treatment)} · rounding {show(agg.rounding?.mode)}/{show(agg.rounding?.decimals)} ·{' '}
              {show(agg.rounding?.band_comparison)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export default AmlCalculationBreakdown;
