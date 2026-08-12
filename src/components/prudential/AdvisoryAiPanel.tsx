/**
 * Advisory AI panel — visually distinct, clearly labelled, always optional.
 *
 * The panel interprets facts the platform has already calculated. It never
 * shows a number the deterministic engines did not produce, never overrides a
 * score, band, severity or threshold state, and never triggers a workflow.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, Info, ChevronDown } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { PRUDENTIAL_ADVISORY_AI_ENABLED } from '@/lib/featureFlags';
import { usePrudentialAiAnalysis } from '@/hooks/usePrudentialAiAnalysis';
import {
  CONFIDENCE_LABEL,
  SECTION_LABELS,
  advisoryStateMessage,
  hasAdvisoryContent,
  type AdvisoryAnalysisType,
  type AdvisoryObservation,
} from '@/lib/prudential/advisoryAi';

interface Props {
  analysisType: AdvisoryAnalysisType;
  scope?: 'entity' | 'portfolio';
  scopeId?: string | null;
  periodKey?: string | null;
  /** Platform-calculated facts only — never raw records or peer identities. */
  facts: unknown;
  label?: string;
  title?: string;
  description?: string;
  /** Set false when the deterministic data behind the panel is still loading. */
  ready?: boolean;
  /** Plain-language reason shown when generation is unavailable. */
  disabledReason?: string;
  className?: string;
}


function ObservationList({ items }: { items: AdvisoryObservation[] }) {
  return (
    <ul className="space-y-2">
      {items.map((o, i) => (
        <li key={i} className="text-sm">
          <span>{o.text}</span>
          {!!o.evidence?.length && (
            <div className="mt-1 flex flex-wrap gap-1">
              {o.evidence.slice(0, 6).map((e, j) => (
                <span key={j} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {e}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AdvisoryAiPanel({
  analysisType,
  scope = 'entity',
  scopeId = null,
  periodKey = null,
  facts,
  label,
  title = 'AI-assisted analysis',
  description,
  ready = true,
  disabledReason,
  className,
}: Props) {

  const { insight, isStale, isLoading, generate, feedback } = usePrudentialAiAnalysis({
    analysisType,
    scope,
    scopeId,
    periodKey,
    facts,
    label,
    enabled: PRUDENTIAL_ADVISORY_AI_ENABLED && ready,
  });

  if (!PRUDENTIAL_ADVISORY_AI_ENABLED) return null;

  const payload = insight?.payload ?? null;
  const stateMessage = advisoryStateMessage(insight?.provider_state);
  const hasContent = hasAdvisoryContent(payload);
  const busy = generate.isPending;

  return (
    <Card className={cn('border-dashed border-primary/40 bg-primary/[0.03]', className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              {title}
              <Badge variant="outline" className="border-primary/40 text-primary">Advisory</Badge>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {description ??
                'Interpretation of figures the system has already calculated. It does not change any score, indicator, threshold or decision.'}
            </p>
          </div>
          <Button
            size="sm"
            variant={hasContent ? 'outline' : 'default'}
            onClick={() => generate.mutate({ force: hasContent })}
            disabled={busy || !ready}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : hasContent ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {busy ? 'Analysing…' : hasContent ? 'Refresh analysis' : 'Generate analysis'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && !insight && (
          <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />Checking for a previous analysis…</p>
        )}

        {!isLoading && !insight && !busy && (
          <p className="text-sm text-muted-foreground">
            No AI analysis has been produced for this view yet. All figures shown elsewhere on this page are calculated by the system and are independent of AI.
          </p>
        )}

        {isStale && insight && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            The underlying supervisory data has changed since this analysis was produced. Refresh to interpret the current figures.
          </div>
        )}

        {stateMessage && !hasContent && (
          <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">{stateMessage}</div>
        )}

        {hasContent && payload && (
          <>
            {payload.summary && <p className="text-sm leading-relaxed">{payload.summary}</p>}

            {SECTION_LABELS.map(({ key, label: sectionLabel }) => {
              const items = (payload[key] as AdvisoryObservation[] | undefined) ?? [];
              if (!items.length) return null;
              return (
                <div key={key as string} className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sectionLabel}</div>
                  <ObservationList items={items} />
                </div>
              );
            })}

            {!!payload.suggested_focus_areas?.length && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested areas to look at (for supervisor consideration)
                </div>
                <ul className="list-disc pl-5 text-sm">
                  {payload.suggested_focus_areas.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  These are suggestions only. No action, alert or workflow step is created by this analysis.
                </p>
              </div>
            )}

            {!!payload.limitations?.length && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground underline">
                  <Info className="h-3.5 w-3.5" /> What this analysis could not establish
                  <ChevronDown className="h-3.5 w-3.5" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {payload.limitations.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                {payload.confidence && (
                  <Badge variant="secondary">{CONFIDENCE_LABEL[payload.confidence] ?? 'Limited confidence'}</Badge>
                )}
                {insight?.generated_at && <span>Produced {formatDateTime(insight.generated_at)}</span>}
                {insight?.period_key && <span>· Period {insight.period_key}</span>}
              </div>
              {insight?.id && (
                <div className="flex items-center gap-1">
                  <span className="mr-1">Was this useful?</span>
                  <Button
                    size="sm"
                    variant={insight.feedback === 'helpful' ? 'default' : 'ghost'}
                    className="h-7 px-2"
                    onClick={() => feedback.mutate('helpful')}
                    disabled={feedback.isPending}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={insight.feedback === 'not_helpful' ? 'default' : 'ghost'}
                    className="h-7 px-2"
                    onClick={() => feedback.mutate('not_helpful')}
                    disabled={feedback.isPending}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
