/**
 * PCOMP-R2D — Supervisory response deadlines.
 *
 * Shows the supervisor what the SLA policy pinned to the assessment's policy
 * basis requires: how long each supervisory response has, on which day basis,
 * whether its clock may be held, and which policy version and rule said so.
 * It then shows the live deadlines the platform SLA engine is running for the
 * consequences already recorded, including holds, overdue state, escalation and
 * whether the work closed on time or late.
 *
 * Every value is rendered exactly as the server returned it. The screen never
 * calculates a deadline, never decides on-time or late, and never executes a
 * supervisory action.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, Timer } from 'lucide-react';
import {
  SLA_BASIS_LABEL,
  SLA_CALENDAR_LABEL,
  SLA_OUTCOME_LABEL,
  SLA_REASON_LABEL,
  SLA_STATE_LABEL,
  useSupervisoryResponseSla,
  type SlaObligation,
} from '@/hooks/useAmlSlaPolicy';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

function fmt(ts?: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function stateVariant(state?: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'breached') return 'destructive';
  if (state === 'paused') return 'secondary';
  if (state === 'active') return 'default';
  return 'outline';
}

function outcomeVariant(outcome: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (outcome === 'LATE') return 'destructive';
  if (outcome === 'ON_TIME') return 'default';
  if (outcome === 'PENDING') return 'secondary';
  return 'outline';
}

function obligationDeadline(o: SlaObligation) {
  return o.stage?.due_at ?? o.due_at ?? null;
}

export function AmlResponseSlaPanel({
  entityId,
  assessmentId,
  domainCode = 'AML_CFT',
}: {
  entityId: string;
  assessmentId?: string | null;
  domainCode?: string;
}) {
  const { data: view, isLoading } = useSupervisoryResponseSla(entityId, domainCode, assessmentId ?? null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Supervisory response deadlines</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Reading the governing SLA policy…</CardContent>
      </Card>
    );
  }

  if (!view) {
    return (
      <Card>
        <CardHeader><CardTitle>Supervisory response deadlines</CardTitle></CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Deadline expectations unavailable</AlertTitle>
            <AlertDescription>
              The server did not return SLA policy expectations for this record.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const expectations = view.expectations ?? [];
  const governed = expectations.filter((x) => x.governed);
  const obligations = view.obligations ?? [];
  const ungoverned = expectations.find((x) => !x.governed);

  return (
    <Card data-testid="aml-response-sla-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-4 w-4" aria-hidden />
          Supervisory response deadlines
        </CardTitle>
        <CardDescription>
          {governed.length > 0
            ? SLA_BASIS_LABEL.EVALUATED
            : (SLA_BASIS_LABEL[ungoverned?.status ?? 'NOT_GOVERNED'] ?? 'NOT_GOVERNED')}
          {view.source_rating ? ` · current risk-of-record: ${view.source_rating}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {governed.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" aria-hidden />
            <AlertTitle>
              {SLA_BASIS_LABEL[ungoverned?.status ?? 'NOT_GOVERNED'] ?? 'NOT_GOVERNED'}
            </AlertTitle>
            <AlertDescription>
              {ungoverned?.reason
                ?? SLA_REASON_LABEL[ungoverned?.reason_code ?? '']
                ?? 'The server gave no further reason.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2" data-testid="sla-policy-provenance">
              <div>
                <span className="text-muted-foreground">SLA policy</span>
                <div className="font-mono">
                  {dash(governed[0].policy?.code)} v{dash(governed[0].policy?.component_version)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Policy profile</span>
                <div className="font-mono">
                  {dash(governed[0].policy_profile?.code)} v{dash(governed[0].policy_profile?.version)}
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supervisory response</TableHead>
                  <TableHead>Time allowed</TableHead>
                  <TableHead>Hold permitted</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>If missed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {governed.map((x) => (
                  <TableRow key={x.action}>
                    <TableCell>
                      {dash(x.label ?? x.action)}
                      {x.stage ? (
                        <div className="text-xs text-muted-foreground">{x.stage}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {x.duration_days === null
                        ? '—'
                        : `${x.duration_days} ${SLA_CALENDAR_LABEL[x.calendar_mode ?? ''] ?? 'days'}`}
                      {x.warning_percentage !== null ? (
                        <div className="text-xs text-muted-foreground">
                          warning at {x.warning_percentage}%
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {x.pause_permitted ? (
                        <>
                          <Badge variant="secondary">Permitted</Badge>
                          {x.pause_reasons?.length ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {x.pause_reasons.join(', ')}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <Badge variant="outline">Not permitted</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{dash(x.rule_code)}</TableCell>
                    <TableCell>
                      <Badge variant={x.breach_severity === 'CRITICAL' ? 'destructive' : 'outline'}>
                        {dash(x.breach_severity)}
                      </Badge>
                      {x.policy_note ? (
                        <div className="mt-1 text-xs text-muted-foreground">{x.policy_note}</div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {obligations.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Deadlines running against recorded consequences</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consequence</TableHead>
                  <TableHead>Policy basis</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Clock</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obligations.map((o) => (
                  <TableRow key={o.obligation_id}>
                    <TableCell>
                      {o.action_type}
                      {o.stage_name ? (
                        <div className="text-xs text-muted-foreground">{o.stage_name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>{dash(o.sla_policy_basis_status)}</div>
                      <div className="font-mono text-xs">
                        {o.sla_policy_code
                          ? `${o.sla_policy_code} v${dash(o.sla_policy_version)} · ${dash(o.sla_policy_rule_code)}`
                          : dash(o.sla_policy_reason_code)}
                      </div>
                    </TableCell>
                    <TableCell>{fmt(obligationDeadline(o))}</TableCell>
                    <TableCell>
                      <Badge variant={stateVariant(o.stage?.state)}>
                        {SLA_STATE_LABEL[o.stage?.state ?? ''] ?? dash(o.stage?.state)}
                      </Badge>
                      {(o.stage?.pause_seconds ?? 0) > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {Math.round((o.stage?.pause_seconds ?? 0) / 60)} min on hold
                        </div>
                      ) : null}
                      {o.escalations?.length ? (
                        <div className="text-xs text-muted-foreground">
                          escalated to tier {o.escalations[o.escalations.length - 1].tier}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={outcomeVariant(o.outcome)}>
                        {SLA_OUTCOME_LABEL[o.outcome] ?? o.outcome}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground" data-testid="sla-policy-automation">{view.automation}</p>
      </CardContent>
    </Card>
  );
}

export default AmlResponseSlaPanel;
