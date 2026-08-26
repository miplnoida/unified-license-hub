/**
 * MC-11 — Governed AI narrative panel for supervisory management reporting.
 *
 * Sits below the deterministic management information and is visually separated
 * from it. Nothing here is management information: every figure a narrative may
 * state has already been calculated server-side, and the service rejects any
 * draft that states a figure the published measures do not support. Narratives
 * only enter a report through an explicit human adoption.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileCheck2, Loader2, Lock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ClassificationChip } from '@/components/conduct/three-sixty/ClassificationLegend';
import { AdvisoryCard } from '@/components/conduct/three-sixty/advisory/AdvisoryCard';
import { AdvisoryReviewDialog } from '@/components/conduct/three-sixty/advisory/AdvisoryReviewDialog';
import { NarrativeAdoptionDialog } from './NarrativeAdoptionDialog';
import {
  USE_CASE_META, type AdvisoryUseCase, type ReportingAdvisoryUseCase, type ReviewAction,
} from '@/lib/conductAdvisoryLabels';
import { useAdvisoryUseCases } from '@/hooks/useConductAdvisory';
import {
  useAdoptReportingNarrative, useGenerateReportingNarrative, useRefreshNarrativeFreshness,
  useReportingNarratives, useReviewReportingNarrative,
  type MIScope, type ReportingNarrative,
} from '@/hooks/useConductMI';

interface Props {
  scope: MIScope;
  /** Capabilities offered on this surface. */
  useCases: readonly ReportingAdvisoryUseCase[];
  /** Supervisors may commission and decide. View-only officers and auditors may not. */
  canOperate: boolean;
  /** Restricts the panel to one evidence pack version when set. */
  pack?: { id: string; version: number; reference: string } | null;
}

export function ReportingAdvisoryPanel({ scope, useCases, canOperate, pack = null }: Props) {
  const useCasesQuery = useAdvisoryUseCases();
  const narrativesQuery = useReportingNarratives(scope);
  const generate = useGenerateReportingNarrative(scope);
  const review = useReviewReportingNarrative(scope);
  const freshness = useRefreshNarrativeFreshness(scope);
  const adopt = useAdoptReportingNarrative(scope);

  const [failure, setFailure] = useState<{ message: string; detail?: string | null } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReportingNarrative | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [adoptTarget, setAdoptTarget] = useState<ReportingNarrative | null>(null);
  const [freshnessId, setFreshnessId] = useState<string | null>(null);

  const enabled = useMemo(() => {
    const rows = useCasesQuery.data ?? [];
    return new Set(rows.filter((r) => r.is_enabled).map((r) => r.code));
  }, [useCasesQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportingNarrative[]>();
    for (const row of narrativesQuery.data ?? []) {
      // A pack surface shows only narratives prepared for that pack version.
      if (pack) {
        const pop = (row.subject_population ?? {}) as Record<string, unknown>;
        if (String(pop.pack_id ?? '') !== pack.id) continue;
      }
      const list = map.get(row.use_case_code) ?? [];
      list.push(row);
      map.set(row.use_case_code, list);
    }
    return map;
  }, [narrativesQuery.data, pack]);

  const handleGenerate = async (code: ReportingAdvisoryUseCase) => {
    setFailure(null);
    setPending(code);
    try {
      const result = await generate.mutateAsync({
        useCaseCode: code,
        packId: pack?.id ?? null,
        packVersion: pack?.version ?? null,
      });
      if (result.ok === false) setFailure({ message: result.message, detail: result.detail ?? null });
      else toast.success(`${USE_CASE_META[code].label} drafted — awaiting your review.`);
    } catch {
      setFailure({
        message: 'AI narrative assistance is currently unavailable. The reported figures remain fully available.',
      });
    } finally {
      setPending(null);
    }
  };

  const handleReviewSubmit = async ({ action, rationale, humanText }: {
    action: ReviewAction; rationale?: string; humanText?: string;
  }) => {
    if (!reviewTarget) return;
    await review.mutateAsync({ insightId: reviewTarget.id, action, rationale, humanText });
    toast.success('Your supervisory decision has been recorded.');
  };

  const handleAdopt = async ({ section, rationale }: { section: string; rationale: string }) => {
    if (!adoptTarget) return;
    await adopt.mutateAsync({
      insightId: adoptTarget.id,
      section,
      rationale,
      packId: pack?.id ?? null,
      packVersion: pack?.version ?? null,
    });
    toast.success('The narrative has been adopted into the report section.');
  };

  const handleFreshness = async (narrative: ReportingNarrative) => {
    setFreshnessId(narrative.id);
    try {
      await freshness.mutateAsync(narrative.id);
    } catch {
      toast.error('The freshness of this narrative could not be checked.');
    } finally {
      setFreshnessId(null);
    }
  };

  const adoptable = (n: ReportingNarrative) =>
    ['ACCEPTED', 'MODIFIED'].includes(String(n.review_state ?? '')) && n.staleness_state !== 'STALE';

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-4 w-4 text-warning-foreground" />
              AI reporting assistance
            </CardTitle>
            <CardDescription>
              Draft narrative wording prepared strictly from the published measures{pack ? ` in ${pack.reference}` : ''}.
              It is drafting help for a supervisor — it is not management information, not a supervisory position and
              not a decision.
            </CardDescription>
          </div>
          <ClassificationChip type="AI_SUGGESTION" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Figures are never calculated here</AlertTitle>
          <AlertDescription className="text-xs">
            Every number a narrative may state is taken from the deterministic measures above and is checked against
            them before the draft is recorded. A draft that states an unsupported figure is rejected and never saved.
            Nothing in this panel changes a measure, a risk, a case, an evidence pack or any regulatory record.
          </AlertDescription>
        </Alert>

        {!canOperate && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription className="text-xs">
              View only. You can read recorded narratives, their provenance and the decisions taken on them, but you
              cannot commission drafting, record decisions or adopt wording into a report.
            </AlertDescription>
          </Alert>
        )}

        {failure && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">Nothing was recorded</AlertTitle>
            <AlertDescription className="space-y-1 text-xs">
              <p>{failure.message}</p>
              {failure.detail && <p className="opacity-80">{failure.detail}</p>}
            </AlertDescription>
          </Alert>
        )}

        {narrativesQuery.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Recorded narratives could not be loaded. The reported figures remain fully available.
            </AlertDescription>
          </Alert>
        )}

        {narrativesQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {useCases.map((code) => {
              const meta = USE_CASE_META[code as AdvisoryUseCase];
              const items = grouped.get(code) ?? [];
              const isEnabled = enabled.size === 0 ? true : enabled.has(code);
              const busy = pending === code;

              return (
                <section key={code} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                    <h3 className="text-sm font-semibold">{meta.label}</h3>
                    <Badge variant="outline" className="text-[11px]">
                      {items.length === 0 ? 'None drafted' : `${items.length} drafted`}
                    </Badge>
                    {!isEnabled && (
                      <Badge variant="outline" className="text-[11px]">Not currently approved for use</Badge>
                    )}
                    {canOperate && isEnabled && (
                      <Button size="sm" variant="outline" className="ml-auto" onClick={() => handleGenerate(code)} disabled={busy}>
                        {busy
                          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                        {items.length === 0 ? 'Draft wording' : 'Draft fresh wording'}
                      </Button>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{meta.purpose} Nothing has been drafted.</p>
                  ) : (
                    <div className="space-y-4">
                      {items.map((narrative) => (
                        <div key={narrative.id} className="space-y-2">
                          <AdvisoryCard
                            insight={narrative}
                            canReview={canOperate}
                            checkingFreshness={freshnessId === narrative.id}
                            onCheckFreshness={(i) => handleFreshness(i as ReportingNarrative)}
                            onReview={(target, action) => {
                              setReviewTarget(target as ReportingNarrative);
                              setReviewAction(action);
                            }}
                          />

                          <div className="flex flex-wrap items-center gap-2 pl-1">
                            {narrative.adoptions.length > 0 ? (
                              narrative.adoptions.map((a) => (
                                <Badge key={a.id} variant="secondary" className="text-[11px]">
                                  Adopted into “{a.section}”
                                </Badge>
                              ))
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Not adopted into any report section.
                              </span>
                            )}
                            {canOperate && adoptable(narrative) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-7 text-xs"
                                onClick={() => setAdoptTarget(narrative)}
                              >
                                <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                                Adopt into a report section
                              </Button>
                            )}
                          </div>
                        </div>
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

      <NarrativeAdoptionDialog
        open={Boolean(adoptTarget)}
        onOpenChange={(open) => { if (!open) setAdoptTarget(null); }}
        narrative={adoptTarget}
        submitting={adopt.isPending}
        onSubmit={handleAdopt}
      />
    </Card>
  );
}
