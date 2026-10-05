/**
 * Calculation / Risk Result surface for one AML/CFT assessment (AML-06).
 *
 * This panel is strictly a reader of the server's governed calculation record.
 * It displays the numbered immutable run the server produced — its policy and
 * methodology references, question and fact contributions, dimension results,
 * inherent risk, control effectiveness, the residual matrix outcome, materiality
 * treatment, the proposed result, the engine version, hashes and the full trace —
 * plus the run history and the override record. No score, weight, threshold,
 * band, matrix lookup, completeness figure, rounding or final rating is derived
 * in the browser, and the panel never publishes anything to the entity
 * risk-of-record.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Calculator, ShieldCheck } from 'lucide-react';
import { AmlCalculationBreakdown } from '@/components/supervision/aml/AmlCalculationBreakdown';
import { useCan } from '@/hooks/useCan';
import { calculationStatusLabel } from '@/hooks/useSupervisoryCalculationConfig';
import {
  OVERRIDE_STATUS_LABEL,
  calcPolicyErrorMessage,
  useAssessmentCalculationView,
  useDecideCalculationOverride,
  useMethodologyRatingVocabulary,
  useProposeCalculationOverride,
  useRecordCalculationRun,
  type CalculationRunDetail,
} from '@/hooks/useAmlCalculationPolicy';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Rows the server's trace publishes, rendered exactly as returned. */
function traceRows(run: CalculationRunDetail | null, key: string): Array<Record<string, unknown>> {
  const t = (run?.trace ?? {}) as Record<string, unknown>;
  const v = t[key];
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function ServerTable({
  caption, rows, columns,
}: { caption: string; rows: Array<Record<string, unknown>>; columns: string[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{caption}: the server's trace publishes no entries.</p>;
  }
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{caption}</h4>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((c) => <TableHead key={c}>{c.replace(/_/g, ' ')}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c} className="font-mono text-xs">
                    {typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : dash(r[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AmlAssessmentCalculation({ assessmentId }: { assessmentId: string }) {
  const { data: view, isLoading } = useAssessmentCalculationView(assessmentId);
  const record = useRecordCalculationRun();
  const propose = useProposeCalculationOverride();
  const decide = useDecideCalculationOverride();
  const mayCalculate = useCan('aml_supervision', 'edit');
  const mayDecide = useCan('aml_supervision', 'approve');
  const [showTrace, setShowTrace] = useState(false);
  const [proposedRating, setProposedRating] = useState('');
  const [rationale, setRationale] = useState('');
  const [note, setNote] = useState('');

  const run = view?.latest_run ?? null;
  const runs = view?.runs ?? [];
  const overrides = view?.overrides ?? [];
  const pending = overrides.find((o) => o.status === 'PROPOSED' || o.status === 'PENDING_APPROVAL') ?? null;
  const { data: ratings = [] } = useMethodologyRatingVocabulary(run?.methodology_id ?? null);

  const calculate = async () => {
    try {
      await record.mutateAsync({ assessmentId });
      toast.success('The server recorded a new numbered calculation run.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  const submitOverride = async () => {
    try {
      await propose.mutateAsync({ assessmentId, proposedRating, rationale });
      setProposedRating('');
      setRationale('');
      toast.success('Override proposed. It awaits an independent decision.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  const decideOverride = async (overrideId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await decide.mutateAsync({ overrideId, decision, note: note || undefined });
      setNote('');
      toast.success(decision === 'APPROVED' ? 'Override approved.' : 'Override rejected.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Calculation / risk result</CardTitle>
            <CardDescription>
              Produced only by the governed server operation, from the approved calculation policy in force on the
              date the domain's effective-date rule names. Nothing on this screen is calculated in the browser.
            </CardDescription>
          </div>
          <Button data-rbac="aml_supervision.edit" onClick={calculate}
            disabled={record.isPending || !mayCalculate}>
            <Calculator className="h-4 w-4 mr-2" />Recalculate
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading the recorded calculation…</p>
          ) : !run ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Never calculated</AlertTitle>
              <AlertDescription>
                No calculation run has been recorded for this assessment. Any rating shown elsewhere is a supervisory
                judgement, not a calculated recommendation.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={run.status === 'CALCULATED' ? 'default' : 'outline'}>
                  {calculationStatusLabel(run.status as never)}
                </Badge>
                <Badge variant="outline">Run #{run.run_seq}</Badge>
                {run.calculated_at && (
                  <span className="text-xs text-muted-foreground">
                    recorded {new Date(run.calculated_at).toLocaleString()}
                  </span>
                )}
              </div>

              {run.status !== 'CALCULATED' && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Not calculable — no result was invented</AlertTitle>
                  <AlertDescription>
                    The server refused to produce a rating. Reason code: <span className="font-mono">{dash(run.reason_code)}</span>
                    {run.reason ? ` — ${run.reason}` : ''}
                  </AlertDescription>
                </Alert>
              )}

              <Table>
                <TableBody>
                  <TableRow><TableCell className="w-72 text-muted-foreground">Methodology version</TableCell><TableCell>{dash(run.methodology_version)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Calculation policy version</TableCell><TableCell>{dash(run.config_version)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Programme / version</TableCell><TableCell>{dash(run.programme_id)} / {dash(run.programme_version)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Question plan version</TableCell><TableCell>{dash(run.question_plan_version)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Resolved as-of date</TableCell><TableCell>{run.as_of ? new Date(run.as_of).toLocaleDateString() : '—'}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Inherent risk (score / band)</TableCell><TableCell>{dash(run.inherent_score)} / {dash(run.inherent_band)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Control effectiveness (score / band)</TableCell><TableCell>{dash(run.control_score)} / {dash(run.control_band)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Residual rating (matrix)</TableCell><TableCell>{dash(run.residual_rating)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Proposed result</TableCell><TableCell>{dash(run.recommended_rating)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Engine version</TableCell><TableCell className="font-mono text-xs">{dash(run.engine_version)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Inputs hash</TableCell><TableCell className="font-mono text-xs break-all">{dash(run.inputs_hash)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Result hash</TableCell><TableCell className="font-mono text-xs break-all">{dash(run.result_hash)}</TableCell></TableRow>
                </TableBody>
              </Table>

              <AmlCalculationBreakdown trace={run.trace} />
              <ServerTable caption="Materiality treatment" rows={traceRows(run, 'materiality')}
                columns={['parameter_code', 'fact_code', 'value', 'outcome', 'reason_code', 'floored_to']} />

              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Entity risk-of-record: not published</AlertTitle>
                <AlertDescription>
                  A calculation run and any approved override are supervisory working results only. They are never
                  published to the entity risk-of-record by this screen or by the calculation itself.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={() => setShowTrace((s) => !s)}>
                  {showTrace ? 'Hide calculation trace' : 'Show calculation trace'}
                </Button>
                {showTrace && (
                  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify({ inputs: run.inputs, policy_snapshot: run.policy_snapshot, trace: run.trace }, null, 2)}
                  </pre>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run history</CardTitle>
            <CardDescription>Every run is numbered and immutable; a recalculation adds a run rather than rewriting one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead><TableHead>When</TableHead><TableHead>Status</TableHead>
                  <TableHead>Policy version</TableHead><TableHead>Proposed result</TableHead>
                  <TableHead>Reason</TableHead><TableHead>Result hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">#{r.run_seq}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.calculated_at ? new Date(r.calculated_at).toLocaleString() : '—'}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell>{dash(r.config_version)}</TableCell>
                    <TableCell>{dash(r.recommended_rating)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dash(r.reason_code ?? r.event_reason)}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[12rem]">{dash(r.result_hash)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supervisory override</CardTitle>
          <CardDescription>
            A supervisor may propose a different rating with a written rationale. The calculated values are preserved
            unchanged, and an override takes effect only when a different person decides it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No override has been proposed for this assessment.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proposed</TableHead><TableHead>Calculated</TableHead><TableHead>Status</TableHead>
                  <TableHead>Rationale</TableHead><TableHead>Decided</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.proposed_rating}</TableCell>
                    <TableCell className="font-mono text-xs">{dash(o.computed_recommended_rating ?? o.computed_residual_rating)}</TableCell>
                    <TableCell>{OVERRIDE_STATUS_LABEL[o.status] ?? o.status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md">{o.rationale}</TableCell>
                    <TableCell className="text-xs">{o.decided_at ? new Date(o.decided_at).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pending ? (
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="calc-override-note">Decision note (optional)</Label>
              <Input id="calc-override-note" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2">
                <Button data-rbac="aml_supervision.approve" onClick={() => decideOverride(pending.id, 'APPROVED')}
                  disabled={decide.isPending || !mayDecide}>Approve override</Button>
                <Button data-rbac="aml_supervision.approve" variant="outline"
                  onClick={() => decideOverride(pending.id, 'REJECTED')}
                  disabled={decide.isPending || !mayDecide}>Reject override</Button>
              </div>
            </div>
          ) : run && run.status === 'CALCULATED' ? (
            <div className="space-y-2 border-t pt-4">
              <Label>Proposed rating</Label>
              <Select value={proposedRating || 'none'} onValueChange={(v) => setProposedRating(v === 'none' ? '' : v)}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select a published rating" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a published rating</SelectItem>
                  {ratings.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Label htmlFor="calc-override-rationale">Supervisory rationale (at least 10 characters)</Label>
              <Textarea id="calc-override-rationale" rows={3} value={rationale}
                onChange={(e) => setRationale(e.target.value)} />
              <Button data-rbac="aml_supervision.edit" onClick={submitOverride}
                disabled={propose.isPending || !mayCalculate || !proposedRating || rationale.trim().length < 10}>
                Propose override
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default AmlAssessmentCalculation;
