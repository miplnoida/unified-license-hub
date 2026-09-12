/**
 * MC-08 — one AI activity, end to end.
 *
 * Written so an external auditor can follow the whole chain without database
 * access: the context, the facts used, how the AI request was executed, the
 * untouched AI output, the provenance, the human decision, current freshness,
 * any assurance review, and the full history.
 */
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  useAiAttempt, useAiUseCases, useAssuranceCreate, useAssuranceForInsight,
  useAttemptsForInsight, useConductAiInsight, useConductAiReviewEvents,
} from '@/hooks/useAiGovernance';
import {
  ASSESSMENT_LABEL, OUTCOME_LABEL, OUTCOME_VARIANT, REASON_LABEL,
  REVIEW_STATE_LABEL, REVIEW_STATE_VARIANT, label,
} from '@/lib/aiGovernanceLabels';
import { advisoryPlainText } from '@/components/conduct/three-sixty/advisory/advisoryText';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';
import { TechnicalProvenance } from '@/components/governance/ai/TechnicalProvenance';

export default function AiActivityDetail() {
  const { kind = 'INSIGHT', id = '' } = useParams();
  const isAttempt = kind === 'ATTEMPT';

  const { data: attempt, isLoading: attemptLoading } = useAiAttempt(isAttempt ? id : null);
  const insightId = isAttempt ? attempt?.conduct_ai_insight_id ?? null : id;
  const { data: insight, isLoading: insightLoading } = useConductAiInsight(insightId);
  const { data: events = [] } = useConductAiReviewEvents(insightId);
  const { data: attempts = [] } = useAttemptsForInsight(insightId);
  const { data: assurance = [] } = useAssuranceForInsight(insightId);
  const { data: useCases = [] } = useAiUseCases();
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAssurePrimary = useCan('ai_management', 'assure');
  const canAssureAlternate = useCan('ai_management', 'approve');
  const canAssure = canAssurePrimary || canAssureAlternate;
  const createAssurance = useAssuranceCreate();

  const loading = (isAttempt && attemptLoading) || (!!insightId && insightLoading);
  const useCaseCode = insight?.use_case_code ?? attempt?.use_case_code ?? null;
  const useCase = useCases.find((u) => u.code === useCaseCode);
  const primaryAttempt = attempt ?? attempts[attempts.length - 1] ?? null;
  const citations = Array.isArray(insight?.source_references) ? insight?.source_references as unknown[] : [];

  if (loading) {
    return (
      <DashboardLayout>
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading AI activity…
        </p>
      </DashboardLayout>
    );
  }

  if (!insight && !attempt) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-2">
          <p className="text-sm text-muted-foreground">This AI activity record could not be found, or you do not have rights to view it.</p>
          <Button asChild variant="outline"><Link to="/governance/ai/activity">Back to the activity register</Link></Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/governance/ai/activity"><ArrowLeft className="mr-1 h-4 w-4" /> Activity register</Link>
        </Button>

        <PageHeader
          title={useCase?.label ?? useCaseCode ?? 'AI activity'}
          description="The complete evidence chain for a single AI interaction. Nothing on this page can be edited."
          actions={<Badge variant="outline">Read only</Badge>}
        />

        {/* CONTEXT */}
        <Section title="Context">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <F l="Owning area" v={useCase?.owning_module ?? primaryAttempt?.owning_module ?? 'Not recorded'} />
            <F l="AI capability" v={useCase?.label ?? useCaseCode ?? 'Not recorded'} />
            <F l="Capability code" v={useCaseCode ?? 'Not recorded'} mono />
            <F l="Regulated entity" v={insight?.entity_id ?? primaryAttempt?.entity_id ?? 'Not entity specific'} mono />
            <F l="Requested by" v={primaryAttempt?.requested_by ? 'A signed-in supervisor' : insight?.generated_by ? 'A signed-in supervisor' : 'Not recorded'} />
            <F l="Requester role at the time" v={primaryAttempt?.requested_role ?? 'Not recorded'} />
            <F l="Record reference" v={insight?.insight_id ?? primaryAttempt?.id ?? 'Not recorded'} mono />
          </div>
          {insight?.entity_id && (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to={`/conduct/entities/${insight.entity_id}/360`}>Open Conduct 360 for this entity</Link>
            </Button>
          )}
        </Section>

        {/* FACTS USED */}
        <Section title="Facts used">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <F l="Facts window" v={insight?.window_start && insight?.window_end
              ? `${formatDate(insight.window_start)} to ${formatDate(insight.window_end)}`
              : primaryAttempt?.window_start && primaryAttempt?.window_end
                ? `${formatDate(primaryAttempt.window_start)} to ${formatDate(primaryAttempt.window_end)}`
                : 'Not recorded'} />
            <F l="Facts signature" v={insight?.snapshot_fingerprint ?? primaryAttempt?.snapshot_fingerprint ?? 'Not recorded'} mono />
            <F l="Information source" v="Recorded regulatory facts only" />
            <F l="External data used" v="None" />
          </div>
          <Separator className="my-3" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Records supplied and cited</p>
          {citations.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No supporting record was cited.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {citations.map((c, i) => (
                <li key={i} className="font-mono text-xs">{typeof c === 'string' ? c : JSON.stringify(c)}</li>
              ))}
            </ul>
          )}
        </Section>

        {/* AI EXECUTION */}
        <Section title="AI execution">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <F l="AI service" v={insight?.governance_service_label ?? primaryAttempt?.governance_service_label ?? 'Not recorded'} />
            <F l="Model" v={insight?.governance_model_label ?? primaryAttempt?.governance_model_label ?? 'Not recorded'} />
            <F l="Model version" v={insight?.governance_version_label ?? primaryAttempt?.governance_version_label ?? 'Not recorded'} mono />
            <F l="Instruction version" v={`${insight?.prompt_template_code ?? primaryAttempt?.instruction_template_code ?? 'Not recorded'} ${insight?.prompt_template_version ?? primaryAttempt?.instruction_version ?? ''}`} mono />
            <F l="Requested at" v={primaryAttempt ? formatDateTime(primaryAttempt.requested_at) : insight ? formatDateTime(insight.generated_at) : '—'} />
            <F l="Completed at" v={primaryAttempt?.completed_at ? formatDateTime(primaryAttempt.completed_at) : insight ? formatDateTime(insight.generated_at) : '—'} />
            <F l="Time taken" v={primaryAttempt?.latency_ms != null ? `${primaryAttempt.latency_ms} ms` : 'Not recorded'} />
            <F l="Result" v={primaryAttempt
              ? <Badge variant={OUTCOME_VARIANT[primaryAttempt.outcome] ?? 'outline'}>{label(OUTCOME_LABEL, primaryAttempt.outcome)}</Badge>
              : <Badge>{label(OUTCOME_LABEL, 'SUCCESS')}</Badge>} />
          </div>
          <div className="mt-3">
            <TechnicalProvenance
              available={insight?.technical_provenance_available ?? primaryAttempt?.technical_provenance_available ?? false}
              fields={[
                { label: 'Actual AI service / gateway', value: insight?.provider ?? primaryAttempt?.provider },
                { label: 'Technical model identifier', value: insight?.model ?? primaryAttempt?.model, mono: true },
                { label: 'Provider model version', value: insight?.model_version ?? primaryAttempt?.model_version, mono: true },
                { label: 'Facts signature', value: insight?.snapshot_fingerprint ?? primaryAttempt?.snapshot_fingerprint, mono: true },
              ]}
            />
          </div>
          {primaryAttempt?.reason_code && (
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">Reason: </span>{label(REASON_LABEL, primaryAttempt.reason_code)}
            </p>
          )}
          {primaryAttempt?.detail && (
            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{primaryAttempt.detail}</p>
          )}
          {attempts.length > 1 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">All recorded requests for this item</p>
              {attempts.map((a) => (
                <p key={a.id} className="text-xs">
                  {formatDateTime(a.requested_at)} — {label(OUTCOME_LABEL, a.outcome)}
                  {a.reason_code ? ` (${label(REASON_LABEL, a.reason_code)})` : ''}
                </p>
              ))}
            </div>
          )}
        </Section>

        {/* ORIGINAL AI OUTPUT */}
        <Section title="Original AI output">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              AI suggestion — requires human review. This is the untouched output as produced. It is not a
              regulatory finding, rating or decision, and it is stored immutably.
            </AlertDescription>
          </Alert>
          <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
            {insight ? (advisoryPlainText(insight.ai_output) || 'No narrative was recorded.') : 'No output was produced for this request.'}
          </div>
        </Section>

        {/* PROVENANCE */}
        <Section title="Provenance">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <F l="Records cited" v={String(citations.length)} />
            <F l="Confidence stated" v={insight?.confidence != null ? insight.confidence.toFixed(2) : 'Not stated'} />
            <F l="External data declaration" v="No external or web data was used" />
            <F l="Prepared at" v={insight ? formatDateTime(insight.generated_at) : 'Not prepared'} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uncertainty stated</p>
              <p className="mt-1 text-sm">{insight?.uncertainty?.trim() || 'Not stated.'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limitations stated</p>
              {(insight?.limitations ?? []).length === 0 ? (
                <p className="mt-1 text-sm">Not stated.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                  {(insight?.limitations ?? []).map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
            </div>
          </div>
        </Section>

        {/* HUMAN DECISION */}
        <Section title="Human decision">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={REVIEW_STATE_VARIANT[insight?.review_state ?? 'NOT_APPLICABLE'] ?? 'outline'}>
              {label(REVIEW_STATE_LABEL, insight?.review_state ?? 'NOT_APPLICABLE')}
            </Badge>
            {insight?.reviewed_at && <span className="text-xs text-muted-foreground">{formatDateTime(insight.reviewed_at)}</span>}
            {insight?.reviewed_by && <span className="text-xs text-muted-foreground">Recorded by a signed-in supervisor</span>}
          </div>
          {insight?.human_rationale && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rationale recorded by the supervisor</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{insight.human_rationale}</p>
            </div>
          )}
          {insight?.review_state === 'MODIFIED' && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI original</p>
                <div className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {advisoryPlainText(insight.ai_output) || 'No narrative recorded.'}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supervisor wording</p>
                <div className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm">
                  {advisoryPlainText(insight.human_output) || 'Not recorded.'}
                </div>
              </div>
            </div>
          )}
          {insight?.superseded_by_id && (
            <p className="mt-3 text-xs text-muted-foreground">This item was superseded by a later preparation.</p>
          )}
        </Section>

        {/* FRESHNESS */}
        <Section title="Freshness">
          {insight?.staleness_state === 'STALE' ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Underlying regulatory facts have changed since this assistance was prepared.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm">The facts used were unchanged at the last server check.</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Last checked by the server: {insight?.staleness_checked_at ? formatDateTime(insight.staleness_checked_at) : 'Not checked since preparation'}.
            Freshness is determined by the server from the facts signature; it cannot be declared from a browser.
          </p>
        </Section>

        {/* ASSURANCE */}
        <Section
          title="Assurance"
          action={insightId && canAssure && assurance.length === 0 ? (
            <Button data-rbac="ai_management.edit" size="sm" variant="outline" disabled={createAssurance.isPending}
              onClick={() => createAssurance.mutate({ insightId })}>
              {createAssurance.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start assurance review
            </Button>
          ) : undefined}
        >
          {assurance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assurance review has been carried out on this activity.</p>
          ) : (
            <div className="space-y-2">
              {assurance.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                  <span className="font-mono text-xs">{r.reference}</span>
                  <Badge variant="outline">{r.status}</Badge>
                  {r.conclusion && <Badge>{label(ASSESSMENT_LABEL, r.conclusion)}</Badge>}
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                  <Button asChild size="sm" variant="ghost" className="ml-auto">
                    <Link to={`/governance/ai/assurance/${r.id}`}>Open review</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            An assurance review never alters the AI output, its provenance or the supervisor's decision.
          </p>
        </Section>

        {/* HISTORY */}
        <Section title="History and audit">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No review events recorded.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="rounded border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{label(REVIEW_STATE_LABEL, e.to_state ?? e.action)}</Badge>
                    {e.from_state && (
                      <span className="text-xs text-muted-foreground">
                        from {label(REVIEW_STATE_LABEL, e.from_state)}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
                  </div>
                  {e.rationale && <p className="mt-1 text-sm whitespace-pre-wrap">{e.rationale}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </DashboardLayout>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base uppercase tracking-wide">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function F({ l, v, mono }: { l: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? 'break-all font-mono text-xs' : ''}`}>{v}</p>
    </div>
  );
}
