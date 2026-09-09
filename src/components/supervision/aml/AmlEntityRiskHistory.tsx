/**
 * AML-07 — the regulated entity's AML/CFT risk-of-record and its history.
 *
 * The current badge is read only from the canonical published risk-of-record
 * (`entity_risk_state`, served by `supervisory_entity_risk_history`). A draft,
 * submitted or merely calculated result can never appear here as current risk:
 * the browser has no way to derive it.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History } from 'lucide-react';
import { FINAL_RATING_SOURCE_LABEL, useEntityRiskHistory } from '@/hooks/useAmlAssessmentReview';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—');
const day = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : '—');

export function AmlEntityRiskHistory({
  entityId, domainCode = 'AML_CFT',
}: { entityId: string; domainCode?: string }) {
  const { data, isLoading, error } = useEntityRiskHistory(entityId, domainCode);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">AML/CFT risk-of-record history</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">AML/CFT risk-of-record history</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The governed risk history is unavailable: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const current = data?.current ?? null;
  const movements = data?.movements ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">AML/CFT risk-of-record history</CardTitle>
        <CardDescription>
          The current rating below is the published risk-of-record. Working results on an unapproved assessment never
          replace it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!current ? (
          <Alert>
            <History className="h-4 w-4" />
            <AlertTitle>No published AML/CFT risk-of-record</AlertTitle>
            <AlertDescription>
              No approved assessment has published a risk-of-record for this entity in this domain.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Current published risk: {dash(current.residual_rating)}</Badge>
              <Badge variant="outline">Inherent {dash(current.inherent_rating)}</Badge>
              <Badge variant="outline">Controls {dash(current.control_rating)}</Badge>
              {current.publication ? null : (
                <Badge variant="outline">Legacy publication — no governed publication record</Badge>
              )}
            </div>
            <Table>
              <TableBody>
                <TableRow><TableCell className="w-72 text-muted-foreground">Effective / as-of</TableCell>
                  <TableCell>{when(current.effective_from)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Last review / next review</TableCell>
                  <TableCell>{day(current.last_review_date)} → {day(current.next_review_date)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Source assessment</TableCell>
                  <TableCell className="font-mono text-xs">
                    {current.driving_assessment_id ? (
                      <Link className="underline" to={`/supervision/aml/assessments/${current.driving_assessment_id}`}>
                        {current.driving_assessment_id}
                      </Link>
                    ) : '—'}
                  </TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Publication actor / time</TableCell>
                  <TableCell className="font-mono text-xs">
                    {dash(current.publication?.published_by)} · {when(current.publication?.published_at)}
                  </TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Approval decision</TableCell>
                  <TableCell className="font-mono text-xs">{dash(current.publication?.approval_decision_id)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Publication reason</TableCell>
                  <TableCell className="text-sm">{dash(current.publication?.reason)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Superseded ratings</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Previous → new</TableHead><TableHead>Effective</TableHead>
                <TableHead>Source assessment</TableHead><TableHead>Calculation run</TableHead>
                <TableHead>Methodology / programme</TableHead><TableHead>Approved result</TableHead>
                <TableHead>Reason</TableHead><TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    No risk movement has been recorded for this entity and domain.
                  </TableCell>
                </TableRow>
              ) : movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">
                    {dash(m.previous_rating)} → {dash(m.new_rating)}
                    <div className="text-muted-foreground">{dash(m.trend)}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.publication ? day(m.publication.effective_from) : when(m.created_at)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {m.new_assessment_id ? (
                      <Link className="underline" to={`/supervision/aml/assessments/${m.new_assessment_id}`}>
                        {String(m.new_assessment_id).slice(0, 8)}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {m.decision?.calculation_run_seq != null
                      ? `#${m.decision.calculation_run_seq}`
                      : <span className="text-muted-foreground">Legacy — no AML-06 run</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {dash(m.decision?.methodology_version)} / {dash(m.decision?.programme_version)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.decision ? (
                      <>
                        <div className="font-mono">{dash(m.decision.final_rating)}</div>
                        <div className="text-muted-foreground">
                          {FINAL_RATING_SOURCE_LABEL[m.decision.final_rating_source] ?? dash(m.decision.final_rating_source)}
                        </div>
                        {m.decision.override_rating ? (
                          <div className="text-muted-foreground">override {m.decision.override_rating}</div>
                        ) : null}
                      </>
                    ) : <span className="text-muted-foreground">Legacy movement</span>}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">{dash(m.reason)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {dash(m.publication?.published_by ?? m.approved_by)}
                    <div className="text-muted-foreground">{when(m.approved_at)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default AmlEntityRiskHistory;
