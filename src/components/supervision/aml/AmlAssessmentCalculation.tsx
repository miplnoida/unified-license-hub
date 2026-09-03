import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { AlertTriangle, Calculator } from 'lucide-react';
import { useCan } from '@/hooks/useCan';
import {
  calcErrorMessage,
  calculationStatusLabel,
  useAssessmentCalculation,
  useCalculateAssessment,
} from '@/hooks/useSupervisoryCalculationConfig';

/**
 * Methodology calculation for one AML/CFT assessment.
 *
 * The panel is strictly a reader of the server's persisted outcome: it displays
 * the recorded status, the configuration version used, the resolved as-of date
 * and the trace. No score, band or rating is derived in the browser, and where
 * the server records a non-calculable status the panel says so rather than
 * showing a value.
 */
export function AmlAssessmentCalculation({ assessmentId }: { assessmentId: string }) {
  const { data: calc, isLoading } = useAssessmentCalculation(assessmentId);
  const calculate = useCalculateAssessment();
  const mayCalculate = useCan('aml_supervision', 'edit');
  const [showTrace, setShowTrace] = useState(false);

  const run = async () => {
    try {
      await calculate.mutateAsync(assessmentId);
      toast.success('The server recalculated this assessment.');
    } catch (e) {
      toast.error(calcErrorMessage(e));
    }
  };

  const value = (v: string | null | undefined) => v ?? '—';
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Methodology calculation</CardTitle>
          <CardDescription>
            Produced only by the governed server operation, from the approved calculation configuration in force
            on the date the domain's effective-date rule names.
          </CardDescription>
        </div>
        <Button data-rbac="aml_supervision.edit" onClick={run}
          disabled={calculate.isPending || !mayCalculate}>
          <Calculator className="h-4 w-4 mr-2" />Recalculate
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the recorded calculation…</p>
        ) : !calc ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Never calculated</AlertTitle>
            <AlertDescription>
              No calculation has been recorded for this assessment. Any rating shown elsewhere is a supervisory
              judgement, not a calculated recommendation.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={calc.status === 'CALCULATED' ? 'default' : 'outline'}>
                {calculationStatusLabel(calc.status)}
              </Badge>
              {calc.calculated_at && (
                <span className="text-xs text-muted-foreground">
                  recorded {new Date(calc.calculated_at).toLocaleString()}
                </span>
              )}
            </div>
            {calc.status !== 'CALCULATED' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No calculated recommendation</AlertTitle>
                <AlertDescription>
                  {calculationStatusLabel(calc.status)} — the server produced no rating, and none is substituted here.
                </AlertDescription>
              </Alert>
            )}
            <Table>
              <TableBody>
                <TableRow><TableCell className="w-64 text-muted-foreground">Methodology version</TableCell><TableCell>{value(calc.methodology_version)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Configuration version</TableCell><TableCell>{calc.config_version ?? '—'}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Resolved as-of date</TableCell><TableCell>{calc.as_of ? new Date(calc.as_of).toLocaleDateString() : '—'}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Inherent score / band</TableCell><TableCell>{num(calc.inherent_score)} / {value(calc.inherent_band)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Control score / band</TableCell><TableCell>{num(calc.control_score)} / {value(calc.control_band)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Residual rating (matrix)</TableCell><TableCell>{value(calc.residual_rating)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Recommended rating</TableCell><TableCell>{value(calc.recommended_rating)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Recommendation policy</TableCell><TableCell>{value(calc.recommendation_policy)}</TableCell></TableRow>
              </TableBody>
            </Table>
            {calc.trace && (
              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={() => setShowTrace((s) => !s)}>
                  {showTrace ? 'Hide calculation trace' : 'Show calculation trace'}
                </Button>
                {showTrace && (
                  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(calc.trace, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AmlAssessmentCalculation;
