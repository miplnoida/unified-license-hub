/**
 * AML-07 — Review / Decision surface for one AML/CFT assessment.
 *
 * The screen is a reader of the server's governed contracts. The lifecycle state,
 * the permitted actions, the permission each action needs, the blocking conditions,
 * maker/checker independence, override precedence, the final approved rating,
 * publication eligibility and the current risk-of-record are all decided by the
 * database and displayed here verbatim. Nothing on this screen recomputes them.
 *
 * It keeps three ideas visibly separate:
 *   CALCULATED RESULT          — what the governed calculation run produced
 *   APPROVED ASSESSMENT RESULT — what the approval decision bound
 *   PUBLISHED RISK-OF-RECORD   — what the entity risk-of-record now says
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, GitBranch, ShieldCheck } from 'lucide-react';
import {
  ACTION_REASON_LABEL,
  BLOCKER_LABEL,
  CHALLENGE_CATEGORIES,
  FINAL_RATING_SOURCE_LABEL,
  LIFECYCLE_STATE_LABEL,
  actionOf,
  reviewErrorMessage,
  useApproveAssessment,
  useAssessmentReviewRegister,
  usePublishRiskOfRecord,
  useRaiseReviewChallenge,
  useRejectAssessment,
  useResolveReviewChallenge,
  useReturnAssessmentForChanges,
  useSubmitAssessmentForReview,
} from '@/hooks/useAmlAssessmentReview';
import { AmlAssessmentAssignmentCard } from './AmlAssessmentAssignmentCard';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—');

export function AmlAssessmentReviewPanel({ assessmentId }: { assessmentId: string }) {
  const { data: register, isLoading } = useAssessmentReviewRegister(assessmentId);
  const submit = useSubmitAssessmentForReview();
  const raise = useRaiseReviewChallenge();
  const resolve = useResolveReviewChallenge();
  const doReturn = useReturnAssessmentForChanges();
  const reject = useRejectAssessment();
  const approve = useApproveAssessment();
  const publish = usePublishRiskOfRecord();

  const [submitReason, setSubmitReason] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [challengeCode, setChallengeCode] = useState('');
  const [challengeCategory, setChallengeCategory] = useState('EVIDENCE');
  const [challengeNarrative, setChallengeNarrative] = useState('');
  const [challengeQuestion, setChallengeQuestion] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [publishReason, setPublishReason] = useState('');

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the governed review record…</p>;
  }
  if (!register) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Review record unavailable</AlertTitle>
        <AlertDescription>
          The server did not return a review record for this assessment, or it is outside your supervisory authority.
        </AlertDescription>
      </Alert>
    );
  }

  const life = register.lifecycle;
  const rounds = register.rounds ?? [];
  const currentRound = rounds.find((r) => r.outcome === 'PENDING') ?? rounds[0] ?? null;
  const decision = (register.decisions ?? []).find((d) => d.decision === 'APPROVED')
    ?? (register.decisions ?? [])[0] ?? null;
  const publication = (register.publications ?? [])[0] ?? null;
  const lineage = register.lineage;
  const openChallenges = rounds.flatMap((r) => r.challenges ?? []).filter((c) => c.status === 'OPEN');

  const act = (name: string) => actionOf(life, name);
  const permitted = (name: string) => act(name)?.permitted === true;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(label);
    } catch (e) {
      toast.error(reviewErrorMessage(e));
    }
  };

  const ActionReason = ({ name }: { name: string }) => {
    const a = act(name);
    if (!a || a.permitted) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {ACTION_REASON_LABEL[a.reason_code] ?? a.reason_code} · requires{' '}
        <span className="font-mono">{a.required_permission}</span>
      </p>
    );
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ lifecycle contract -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lifecycle state and permitted actions</CardTitle>
          <CardDescription>
            The state, the actions available to you and every blocking condition below are the server's decision.
            This screen does not reconstruct the workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{LIFECYCLE_STATE_LABEL[life.canonical_state] ?? life.canonical_state}</Badge>
            <Badge variant="outline">Round {life.current_round_seq}</Badge>
            <Badge variant="outline">{life.editing_allowed ? 'Editing allowed' : 'Editing closed'}</Badge>
            <Badge variant="outline">
              {life.publication_allowed ? 'Publication permitted' : 'Publication not permitted'}
            </Badge>
            {life.viewer_is_preparer ? (
              <Badge variant="outline">You prepared or submitted this assessment</Badge>
            ) : null}
          </div>

          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-72 text-muted-foreground">Canonical server status</TableCell>
                <TableCell className="font-mono text-xs">{dash(life.raw_status)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Preparer (owner)</TableCell>
                <TableCell className="font-mono text-xs">{dash(life.assigned_owner_id)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Submitted by (current round)</TableCell>
                <TableCell className="font-mono text-xs">{dash(currentRound?.submitted_by)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Assigned reviewer</TableCell>
                <TableCell className="font-mono text-xs">{dash(life.assigned_reviewer_id)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Assigned team</TableCell>
                <TableCell className="font-mono text-xs">{dash(life.assigned_team_id)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Submitted calculation run</TableCell>
                <TableCell className="font-mono text-xs">
                  {currentRound?.calculation_run_seq != null ? `#${currentRound.calculation_run_seq}` : '—'}
                  {' · '}
                  {dash(currentRound?.calculation_result_hash)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Blocking conditions</h4>
            {life.blockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">The server reports no blocking condition.</p>
            ) : (
              <ul className="space-y-1">
                {life.blockers.map((b) => (
                  <li key={b.code} className="rounded-md border p-2 text-sm">
                    <span className="font-mono text-xs">{b.code}</span>{' — '}
                    {BLOCKER_LABEL[b.code] ?? b.label}
                    <div className="text-xs text-muted-foreground">{b.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Permitted actions</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead><TableHead>Available</TableHead>
                  <TableHead>Permission</TableHead><TableHead>Server reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {life.actions.map((a) => (
                  <TableRow key={a.action}>
                    <TableCell>{a.label}</TableCell>
                    <TableCell>{a.permitted ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="font-mono text-xs">{a.required_permission}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ACTION_REASON_LABEL[a.reason_code] ?? a.reason_code}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AmlAssessmentAssignmentCard life={life} />

      {/* -------------------------------------------------------- submission -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Submission for review</CardTitle>
          <CardDescription>
            Submission binds the exact immutable calculation run the reviewer will see. The server rechecks readiness
            on the committed record, so an obsolete screen cannot submit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="rev-submit-reason">Submission rationale (at least 10 characters)</Label>
          <Textarea id="rev-submit-reason" rows={2} value={submitReason}
            onChange={(e) => setSubmitReason(e.target.value)} />
          <Label htmlFor="rev-change-summary">What changed since the last round (optional)</Label>
          <Input id="rev-change-summary" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} />
          <Button
            data-rbac="aml_supervision.submit"
            disabled={!permitted('SUBMIT_FOR_REVIEW') || submit.isPending || submitReason.trim().length < 10}
            onClick={() => void run('The assessment was submitted for review.', () =>
              submit.mutateAsync({
                assessmentId,
                rationale: submitReason,
                runId: null, // server binds the current calculation run; a prior round's run is obsolete
                expectedResultHash: null,
                changeSummary: changeSummary || null,
              }))}
          >
            {life.canonical_state === 'RETURNED_FOR_CHANGES' ? 'Resubmit for review' : 'Submit for review'}
          </Button>
          <ActionReason name="SUBMIT_FOR_REVIEW" />
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- challenges -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reviewer challenges</CardTitle>
          <CardDescription>
            A challenge records the reviewer's objection against the exact record it concerns. Approval stays blocked
            while any challenge is open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rounds.flatMap((r) => r.challenges ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No challenge has been raised on this assessment.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead><TableHead>Code / category</TableHead>
                  <TableHead>Narrative</TableHead><TableHead>References</TableHead>
                  <TableHead>Raised</TableHead><TableHead>Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.flatMap((r) => (r.challenges ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{r.round_seq}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-mono">{c.challenge_code}</div>
                      <div className="text-muted-foreground">{c.category}</div>
                    </TableCell>
                    <TableCell className="max-w-md text-xs">{c.narrative}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {[c.question_code, c.dimension_code, c.fact_code].filter(Boolean).join(' · ') || '—'}
                      {c.calculation_run_id ? <div className="text-muted-foreground">run bound</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-mono">{dash(c.raised_by)}</div>
                      <div className="text-muted-foreground">{when(c.raised_at)}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{c.status}</Badge>
                      {c.status !== 'OPEN' ? (
                        <div className="mt-1 text-muted-foreground">
                          {dash(c.resolution_note)} · {dash(c.resolved_by)} · {when(c.resolved_at)}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          )}

          {permitted('RAISE_CHALLENGE') ? (
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="rev-challenge-code">Challenge code</Label>
              <Input id="rev-challenge-code" value={challengeCode} onChange={(e) => setChallengeCode(e.target.value)} />
              <Label>Category</Label>
              <Select value={challengeCategory} onValueChange={setChallengeCategory}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHALLENGE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Label htmlFor="rev-challenge-question">Referenced question code (optional)</Label>
              <Input id="rev-challenge-question" value={challengeQuestion}
                onChange={(e) => setChallengeQuestion(e.target.value)} />
              <Label htmlFor="rev-challenge-narrative">Challenge narrative (at least 10 characters)</Label>
              <Textarea id="rev-challenge-narrative" rows={3} value={challengeNarrative}
                onChange={(e) => setChallengeNarrative(e.target.value)} />
              <Button
                data-rbac="aml_supervision.review"
                disabled={raise.isPending || challengeNarrative.trim().length < 10}
                onClick={() => void run('The challenge was recorded.', () =>
                  raise.mutateAsync({
                    assessmentId, challengeCode: challengeCode || 'GENERAL',
                    category: challengeCategory, narrative: challengeNarrative,
                    refs: challengeQuestion ? { question_code: challengeQuestion } : {},
                  }))}
              >
                Raise challenge
              </Button>
            </div>
          ) : (
            <ActionReason name="RAISE_CHALLENGE" />
          )}

          {openChallenges.length > 0 ? (
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="rev-resolution">Resolution note (at least 10 characters)</Label>
              <Textarea id="rev-resolution" rows={2} value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)} />
              <Button
                data-rbac="aml_supervision.review"
                variant="outline"
                disabled={resolve.isPending || resolutionNote.trim().length < 10}
                onClick={() => void run('The challenge was resolved.', () =>
                  resolve.mutateAsync({ challengeId: openChallenges[0].id, resolutionNote }))}
              >
                Resolve challenge
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ rounds and returns -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Review rounds</CardTitle>
          <CardDescription>
            Every round keeps its own submitted snapshot and bound calculation run. Returning or resubmitting never
            rewrites an earlier round.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Round</TableHead><TableHead>Submitted</TableHead><TableHead>Bound run</TableHead>
                <TableHead>Computed rating</TableHead><TableHead>Outcome</TableHead><TableHead>Reason</TableHead>
                <TableHead>What changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rounds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    This assessment has not yet been submitted for review.
                  </TableCell>
                </TableRow>
              ) : rounds.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">#{r.round_seq}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-mono">{dash(r.submitted_by)}</div>
                    <div className="text-muted-foreground">{when(r.submitted_at)}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.calculation_run_seq != null ? `#${r.calculation_run_seq}` : r.calculation_basis}
                    <div className="text-muted-foreground break-all">{dash(r.calculation_result_hash)}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{dash(r.computed_rating)}</TableCell>
                  <TableCell><Badge variant="outline">{r.outcome}</Badge></TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">{dash(r.outcome_reason)}</TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">{dash(r.change_summary)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="rev-return-reason">Written reason for returning the assessment (at least 10 characters)</Label>
            <Textarea id="rev-return-reason" rows={2} value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button
                data-rbac="aml_supervision.review"
                variant="outline"
                disabled={!permitted('RETURN_FOR_CHANGES') || doReturn.isPending || returnReason.trim().length < 10}
                onClick={() => void run('The assessment was returned for correction.', () =>
                  doReturn.mutateAsync({ assessmentId, reason: returnReason }))}
              >
                Return for correction
              </Button>
              <Button
                data-rbac="aml_supervision.approve"
                variant="outline"
                disabled={!permitted('REJECT') || reject.isPending || returnReason.trim().length < 10}
                onClick={() => void run('The assessment was closed without approval.', () =>
                  reject.mutateAsync({ assessmentId, reason: returnReason }))}
              >
                Close without approval
              </Button>
            </div>
            <ActionReason name="RETURN_FOR_CHANGES" />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------ results and decision -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Calculated, approved and published results</CardTitle>
          <CardDescription>
            These are three different things and are never shown as one. The server decides which of the calculated
            result and an approved override becomes the approved assessment result.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-80 text-muted-foreground">CALCULATED RESULT (bound run)</TableCell>
                <TableCell className="font-mono text-xs">
                  {dash(decision?.computed_rating ?? currentRound?.computed_rating)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Proposed override rating</TableCell>
                <TableCell className="font-mono text-xs">{dash(decision?.override_rating)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">APPROVED ASSESSMENT RESULT</TableCell>
                <TableCell className="font-mono text-xs">
                  {dash(decision?.final_rating ?? life.approved_rating)}
                  {' '}
                  <Badge variant="outline">
                    {FINAL_RATING_SOURCE_LABEL[decision?.final_rating_source ?? life.approved_rating_source ?? '']
                      ?? dash(decision?.final_rating_source ?? life.approved_rating_source)}
                  </Badge>
                </TableCell>
              </TableRow>
              {decision ? (
                <TableRow data-testid="review-judgement-difference"
                  data-source={decision.final_rating_source ?? ''}>
                  <TableCell className="text-muted-foreground">CALCULATED → FINAL</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">
                    {decision.final_rating_source === 'APPROVED_OVERRIDE'
                      ? `${dash(decision.computed_rating)} (calculated) → ${dash(decision.final_rating)} (approved judgement)`
                      : `${dash(decision.computed_rating)} (calculated) → ${dash(decision.final_rating)} (unchanged)`}
                  </TableCell>
                </TableRow>
              ) : null}
              <TableRow>
                <TableCell className="text-muted-foreground">PUBLISHED RISK-OF-RECORD</TableCell>
                <TableCell className="font-mono text-xs">
                  {publication ? dash(publication.published_rating) : 'Not published'}
                  {publication && decision ? (
                    <span className="ml-2 text-muted-foreground">
                      from {FINAL_RATING_SOURCE_LABEL[decision.final_rating_source ?? ''] ?? dash(decision.final_rating_source)}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {decision ? (
            <div className="space-y-2 rounded-md border p-3">
              <h4 className="text-sm font-semibold">Immutable approval decision</h4>
              <Table>
                <TableBody>
                  <TableRow><TableCell className="w-72 text-muted-foreground">Decision</TableCell>
                    <TableCell>{decision.decision}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Review round</TableCell>
                    <TableCell>#{dash(decision.round_seq)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Calculation run / hash</TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {decision.calculation_run_seq != null ? `#${decision.calculation_run_seq}` : decision.calculation_basis}
                      {' · '}{dash(decision.calculation_result_hash)}
                    </TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Methodology / programme</TableCell>
                    <TableCell className="font-mono text-xs">
                      {dash(decision.methodology_version)} / {dash(decision.programme_version)}
                    </TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Approver</TableCell>
                    <TableCell className="font-mono text-xs">{dash(decision.decided_by)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Decision time</TableCell>
                    <TableCell>{when(decision.decided_at)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Effective / as-of date</TableCell>
                    <TableCell>{dash(decision.effective_date)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground">Rationale</TableCell>
                    <TableCell className="text-sm">{decision.rationale}</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No approval decision has been recorded for this assessment.</p>
          )}

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="rev-decision-reason">Decision rationale (at least 10 characters)</Label>
            <Textarea id="rev-decision-reason" rows={2} value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)} />
            <Button
              data-rbac="aml_supervision.approve"
              disabled={!permitted('APPROVE') || approve.isPending || decisionReason.trim().length < 10}
              onClick={() => void run('The assessment was approved and the risk-of-record published.', () =>
                approve.mutateAsync({ assessmentId, rationale: decisionReason }))}
            >
              Approve assessment
            </Button>
            <ActionReason name="APPROVE" />
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- publication -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Risk-of-record publication</CardTitle>
          <CardDescription>
            Publication is governed, atomic and idempotent: repeating it never creates a second current risk record.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {publication ? (
            <Table>
              <TableBody>
                <TableRow><TableCell className="w-72 text-muted-foreground">Published rating</TableCell>
                  <TableCell className="font-mono text-xs">{dash(publication.published_rating)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Previous (superseded) rating</TableCell>
                  <TableCell className="font-mono text-xs">{dash(publication.previous_rating)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Effective from</TableCell>
                  <TableCell>{dash(publication.effective_from)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Published by / at</TableCell>
                  <TableCell className="font-mono text-xs">
                    {dash(publication.published_by)} · {when(publication.published_at)}
                  </TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Movement record</TableCell>
                  <TableCell className="font-mono text-xs">{dash(publication.movement_id)}</TableCell></TableRow>
                <TableRow><TableCell className="text-muted-foreground">Reason</TableCell>
                  <TableCell className="text-sm">{publication.reason}</TableCell></TableRow>
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Risk-of-record not published</AlertTitle>
              <AlertDescription>
                A calculated result, a draft assessment or a pending override is never the entity risk-of-record.
                {act('PUBLISH_RISK_OF_RECORD')
                  ? ` Server reason: ${ACTION_REASON_LABEL[act('PUBLISH_RISK_OF_RECORD')!.reason_code]
                      ?? act('PUBLISH_RISK_OF_RECORD')!.reason_code}.`
                  : ''}
              </AlertDescription>
            </Alert>
          )}

          <Label htmlFor="rev-publish-reason">Publication reason</Label>
          <Input id="rev-publish-reason" value={publishReason} onChange={(e) => setPublishReason(e.target.value)} />
          <Button
            data-rbac="aml_supervision.approve"
            variant="outline"
            disabled={!permitted('PUBLISH_RISK_OF_RECORD') || publish.isPending || publishReason.trim().length < 5}
            onClick={() => void run('The entity risk-of-record was published.', () =>
              publish.mutateAsync({ assessmentId, reason: publishReason }))}
          >
            Publish risk-of-record
          </Button>
          <ActionReason name="PUBLISH_RISK_OF_RECORD" />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ lineage -- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">End-to-end lineage</CardTitle>
          <CardDescription>
            Risk-of-record → publication → approval decision → review round → calculation run → calculation policy →
            methodology → programme → question plan → responses → facts → evidence. Sources you may not see are
            withheld by the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {lineage?.legacy_state ? (
            <Alert>
              <GitBranch className="h-4 w-4" />
              <AlertTitle>Legacy lineage</AlertTitle>
              <AlertDescription>
                <span className="font-mono text-xs">{lineage.legacy_state}</span> — this record predates the governed
                AML-07 chain. No calculation run, policy version or review round has been invented for it.
              </AlertDescription>
            </Alert>
          ) : null}
          <Table>
            <TableBody>
              <TableRow><TableCell className="w-72 text-muted-foreground">Risk-of-record</TableCell>
                <TableCell className="font-mono text-xs">
                  {dash((lineage?.risk_of_record as any)?.published_rating)}
                </TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Publication</TableCell>
                <TableCell className="font-mono text-xs">
                  {dash((lineage?.risk_of_record as any)?.publication_id)}
                </TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Approval decision</TableCell>
                <TableCell className="font-mono text-xs">{dash((lineage?.approval_decision as any)?.id)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Review round</TableCell>
                <TableCell className="font-mono text-xs">{dash((lineage?.review_round as any)?.round_seq)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Calculation run</TableCell>
                <TableCell className="font-mono text-xs break-all">
                  {dash((lineage?.calculation_run as any)?.run_seq)} · {dash((lineage?.calculation_run as any)?.result_hash)}
                </TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Calculation policy</TableCell>
                <TableCell className="font-mono text-xs">
                  {dash((lineage?.calculation_policy as any)?.config_version)}
                </TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Methodology</TableCell>
                <TableCell className="font-mono text-xs">{dash((lineage?.methodology as any)?.version)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Programme</TableCell>
                <TableCell className="font-mono text-xs">{dash((lineage?.programme as any)?.version)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Question plan rows</TableCell>
                <TableCell className="font-mono text-xs">{dash(lineage?.question_plan?.rows)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Responses</TableCell>
                <TableCell className="font-mono text-xs">{dash(lineage?.responses?.count)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Facts</TableCell>
                <TableCell className="font-mono text-xs">{dash(lineage?.facts?.count)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Evidence you may see</TableCell>
                <TableCell className="font-mono text-xs">{dash(lineage?.evidence?.accessible_count)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default AmlAssessmentReviewPanel;
