/**
 * PCOMP-R2C — Supervisory response policy expectations.
 *
 * Shows the supervisor what the response policy pinned to the assessment's
 * policy basis expects at the current risk-of-record: which consequences it
 * requires, recommends, permits or prohibits, which rule said so, and which
 * policy version and profile version that judgment came from.
 *
 * Every value is rendered exactly as the server returned it. The screen never
 * derives an expectation from a rating, never executes an action and never
 * softens a prohibition.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, ScrollText } from 'lucide-react';
import {
  RESPONSE_BASIS_LABEL,
  RESPONSE_LEVEL_LABEL,
  RESPONSE_REASON_LABEL,
  useSupervisoryResponsePolicy,
} from '@/hooks/useAmlResponsePolicy';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

function levelVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level === 'PROHIBITED') return 'destructive';
  if (level === 'REQUIRED') return 'default';
  if (level === 'RECOMMENDED') return 'secondary';
  return 'outline';
}

export function AmlResponsePolicyPanel({
  entityId,
  assessmentId,
  domainCode = 'AML_CFT',
}: {
  entityId: string;
  assessmentId?: string | null;
  domainCode?: string;
}) {
  const { data: view, isLoading } = useSupervisoryResponsePolicy(entityId, domainCode, assessmentId ?? null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Supervisory response policy</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Reading the governing response policy…</CardContent>
      </Card>
    );
  }

  if (!view || !view.evaluation) {
    return (
      <Card>
        <CardHeader><CardTitle>Supervisory response policy</CardTitle></CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Response policy expectations unavailable</AlertTitle>
            <AlertDescription>
              The server did not return response policy expectations for this record.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const ev = view.evaluation;
  const expectations = ev.expectations ?? [];
  const required = ev.required_responses ?? [];
  const decisions = view.decisions ?? [];

  return (
    <Card data-testid="aml-response-policy-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-4 w-4" aria-hidden />
          Supervisory response policy
        </CardTitle>
        <CardDescription>
          {RESPONSE_BASIS_LABEL[ev.status] ?? ev.status}
          {ev.source_rating ? ` · current risk-of-record: ${ev.source_rating}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ev.governed ? (
          <Alert>
            <Info className="h-4 w-4" aria-hidden />
            <AlertTitle>{RESPONSE_BASIS_LABEL[ev.status] ?? ev.status}</AlertTitle>
            <AlertDescription>
              {ev.reason ?? RESPONSE_REASON_LABEL[ev.reason_code ?? ''] ?? 'The server gave no further reason.'}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-2" data-testid="response-policy-provenance">
            <div>
              <span className="text-muted-foreground">Response policy</span>
              <div className="font-mono">{dash(ev.policy?.code)} v{dash(ev.policy?.component_version)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Policy profile</span>
              <div className="font-mono">{dash(ev.policy_profile?.code)} v{dash(ev.policy_profile?.version)}</div>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supervisory consequence</TableHead>
              <TableHead>Policy expectation</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Advisory timeframe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expectations.map((x) => (
              <TableRow key={x.action}>
                <TableCell>{dash(x.label ?? x.action)}</TableCell>
                <TableCell>
                  <Badge variant={levelVariant(x.response_level)}>
                    {RESPONSE_LEVEL_LABEL[x.response_level] ?? x.response_level}
                  </Badge>
                  {x.policy_note ? (
                    <div className="mt-1 text-xs text-muted-foreground">{x.policy_note}</div>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">{dash(x.rule_code)}</TableCell>
                <TableCell>
                  {x.advisory_timeframe_days === null
                    ? '—'
                    : `${x.advisory_timeframe_days} day(s) (advisory)`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {required.length > 0 ? (
          <Alert>
            <Info className="h-4 w-4" aria-hidden />
            <AlertTitle>Responses this policy requires</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {required.map((r) => (
                  <li key={r.action}>
                    {r.action}
                    {r.rule_code ? ` — rule ${r.rule_code}` : ''}
                    {r.advisory_timeframe_days === null ? '' : ` — within ${r.advisory_timeframe_days} day(s) (advisory)`}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-xs text-muted-foreground" data-testid="response-policy-automation">{ev.automation}</p>
        <p className="text-xs text-muted-foreground">{ev.timing_ownership}</p>

        {decisions.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recorded consequences and the policy they were judged against</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consequence</TableHead>
                  <TableHead>Policy basis</TableHead>
                  <TableHead>Policy version</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Expectation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.map((d) => (
                  <TableRow key={d.decision_id}>
                    <TableCell>{d.action_type}</TableCell>
                    <TableCell>{dash(d.response_policy_basis_status)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.response_policy_code
                        ? `${d.response_policy_code} v${dash(d.response_policy_version)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{dash(d.response_policy_rule_code)}</TableCell>
                    <TableCell>
                      {d.response_policy_level
                        ? (RESPONSE_LEVEL_LABEL[d.response_policy_level] ?? d.response_policy_level)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default AmlResponsePolicyPanel;
