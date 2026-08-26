/**
 * MC-07.5 — AI advisory panel inside Conduct 360.
 *
 * Sits below the fact layer, clearly separated from it. Offers the five approved
 * advisory types, and never presents advisory wording as a fact, rule outcome or
 * regulatory decision. If assistance cannot be prepared, the panel degrades to a
 * plain unavailable state and the fact view above is untouched.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Lock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Conduct360WindowChoice } from '@/hooks/useConduct360';
import {
  useAdvisoryInsights, useAdvisoryUseCases, useGenerateAdvisory,
  useRefreshAdvisoryFreshness, useReviewAdvisory, type AdvisoryInsight,
} from '@/hooks/useConductAdvisory';
import {
  ADVISORY_USE_CASES, USE_CASE_META, type AdvisoryUseCase, type ReviewAction,
} from '@/lib/conductAdvisoryLabels';
import { ClassificationChip } from '@/components/conduct/three-sixty/ClassificationLegend';
import { AdvisoryCard } from './AdvisoryCard';
import { AdvisoryReviewDialog } from './AdvisoryReviewDialog';

interface Props {
  entityId: string | undefined;
  windowChoice: Conduct360WindowChoice;
  /** Supervisor may ask for assistance and record decisions. Auditors may not. */
  canOperate: boolean;
}

export function AdvisoryPanel({ entityId, windowChoice, canOperate }: Props) {
  const useCasesQuery = useAdvisoryUseCases();
  const insightsQuery = useAdvisoryInsights(entityId, windowChoice);
  const generate = useGenerateAdvisory(entityId, windowChoice);
  const review = useReviewAdvisory(entityId, windowChoice);
  const freshness = useRefreshAdvisoryFreshness(entityId, windowChoice);

  const [failure, setFailure] = useState<string | null>(null);
  const [pendingUseCase, setPendingUseCase] = useState<AdvisoryUseCase | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AdvisoryInsight | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [freshnessId, setFreshnessId] = useState<string | null>(null);

  const enabled = useMemo(() => {
    const rows = useCasesQuery.data ?? [];
    return new Set(rows.filter((r) => r.is_enabled).map((r) => r.code));
  }, [useCasesQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<AdvisoryUseCase, AdvisoryInsight[]>();
    for (const insight of insightsQuery.data ?? []) {
      const code = insight.use_case_code as AdvisoryUseCase;
      const list = map.get(code) ?? [];
      list.push(insight);
      map.set(code, list);
    }
    return map;
  }, [insightsQuery.data]);

  const handleGenerate = async (code: AdvisoryUseCase) => {
    setFailure(null);
    setPendingUseCase(code);
    try {
      const result = await generate.mutateAsync(code);
      if (!result.ok) setFailure(result.message);
      else toast.success(`${USE_CASE_META[code].label} prepared — awaiting your review.`);
    } catch {
      setFailure('AI assistance is currently unavailable. The Conduct 360 facts above remain fully available.');
    } finally {
      setPendingUseCase(null);
    }
  };

  const handleReviewSubmit = async ({ action, rationale, humanText }: { action: ReviewAction; rationale?: string; humanText?: string }) => {
    if (!reviewTarget) return;
    await review.mutateAsync({ insightId: reviewTarget.id, action, rationale, humanText });
    toast.success('Your supervisory decision has been recorded.');
  };

  const handleFreshness = async (insight: AdvisoryInsight) => {
    setFreshnessId(insight.id);
    try {
      await freshness.mutateAsync(insight.id);
    } catch {
      toast.error('The freshness of this advisory could not be checked.');
    } finally {
      setFreshnessId(null);
    }
  };

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-4 w-4 text-warning-foreground" />
              AI supervisory assistance
            </CardTitle>
            <CardDescription>
              Advisory narrative prepared from the recorded facts above. It is drafting help for a supervisor — it is not
              a fact, not a rule outcome and not a regulatory decision.
            </CardDescription>
          </div>
          <ClassificationChip type="AI_SUGGESTION" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Everything here requires human review</AlertTitle>
          <AlertDescription className="text-xs">
            Nothing in this panel changes a risk rating, case status, investigation, outcome or any other regulatory
            record. Suggestions must be accepted, modified or rejected by an authorised supervisor before being relied on.
          </AlertDescription>
        </Alert>

        {!canOperate && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription className="text-xs">
              View only. You can read advisory content, its provenance and the decisions recorded against it, but you
              cannot prepare new assistance or record decisions.
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

        {insightsQuery.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Advisory content could not be loaded. The Conduct 360 facts above remain fully available.
            </AlertDescription>
          </Alert>
        )}

        {insightsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {ADVISORY_USE_CASES.map((code) => {
              const meta = USE_CASE_META[code];
              const items = grouped.get(code) ?? [];
              const isEnabled = enabled.size === 0 ? true : enabled.has(code);
              const busy = pendingUseCase === code;

              return (
                <section key={code} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                    <h3 className="text-sm font-semibold">{meta.label}</h3>
                    <Badge variant="outline" className="text-[11px]">
                      {items.length === 0 ? 'None prepared' : `${items.length} prepared`}
                    </Badge>
                    {!isEnabled && (
                      <Badge variant="outline" className="text-[11px]">Not currently approved for use</Badge>
                    )}
                    {canOperate && isEnabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        onClick={() => handleGenerate(code)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                        {items.length === 0 ? 'Prepare assistance' : 'Prepare fresh assistance'}
                      </Button>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {meta.purpose} No assistance has been prepared for this window.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {items.map((insight) => (
                        <AdvisoryCard
                          key={insight.id}
                          insight={insight}
                          canReview={canOperate}
                          checkingFreshness={freshnessId === insight.id}
                          onCheckFreshness={handleFreshness}
                          onReview={(target, action) => {
                            setReviewTarget(target);
                            setReviewAction(action);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </CardContent>

      <AdvisoryReviewDialog
        open={Boolean(reviewTarget && reviewAction)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null);
            setReviewAction(null);
          }
        }}
        insight={reviewTarget}
        action={reviewAction}
        submitting={review.isPending}
        onSubmit={handleReviewSubmit}
      />
    </Card>
  );
}
