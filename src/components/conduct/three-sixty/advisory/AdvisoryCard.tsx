/**
 * MC-07.5 — One governed AI advisory item.
 *
 * Every card states plainly that its content is an AI suggestion requiring human
 * review, carries its provenance, cites the records it relied on, and exposes the
 * supervisory decisions recorded against it. Nothing on this card changes a
 * regulatory record.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, CheckCircle2, ChevronDown, HelpCircle, ListChecks, Loader2, RefreshCcw } from 'lucide-react';
import { ClassificationChip } from '@/components/conduct/three-sixty/ClassificationLegend';
import { formatDateTime } from '@/lib/conductFactLabels';
import {
  ADVISORY_LABEL, REVIEW_ACTION_META, REVIEW_STATE_META, USE_CASE_META,
  confidenceLabel, reviewStateLabel, stalenessLabel,
  type AdvisoryUseCase, type ReviewAction, type ReviewState,
} from '@/lib/conductAdvisoryLabels';
import type { AdvisoryInsight } from '@/hooks/useConductAdvisory';
import { AdvisoryProvenance } from './AdvisoryProvenance';
import { CitationList } from './AdvisoryCitations';
import { HumanDecisionTrail } from './HumanDecisionTrail';
import { advisoryPlainText } from './advisoryText';

const TONE_CLASS: Record<'muted' | 'success' | 'warning' | 'danger', string> = {
  muted: 'bg-muted text-muted-foreground border-border',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning-foreground border-warning/30',
  danger: 'bg-destructive/10 text-destructive border-destructive/30',
};

interface Props {
  insight: AdvisoryInsight;
  canReview: boolean;
  onReview: (insight: AdvisoryInsight, action: ReviewAction) => void;
  onCheckFreshness: (insight: AdvisoryInsight) => void;
  checkingFreshness: boolean;
}

export function AdvisoryCard({ insight, canReview, onReview, onCheckFreshness, checkingFreshness }: Props) {
  const [showTrail, setShowTrail] = useState(false);
  const meta = USE_CASE_META[insight.use_case_code as AdvisoryUseCase];
  const output = insight.ai_output ?? {};
  const citations = insight.source_references ?? [];
  const reviewState = (insight.review_state ?? 'NOT_REVIEWED') as ReviewState;
  const stateMeta = REVIEW_STATE_META[reviewState] ?? REVIEW_STATE_META.NOT_REVIEWED;
  const isStale = (insight.staleness_state ?? 'CURRENT') === 'STALE';
  const isSuperseded = reviewState === 'SUPERSEDED';
  const approvedText = advisoryPlainText(insight.human_output);

  const actions: ReviewAction[] = isSuperseded
    ? []
    : reviewState === 'NOT_REVIEWED'
      ? ['accept', 'modify', 'reject']
      : ['modify', 'reject', 'supersede'];

  return (
    <Card className={isSuperseded ? 'opacity-70' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{meta?.label ?? 'Advisory'}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{meta?.purpose}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationChip type="AI_SUGGESTION" />
            <Badge variant="outline" className={TONE_CLASS[stateMeta.tone]}>{stateMeta.label}</Badge>
            <Badge variant="outline" className={isStale ? TONE_CLASS.warning : TONE_CLASS.muted}>
              {stalenessLabel(insight.staleness_state)}
            </Badge>
          </div>
        </div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-warning-foreground">{ADVISORY_LABEL}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {isStale && (
          <Alert variant="destructive" className="border-warning/40 bg-warning/10 text-warning-foreground">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Underlying facts have changed since this advisory was prepared
              {insight.staleness_checked_at ? ` (last checked ${formatDateTime(insight.staleness_checked_at)})` : ''}.
              Treat the wording as out of date and prepare fresh assistance before relying on it.
            </AlertDescription>
          </Alert>
        )}

        {/* Narrative */}
        {output.advisory_text?.trim() && (
          <div className="rounded-md border-l-2 border-warning/50 bg-warning/5 p-3">
            <p className="whitespace-pre-wrap text-sm">{output.advisory_text.trim()}</p>
            <div className="mt-2">
              <CitationList references={output.cited_references} citations={citations} />
            </div>
          </div>
        )}

        {(output.sections ?? []).length > 0 && (
          <div className="space-y-3">
            {(output.sections ?? []).map((section, i) => (
              <div key={i} className="rounded-md border p-3">
                {section.heading && <p className="text-sm font-semibold">{section.heading}</p>}
                {section.body && <p className="mt-1 whitespace-pre-wrap text-sm">{section.body}</p>}
                <div className="mt-2">
                  <CitationList references={section.cited_references} citations={citations} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Records suggested for supervisory attention */}
        {(output.records ?? []).length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Records suggested for review
            </p>
            <div className="mt-2 space-y-2">
              {(output.records ?? []).map((record, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CitationList references={record.reference ? [record.reference] : []} citations={citations} />
                  </div>
                  {record.reason_to_review && (
                    <p className="mt-1.5 text-sm">{record.reason_to_review}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Draft supervisory questions */}
        {(output.questions ?? []).length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <HelpCircle className="h-3.5 w-3.5" /> Draft questions for supervisory use
            </p>
            <ol className="mt-2 space-y-2">
              {(output.questions ?? []).map((q, i) => (
                <li key={i} className="rounded-md border p-3">
                  <p className="text-sm">{i + 1}. {q.question}</p>
                  <div className="mt-1.5">
                    <CitationList references={q.cited_references} citations={citations} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Hypotheses with disconfirming evidence */}
        {(output.hypotheses ?? []).length > 0 && (
          <div className="space-y-2">
            {(output.hypotheses ?? []).map((h, i) => (
              <div key={i} className="rounded-md border p-3">
                <p className="text-sm font-semibold">{h.hypothesis}</p>
                {h.supporting_observations && (
                  <p className="mt-1 text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">What points to it: </span>
                    {h.supporting_observations}
                  </p>
                )}
                {h.what_would_disconfirm && (
                  <p className="mt-1 text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">What would rule it out: </span>
                    {h.what_would_disconfirm}
                  </p>
                )}
                <div className="mt-2">
                  <CitationList references={h.cited_references} citations={citations} />
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs italic text-muted-foreground">{meta?.caveat}</p>

        <AdvisoryProvenance insight={insight} />

        {/* Human decision */}
        <Separator />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationChip type="HUMAN_DECISION" />
            <span className="text-sm font-semibold">{reviewStateLabel(insight.review_state)}</span>
            {insight.reviewed_at && (
              <span className="text-xs text-muted-foreground">on {formatDateTime(insight.reviewed_at)}</span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Confidence stated: {confidenceLabel(insight.confidence)}
            </span>
          </div>

          {approvedText && (
            <div className="rounded-md border-l-2 border-success/50 bg-success/5 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Supervisor-approved wording</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{approvedText}</p>
            </div>
          )}
          {insight.human_rationale && (
            <p className="text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Rationale: </span>
              {insight.human_rationale}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canReview ? (
              actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === 'accept' ? 'default' : 'outline'}
                  onClick={() => onReview(insight, action)}
                >
                  {action === 'accept' && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  {REVIEW_ACTION_META[action].label}
                </Button>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                View only — recording a supervisory decision on advisory content is not available to your role.
              </p>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCheckFreshness(insight)}
              disabled={checkingFreshness}
            >
              {checkingFreshness ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
              Check freshness
            </Button>
          </div>

          <Collapsible open={showTrail} onOpenChange={setShowTrail}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                Decision history ({insight.reviewEvents?.length ?? 0})
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <HumanDecisionTrail events={insight.reviewEvents ?? []} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
