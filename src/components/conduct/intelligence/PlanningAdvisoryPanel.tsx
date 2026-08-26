/**
 * MC-10 — Governed AI assistance panel for supervisory planning.
 *
 * Sits below the recorded planning facts and is visually separated from them.
 * Every item is labelled an AI suggestion awaiting human review, carries its
 * provenance and citations, and changes no supervisory record: no priority, no
 * plan, no intervention, no outcome and no closure. Options are only ever named
 * from the approved intervention catalogue. If assistance cannot be prepared,
 * the panel degrades to a plain unavailable state.
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Lock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import {
  ADVISORY_LABEL, REVIEW_ACTION_META, REVIEW_STATE_META, USE_CASE_META,
  confidenceLabel, reviewStateLabel,
  type PlanningAdvisoryUseCase, type ReviewAction, type ReviewState,
} from '@/lib/conductAdvisoryLabels';
import type { PlanningInsight, InterventionType } from '@/hooks/useConductAttention';
import {
  useGeneratePlanningAdvisory, useReviewPlanningAdvisory, type PlanningSubject,
} from '@/hooks/useConductPlanningAdvisory';

interface Props {
  subject: PlanningSubject | null;
  useCases: readonly PlanningAdvisoryUseCase[];
  insights: PlanningInsight[];
  catalogue: InterventionType[];
  /** Supervisors may commission assistance and record decisions. View-only officers may not. */
  canOperate: boolean;
  /** Optional: adopt an intervention option as a proposal the supervisor then completes. */
  onAdoptOption?: (option: { catalogueCode: string; rationale: string; insightId: string }) => void;
}

const TONE: Record<'muted' | 'success' | 'warning' | 'danger', string> = {
  muted: 'bg-muted text-muted-foreground border-border',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning-foreground border-warning/30',
  danger: 'bg-destructive/10 text-destructive border-destructive/30',
};

function Citations({ refs }: { refs?: unknown }) {
  const list = Array.isArray(refs) ? refs.map((r) => String(r)).filter(Boolean) : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {list.map((r) => (
        <Badge key={r} variant="outline" className="font-mono text-[10px]">{r}</Badge>
      ))}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items?: unknown }) {
  const list = Array.isArray(items) ? items.map((x) => String(x)).filter(Boolean) : [];
  if (list.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {list.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

/** Renders whichever governed planning output shape this capability returns. */
function AdvisoryBody({
  insight, catalogue, canOperate, onAdoptOption,
}: {
  insight: PlanningInsight;
  catalogue: InterventionType[];
  canOperate: boolean;
  onAdoptOption?: Props['onAdoptOption'];
}) {
  const out = (insight.ai_output ?? {}) as Record<string, any>;
  const nameOf = (code: string) => catalogue.find((c) => c.code === code)?.name ?? code;

  return (
    <div className="space-y-4">
      {typeof out.summary === 'string' && out.summary.trim() && (
        <div className="rounded-md border-l-2 border-warning/50 bg-warning/5 p-3">
          <p className="whitespace-pre-wrap text-sm">{out.summary.trim()}</p>
          <Citations refs={out.cited_references} />
        </div>
      )}

      <Bullets title="What the records show" items={out.what_the_records_show} />
      <Bullets title="Why it may merit supervisory attention" items={out.why_it_may_merit_attention} />
      <Bullets title="Not evidenced by the records" items={out.not_evidenced} />

      {Array.isArray(out.records) && out.records.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Records suggested for review
          </p>
          {out.records.map((r: any, i: number) => (
            <div key={i} className="rounded-md border p-3">
              <p className="font-mono text-xs">{r.reference}</p>
              {r.why && <p className="mt-1 text-sm">{r.why}</p>}
              {r.what_it_may_show && (
                <p className="mt-1 text-sm text-muted-foreground">{r.what_it_may_show}</p>
              )}
              <Citations refs={r.cited_references} />
            </div>
          ))}
        </div>
      )}

      {Array.isArray(out.questions) && out.questions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Draft questions for supervisory use
          </p>
          <ol className="space-y-2">
            {out.questions.map((q: any, i: number) => (
              <li key={i} className="rounded-md border p-3">
                <p className="text-sm">{i + 1}. {q.question}</p>
                {q.purpose && <p className="mt-1 text-xs text-muted-foreground">{q.purpose}</p>}
                <Citations refs={q.cited_references} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {Array.isArray(out.options) && out.options.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Options from the approved intervention catalogue
          </p>
          {out.options.map((o: any, i: number) => (
            <div key={i} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{nameOf(String(o.catalogue_code))}</p>
                <Badge variant="outline" className="text-[10px]">Approved catalogue</Badge>
                {canOperate && onAdoptOption && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => onAdoptOption({
                      catalogueCode: String(o.catalogue_code),
                      rationale: [o.why_the_facts_may_support_it, o.what_it_would_establish]
                        .filter(Boolean).join(' '),
                      insightId: insight.id,
                    })}
                  >
                    Use as a starting point
                  </Button>
                )}
              </div>
              {o.why_the_facts_may_support_it && (
                <p className="mt-1.5 text-sm">{o.why_the_facts_may_support_it}</p>
              )}
              {o.what_it_would_establish && (
                <p className="mt-1 text-sm text-muted-foreground">
                  What it would establish: {o.what_it_would_establish}
                </p>
              )}
              <Citations refs={o.cited_references} />
            </div>
          ))}
          <p className="text-xs italic text-muted-foreground">
            Adopting an option only pre-fills a proposal for you to complete. The intervention itself is initiated,
            recorded and decided by supervisors under the governed workflow.
          </p>
        </div>
      )}

      {typeof out.draft_objective === 'string' && out.draft_objective.trim() && (
        <div className="space-y-2">
          <div className="rounded-md border-l-2 border-warning/50 bg-warning/5 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Draft objective</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{out.draft_objective}</p>
          </div>
          {out.draft_scope && (
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Draft scope</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{out.draft_scope}</p>
            </div>
          )}
          {Array.isArray(out.suggested_milestones) && out.suggested_milestones.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested milestones
              </p>
              {out.suggested_milestones.map((m: any, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.purpose && <p className="mt-1 text-sm text-muted-foreground">{m.purpose}</p>}
                  <Citations refs={m.cited_references} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {Array.isArray(out.considerations) && out.considerations.length > 0 && (
        typeof out.considerations[0] === 'string'
          ? <Bullets title="Considerations" items={out.considerations} />
          : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Considerations</p>
              {out.considerations.map((c: any, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{c.matter}</p>
                  {c.why && <p className="mt-1 text-sm text-muted-foreground">{c.why}</p>}
                  <Citations refs={c.cited_references} />
                </div>
              ))}
            </div>
          )
      )}

      <Bullets title="Suggested reassessment focus" items={out.suggested_reassessment_focus} />

      {insight.uncertainty && (
        <p className="text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Stated uncertainty: </span>
          {insight.uncertainty}
        </p>
      )}
      {(insight.limitations ?? []).length > 0 && (
        <Bullets title="Limitations" items={insight.limitations} />
      )}
    </div>
  );
}

export function PlanningAdvisoryPanel({
  subject, useCases, insights, catalogue, canOperate, onAdoptOption,
}: Props) {
  const generate = useGeneratePlanningAdvisory(subject);
  const review = useReviewPlanningAdvisory(subject);

  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<PlanningAdvisoryUseCase | null>(null);
  const [target, setTarget] = useState<PlanningInsight | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [rationale, setRationale] = useState('');
  const [humanText, setHumanText] = useState('');

  const handleGenerate = async (code: PlanningAdvisoryUseCase) => {
    setFailure(null);
    setPending(code);
    try {
      const result = await generate.mutateAsync(code);
      if (!result.ok) setFailure(result.message);
      else toast.success(`${USE_CASE_META[code].label} prepared — awaiting your review.`);
    } catch {
      setFailure('AI assistance is currently unavailable. The recorded planning workflow remains fully available.');
    } finally {
      setPending(null);
    }
  };

  const closeReview = () => {
    setTarget(null); setAction(null); setRationale(''); setHumanText('');
  };

  const submitReview = async () => {
    if (!target || !action) return;
    const meta = REVIEW_ACTION_META[action];
    if (meta.rationaleRequired && rationale.trim().length < 10) {
      toast.error('Please record a rationale of at least 10 characters.');
      return;
    }
    if (meta.textRequired && humanText.trim().length < 10) {
      toast.error('Please provide your own approved wording.');
      return;
    }
    try {
      await review.mutateAsync({
        insightId: target.id, action,
        rationale: rationale.trim() || undefined,
        humanText: humanText.trim() || undefined,
      });
      toast.success('Your supervisory decision has been recorded.');
      closeReview();
    } catch (e) {
      toast.error(String((e as Error)?.message ?? 'The decision could not be recorded.'));
    }
  };

  const grouped = new Map<string, PlanningInsight[]>();
  for (const insight of insights) {
    const list = grouped.get(insight.use_case_code) ?? [];
    list.push(insight);
    grouped.set(insight.use_case_code, list);
  }

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-4 w-4 text-warning-foreground" />
          AI planning assistance
        </CardTitle>
        <CardDescription>
          Drafting help prepared from the recorded facts above. It is not a priority, a plan, an intervention,
          an outcome or a supervisory decision.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Everything here requires human review</AlertTitle>
          <AlertDescription className="text-xs">
            Nothing in this panel sets or changes a priority, plan status, intervention, outcome, follow-up or
            closure. Priorities remain the deterministic calculation confirmed by the accountable supervisor.
          </AlertDescription>
        </Alert>

        {!canOperate && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription className="text-xs">
              View only. You can read assistance already prepared and the decisions recorded against it, but you
              cannot commission new assistance or record decisions.
            </AlertDescription>
          </Alert>
        )}

        {failure && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">AI assistance unavailable</AlertTitle>
            <AlertDescription className="text-xs">{failure}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {useCases.map((code) => {
            const meta = USE_CASE_META[code];
            const items = grouped.get(code) ?? [];
            const busy = pending === code;

            return (
              <section key={code} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                  <h3 className="text-sm font-semibold">{meta.label}</h3>
                  <Badge variant="outline" className="text-[11px]">
                    {items.length === 0 ? 'None prepared' : `${items.length} prepared`}
                  </Badge>
                  {canOperate && subject && (
                    <Button
                      size="sm" variant="outline" className="ml-auto"
                      onClick={() => handleGenerate(code)}
                      disabled={busy}
                    >
                      {busy
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      {items.length === 0 ? 'Prepare assistance' : 'Prepare fresh assistance'}
                    </Button>
                  )}
                </div>

                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{meta.purpose} No assistance has been prepared.</p>
                ) : items.map((insight) => {
                  const state = (insight.review_state ?? 'NOT_REVIEWED') as ReviewState;
                  const stateMeta = REVIEW_STATE_META[state] ?? REVIEW_STATE_META.NOT_REVIEWED;
                  const actions: ReviewAction[] = state === 'SUPERSEDED'
                    ? []
                    : state === 'NOT_REVIEWED'
                      ? ['accept', 'modify', 'reject']
                      : ['modify', 'reject', 'supersede'];

                  return (
                    <Card key={insight.id} className={state === 'SUPERSEDED' ? 'opacity-70' : undefined}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-warning-foreground">
                            {ADVISORY_LABEL}
                          </p>
                          <Badge variant="outline" className={TONE[stateMeta.tone]}>{stateMeta.label}</Badge>
                          <span className="ml-auto text-xs text-muted-foreground">
                            Prepared {formatDateTime(insight.generated_at)}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <AdvisoryBody
                          insight={insight}
                          catalogue={catalogue}
                          canOperate={canOperate}
                          onAdoptOption={onAdoptOption}
                        />

                        <p className="text-xs italic text-muted-foreground">{meta.caveat}</p>

                        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                          <p>Confidence stated: {confidenceLabel(insight.confidence)}</p>
                          <p>
                            Model {insight.model ?? 'not recorded'}
                            {insight.model_version ? ` (${insight.model_version})` : ''} · instruction{' '}
                            {insight.prompt_template_code ?? 'not recorded'}{' '}
                            {insight.prompt_template_version ?? ''}
                          </p>
                          <p>Facts signature {insight.snapshot_fingerprint ?? 'not recorded'}</p>
                        </div>

                        <Separator />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{reviewStateLabel(insight.review_state)}</span>
                          {canOperate && actions.map((a) => (
                            <Button
                              key={a} size="sm"
                              variant={a === 'accept' ? 'default' : 'outline'}
                              onClick={() => { setTarget(insight); setAction(a); }}
                            >
                              {REVIEW_ACTION_META[a].label}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={Boolean(target && action)} onOpenChange={(open) => { if (!open) closeReview(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? REVIEW_ACTION_META[action].label : ''} this suggestion</DialogTitle>
            <DialogDescription>{action ? REVIEW_ACTION_META[action].description : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {action === 'modify' && (
              <div className="space-y-1.5">
                <Label htmlFor="advisory-human-text">Your approved wording</Label>
                <Textarea
                  id="advisory-human-text" rows={5}
                  value={humanText} onChange={(e) => setHumanText(e.target.value)}
                  placeholder="Record the wording you are prepared to stand behind as the supervisor."
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="advisory-rationale">
                Rationale {action && REVIEW_ACTION_META[action].rationaleRequired ? '(required)' : '(optional)'}
              </Label>
              <Textarea
                id="advisory-rationale" rows={3}
                value={rationale} onChange={(e) => setRationale(e.target.value)}
                placeholder="Why you reached this decision."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReview}>Cancel</Button>
            <Button onClick={submitReview} disabled={review.isPending}>
              {review.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record decision
            </Button>
          </DialogFooter>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
