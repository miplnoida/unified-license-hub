/**
 * Read-only view of the platform's applicability and materiality decision for
 * each risk factor. Nothing here is evaluated in the browser.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAssessmentFactorAuthority } from '@/hooks/useAssessmentFactorAuthority';

const LABEL: Record<string, string> = {
  APPLICABLE: 'Applicable',
  NOT_APPLICABLE: 'Not applicable',
  PENDING_INFORMATION: 'Information pending',
  MATERIAL: 'Material',
  NOT_MATERIAL: 'Not material',
  NOT_ASSESSED: 'No materiality rule',
  NOT_EVALUATED: 'Not evaluated',
  INCLUDED: 'Included in rating',
  EXCLUDED_NOT_MATERIAL: 'Excluded — not material',
  GOVERNED: 'Governed',
  NOT_GOVERNED: 'Not governed',
};
const label = (s?: string | null) => (s ? LABEL[s] ?? s.replace(/_/g, ' ').toLowerCase() : '—');
const tone = (s?: string | null): 'default' | 'secondary' | 'destructive' | 'outline' =>
  s === 'PENDING_INFORMATION' ? 'destructive' : s === 'INCLUDED' || s === 'MATERIAL' || s === 'APPLICABLE' ? 'default' : 'secondary';

export function AmlFactorAuthorityPanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, error } = useAssessmentFactorAuthority(assessmentId);

  return (
    <Card data-testid="aml-factor-authority">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Risk-factor applicability and materiality</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading platform decision…</p>}
        {error && <p className="text-sm text-destructive">The platform decision could not be loaded: {(error as Error).message}</p>}
        {data && (
          <>
            <p className="text-sm text-muted-foreground">
              Decided by the platform from calculation settings
              {data.pinned_calculation_config_version ? ` v${data.pinned_calculation_config_version}` : ''} pinned to this
              assessment ({data.methodology_code ?? 'methodology'} v{data.methodology_version ?? '—'}). Later versions do not
              change it.
            </p>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span>Status:</span>
              <Badge variant={data.evaluation?.status === 'GOVERNED' ? 'default' : 'secondary'}>{label(data.evaluation?.status)}</Badge>
              {(data.evaluation?.pending_count ?? 0) > 0 && (
                <Badge variant="destructive">{data.evaluation.pending_count} factor(s) waiting for information</Badge>
              )}
            </div>
            {data.evaluation?.reason && <p className="text-sm text-muted-foreground">{data.evaluation.reason}</p>}
            {(data.evaluation?.factors?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factor</TableHead>
                      <TableHead>Applicability</TableHead>
                      <TableHead>Materiality</TableHead>
                      <TableHead>Effect on rating</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.evaluation.factors!.map((f) => (
                      <TableRow key={f.dimension_code} data-factor={f.dimension_code} data-outcome={f.outcome}>
                        <TableCell className="font-mono text-xs">{f.dimension_code}</TableCell>
                        <TableCell><Badge variant={tone(f.applicability_status)}>{label(f.applicability_status)}</Badge></TableCell>
                        <TableCell><Badge variant={tone(f.materiality_status)}>{label(f.materiality_status)}</Badge></TableCell>
                        <TableCell><Badge variant={tone(f.outcome)}>{label(f.outcome)}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md">
                          {[f.applicability_reason, f.materiality_reason].filter(Boolean).join(' · ') || '—'}
                          {f.missing_facts && f.missing_facts.length > 0 && (
                            <div className="text-destructive">Missing: {f.missing_facts.join(', ')}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {data.latest_run && (
              <p className="text-xs text-muted-foreground">
                Latest calculation #{data.latest_run.run_seq}: {data.latest_run.status}
                {data.latest_run.reason_code ? ` (${data.latest_run.reason_code})` : ''}, engine {data.latest_run.engine_version ?? '—'}
                {data.latest_run.matches_current_evaluation === false ? ' — facts changed since; recalculate.' : ''}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AmlFactorAuthorityPanel;
