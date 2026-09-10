/**
 * AML-11 — Outcome & Effectiveness.
 *
 * This surface asks one supervisory question: did a completed AML/CFT
 * supervisory action achieve the objective recorded for it? Everything shown —
 * eligibility, completion, conclusions, evidence, maker-checker state and the
 * available follow-ups — is rendered exactly as the server returned it.
 *
 * The screen never treats a closed action as an effective one, never proposes a
 * conclusion, never judges evidence sufficiency and never changes a risk rating.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ClipboardCheck, Scale } from 'lucide-react';
import { AmlEvidenceLinker, type AmlEvidenceRef } from '@/components/supervision/aml/AmlEvidenceLinker';
import {
  OUTCOME_CONCLUSION_LABEL,
  OUTCOME_REASON_LABEL,
  OUTCOME_REVIEW_LABEL,
  outcomeErrorMessage,
  useEvaluateSupervisoryOutcome,
  useReviewSupervisoryOutcome,
  useSupervisoryOutcomeFollowup,
  useSupervisoryOutcomeView,
  type OutcomeAction,
} from '@/hooks/useAmlSupervisoryOutcome';
import { TARGET_KIND_LABEL } from '@/hooks/useAmlSupervisoryConsequence';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—');

export function AmlOutcomeEffectivenessPanel({
  entityId,
  domainCode = 'AML_CFT',
}: {
  entityId: string;
  domainCode?: string;
}) {
  const { data: view, isLoading } = useSupervisoryOutcomeView(entityId, domainCode);
  const evaluate = useEvaluateSupervisoryOutcome();
  const review = useReviewSupervisoryOutcome();
  const followup = useSupervisoryOutcomeFollowup();

  const [decisionId, setDecisionId] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [rationale, setRationale] = useState('');
  const [limitations, setLimitations] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [evidence, setEvidence] = useState<AmlEvidenceRef[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [followupId, setFollowupId] = useState('');
  const [followupAction, setFollowupAction] = useState('');
  const [followupRationale, setFollowupRationale] = useState('');

  const action: OutcomeAction | null = useMemo(
    () => view?.actions?.find((a) => a.decision_id === decisionId) ?? null,
    [view, decisionId],
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the governed outcome record…</p>;
  }
  if (!view) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Outcome record unavailable</AlertTitle>
        <AlertDescription>
          The server did not return an outcome record for this entity, or it falls outside your
          supervisory authority.
        </AlertDescription>
      </Alert>
    );
  }

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const res = (await fn()) as Record<string, unknown> | undefined;
      if (res?.duplicate) {
        toast.info(String(res.reason ?? 'An evaluation of this action already exists.'));
      } else if (res?.idempotent) {
        toast.info('This evaluation was already recorded — the existing record was returned.');
      } else {
        toast.success(label);
      }
    } catch (e) {
      toast.error(outcomeErrorMessage(e));
    }
  };

  const evaluations = view.evaluations ?? [];
  const followupTarget = evaluations.find((e) => e.id === followupId) ?? null;

  return (
    <Card data-testid="outcome-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Outcome &amp; effectiveness
        </CardTitle>
        <CardDescription>
          {(view.notes ?? []).map((n) => (
            <span key={n} className="block">
              {n}
            </span>
          ))}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ------------------------------------------- linked supervisory actions */}
        <section className="space-y-2" data-testid="outcome-actions">
          <h4 className="text-sm font-semibold">Linked supervisory actions</h4>
          {view.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="outcome-actions-empty">
              No AML/CFT consequence linkage exists for this entity, so there is nothing to evaluate.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Objective</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Evaluation state</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.actions.map((a) => (
                  <TableRow key={a.decision_id} data-testid={`outcome-action-${a.decision_id}`}>
                    <TableCell className="text-sm">{a.action_type}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {dash(a.target_reference ?? a.target_id)}
                      {a.target_kind ? (
                        <span className="ml-1 text-muted-foreground">
                          ({TARGET_KIND_LABEL[a.target_kind] ?? a.target_kind})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-xs">{dash(a.action_objective)}</TableCell>
                    <TableCell className="text-xs">{dash(a.action_status)}</TableCell>
                    <TableCell className="text-xs">{when(a.action_completed_at)}</TableCell>
                    <TableCell className="space-y-1 text-xs">
                      <Badge variant={a.evaluable ? 'outline' : 'secondary'}>
                        {OUTCOME_REASON_LABEL[a.reason_code] ?? a.reason_code}
                      </Badge>
                      <p className="text-muted-foreground">{a.reason}</p>
                      {a.legacy_lineage ? (
                        <Badge variant="secondary" data-testid={`outcome-legacy-${a.decision_id}`}>
                          Legacy lineage — no published risk-of-record
                        </Badge>
                      ) : null}
                      {a.active_evaluation ? (
                        <Badge variant="outline">
                          {OUTCOME_REVIEW_LABEL[String(a.active_evaluation.review_status)] ??
                            String(a.active_evaluation.review_status)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not yet assessed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* ---------------------------------------------------- record evaluation */}
        <section className="space-y-3 rounded-md border p-3" data-testid="outcome-form">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Scale className="h-4 w-4" />
            Record an outcome evaluation
          </h4>

          {!view.viewer.may_prepare ? (
            <Alert data-testid="outcome-no-prepare">
              <AlertTitle>You may read this record only</AlertTitle>
              <AlertDescription>
                The server has not granted you authority to prepare an outcome evaluation.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="outcome-action">Supervisory action</Label>
                  <Select value={decisionId} onValueChange={setDecisionId}>
                    <SelectTrigger id="outcome-action">
                      <SelectValue placeholder="Select a linked action" />
                    </SelectTrigger>
                    <SelectContent>
                      {view.actions.map((a) => (
                        <SelectItem key={a.decision_id} value={a.decision_id} disabled={!a.evaluable}>
                          {a.action_type} — {dash(a.target_reference ?? a.target_id)}
                          {a.evaluable ? '' : ` (${OUTCOME_REASON_LABEL[a.reason_code] ?? a.reason_code})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="outcome-conclusion">Effectiveness conclusion</Label>
                  <Select value={conclusion} onValueChange={setConclusion}>
                    <SelectTrigger id="outcome-conclusion">
                      <SelectValue placeholder="Select a conclusion" />
                    </SelectTrigger>
                    <SelectContent>
                      {(view.conclusions ?? []).map((c) => (
                        <SelectItem key={c} value={c}>
                          {OUTCOME_CONCLUSION_LABEL[c] ?? c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {action && !action.evaluable ? (
                <Alert variant="destructive" data-testid="outcome-not-evaluable">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{OUTCOME_REASON_LABEL[action.reason_code] ?? action.reason_code}</AlertTitle>
                  <AlertDescription>{action.reason}</AlertDescription>
                </Alert>
              ) : null}

              {action ? (
                <div className="rounded-md bg-muted/40 p-2 text-xs" data-testid="outcome-lineage">
                  <p>Objective on record: {dash(action.action_objective)}</p>
                  <p>
                    Source: {dash(action.source_kind)} · rating {dash(action.source_rating)} (
                    {dash(action.rating_provenance)})
                  </p>
                  <p>Publication: {dash(action.publication_id)}</p>
                  <p>Assessment: {dash(action.assessment_id)}</p>
                </div>
              ) : null}

              <div className="space-y-1">
                <Label htmlFor="outcome-rationale">Written supervisory judgment</Label>
                <Textarea
                  id="outcome-rationale"
                  rows={3}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Explain, against the recorded objective, what the action did or did not achieve."
                />
              </div>

              <AmlEvidenceLinker
                entityId={entityId}
                value={evidence}
                onChange={setEvidence}
                label="Supporting evidence"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="outcome-limitations">Limitations or residual concerns</Label>
                  <Textarea
                    id="outcome-limitations"
                    rows={2}
                    value={limitations}
                    onChange={(e) => setLimitations(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="outcome-next-step">Recommended next step (optional)</Label>
                  <Textarea
                    id="outcome-next-step"
                    rows={2}
                    value={nextStep}
                    onChange={(e) => setNextStep(e.target.value)}
                  />
                </div>
              </div>

              <Button
                data-testid="outcome-submit"
                disabled={!decisionId || !conclusion || evaluate.isPending}
                onClick={() =>
                  run('Outcome evaluation submitted for review.', () =>
                    evaluate.mutateAsync({
                      consequenceDecisionId: decisionId,
                      conclusion,
                      rationale,
                      limitations: limitations || null,
                      recommendedNextStep: nextStep || null,
                      evidence: evidence.map((e) => ({
                        evidence_id: String(e.document_id),
                        note: e.note ?? null,
                      })),
                    }),
                  )
                }
              >
                Submit for review
              </Button>
            </>
          )}
        </section>

        {/* ------------------------------------------------------- decision history */}
        <section className="space-y-2" data-testid="outcome-history">
          <h4 className="text-sm font-semibold">Evaluation and decision history</h4>
          {evaluations.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="outcome-history-empty">
              No outcome evaluation has been recorded for this entity yet.
            </p>
          ) : (
            <div className="space-y-3">
              {evaluations.map((e) => (
                <div key={e.id} className="rounded-md border p-3 text-sm" data-testid={`outcome-eval-${e.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{OUTCOME_CONCLUSION_LABEL[e.conclusion] ?? e.conclusion}</Badge>
                    <Badge variant="secondary">{OUTCOME_REVIEW_LABEL[e.review_status] ?? e.review_status}</Badge>
                    <span className="text-xs text-muted-foreground">version {e.version}</span>
                    {e.superseded_by_id ? (
                      <Badge variant="secondary">Superseded by a later version</Badge>
                    ) : null}
                    {e.evidence_snapshot_present ? (
                      <Badge variant="outline">Evidence frozen at approval</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Objective: {dash(e.action_objective)} · action {dash(e.action_status)} · completed{' '}
                    {when(e.action_completed_at)}
                  </p>
                  <p className="mt-2">{e.rationale}</p>
                  {e.limitations ? (
                    <p className="mt-1 text-xs">Limitations: {e.limitations}</p>
                  ) : null}
                  {e.recommended_next_step ? (
                    <p className="mt-1 text-xs">Recommended next step: {e.recommended_next_step}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prepared {when(e.prepared_at)} · reviewed {when(e.reviewed_at)}
                    {e.review_note ? ` · review note: ${e.review_note}` : ''}
                  </p>

                  <ul className="mt-2 space-y-1 text-xs" data-testid={`outcome-eval-evidence-${e.id}`}>
                    {(e.evidence ?? []).length === 0 ? (
                      <li className="text-muted-foreground">No evidence is available to you for this evaluation.</li>
                    ) : (
                      e.evidence.map((ev) => (
                        <li key={ev.evidence_id}>
                          {ev.restricted && !ev.title
                            ? 'Restricted supervisory evidence — withheld'
                            : `${dash(ev.title)} · ${dash(ev.evidence_type)}`}
                        </li>
                      ))
                    )}
                  </ul>

                  {(e.followups ?? []).length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs" data-testid={`outcome-eval-followups-${e.id}`}>
                      {e.followups.map((f, i) => (
                        <li key={String(f.decision_id ?? i)}>
                          Follow-up recorded: {String(f.action_type ?? '—')} — {String(f.rationale ?? '')}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {e.self_review_blocked ? (
                    <Alert className="mt-2" data-testid={`outcome-self-review-${e.id}`}>
                      <AlertTitle>Awaiting another supervisor</AlertTitle>
                      <AlertDescription>
                        You prepared this evaluation, so you cannot review it.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {e.may_review ? (
                    <div className="mt-2 space-y-2" data-testid={`outcome-review-${e.id}`}>
                      <Label htmlFor={`outcome-review-note-${e.id}`}>Review note</Label>
                      <Textarea
                        id={`outcome-review-note-${e.id}`}
                        rows={2}
                        value={reviewId === e.id ? reviewNote : ''}
                        onChange={(ev) => {
                          setReviewId(e.id);
                          setReviewNote(ev.target.value);
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          data-testid={`outcome-approve-${e.id}`}
                          disabled={review.isPending}
                          onClick={() =>
                            run('Outcome evaluation approved and frozen.', () =>
                              review.mutateAsync({
                                evaluationId: e.id,
                                decision: 'APPROVE',
                                note: reviewId === e.id ? reviewNote : '',
                              }),
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`outcome-return-${e.id}`}
                          disabled={review.isPending}
                          onClick={() =>
                            run('Outcome evaluation returned for revision.', () =>
                              review.mutateAsync({
                                evaluationId: e.id,
                                decision: 'RETURN',
                                note: reviewId === e.id ? reviewNote : '',
                              }),
                            )
                          }
                        >
                          Return
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {e.follow_up_available ? (
                    <Badge className="mt-2" variant="outline" data-testid={`outcome-followup-available-${e.id}`}>
                      A governed follow-up may be selected for this outcome
                    </Badge>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ follow-up */}
        {(view.follow_up_actions ?? []).length > 0 ? (
          <section className="space-y-3 rounded-md border p-3" data-testid="outcome-followup-form">
            <h4 className="text-sm font-semibold">Governed follow-up</h4>
            <p className="text-xs text-muted-foreground">
              Follow-up is never created automatically. Select an action the server has made available
              and justify it in writing.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="outcome-followup-eval">Approved evaluation</Label>
                <Select value={followupId} onValueChange={setFollowupId}>
                  <SelectTrigger id="outcome-followup-eval">
                    <SelectValue placeholder="Select an approved outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    {evaluations
                      .filter((e) => e.follow_up_available)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {OUTCOME_CONCLUSION_LABEL[e.conclusion] ?? e.conclusion} — {dash(e.target_reference)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="outcome-followup-action">Follow-up action</Label>
                <Select value={followupAction} onValueChange={setFollowupAction}>
                  <SelectTrigger id="outcome-followup-action">
                    <SelectValue placeholder="Select an available action" />
                  </SelectTrigger>
                  <SelectContent>
                    {view.follow_up_actions.map((a) => (
                      <SelectItem
                        key={String(a.action)}
                        value={String(a.action)}
                        disabled={!a.available}
                      >
                        {String(a.label ?? a.action)}
                        {a.available ? '' : ` (${String(a.reason ?? 'unavailable')})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="outcome-followup-rationale">Justification</Label>
              <Textarea
                id="outcome-followup-rationale"
                rows={2}
                value={followupRationale}
                onChange={(e) => setFollowupRationale(e.target.value)}
              />
            </div>
            <Button
              data-testid="outcome-followup-submit"
              disabled={!followupId || !followupAction || !followupTarget || followup.isPending}
              onClick={() =>
                run('Follow-up consequence recorded.', () =>
                  followup.mutateAsync({
                    evaluationId: followupId,
                    actionType: followupAction,
                    linkageMode: 'CREATE',
                    rationale: followupRationale,
                  }),
                )
              }
            >
              Record follow-up
            </Button>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default AmlOutcomeEffectivenessPanel;
