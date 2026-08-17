/**
 * Advisory AI panel — visually distinct, clearly labelled, always optional.
 *
 * The panel interprets facts the platform has already calculated. It never
 * shows a number the deterministic engines did not produce, never overrides a
 * score, band, severity or threshold state, and never triggers a workflow.
 *
 * Presentation only lives in `@/components/ai/report/AiReportKit`; the data
 * contract, hooks and feature flag behaviour are unchanged.
 */
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { PRUDENTIAL_ADVISORY_AI_ENABLED } from '@/lib/featureFlags';
import { usePrudentialAiAnalysis } from '@/hooks/usePrudentialAiAnalysis';
import {
  AiReportEmptyState,
  AiReportFocusAreas,
  AiReportFooter,
  AiReportLimitations,
  AiReportMetaChip,
  AiReportNotice,
  AiReportObservations,
  AiReportSection,
  AiReportShell,
  AiReportSkeleton,
  AiReportSummary,
} from '@/components/ai/report/AiReportKit';
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

  let sectionIndex = 0;

  return (
    <AiReportShell
      className={className}
      title={title}
      description={
        description ??
        'Interpretation of figures the system has already calculated. It does not change any score, indicator, threshold or decision.'
      }
      meta={
        hasContent && payload ? (
          <>
            {payload.confidence && (
              <AiReportMetaChip>{CONFIDENCE_LABEL[payload.confidence] ?? 'Limited confidence'}</AiReportMetaChip>
            )}
            {insight?.generated_at && <AiReportMetaChip>Produced {formatDateTime(insight.generated_at)}</AiReportMetaChip>}
            {insight?.period_key && <AiReportMetaChip>Period {insight.period_key}</AiReportMetaChip>}
          </>
        ) : undefined
      }
      actions={
        <>
          <Button
            size="sm"
            variant={hasContent ? 'outline' : 'default'}
            onClick={() => generate.mutate({ force: hasContent })}
            disabled={busy || !ready}
            title={!ready && disabledReason ? disabledReason : undefined}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasContent ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {busy ? 'Analysing…' : hasContent ? 'Refresh analysis' : 'Generate analysis'}
          </Button>
          {!ready && disabledReason && (
            <p className="max-w-xs text-right text-xs text-muted-foreground">{disabledReason}</p>
          )}
        </>
      }
    >
      {isLoading && !insight && <AiReportSkeleton />}

      {!isLoading && !insight && !busy && (
        <AiReportEmptyState message="No AI analysis has been produced for this view yet. All figures shown elsewhere on this page are calculated by the system and are independent of AI." />
      )}

      {isStale && insight && (
        <AiReportNotice tone="warning">
          The underlying supervisory data has changed since this analysis was produced. Refresh to interpret the current
          figures.
        </AiReportNotice>
      )}

      {stateMessage && !hasContent && <AiReportNotice>{stateMessage}</AiReportNotice>}

      {hasContent && payload && (
        <>
          {payload.summary && <AiReportSummary text={payload.summary} />}

          {SECTION_LABELS.map(({ key, label: sectionLabel }) => {
            const items = (payload[key] as AdvisoryObservation[] | undefined) ?? [];
            if (!items.length) return null;
            sectionIndex += 1;
            return (
              <AiReportSection
                key={key as string}
                index={sectionIndex}
                label={sectionLabel}
                sectionKey={key as string}
                count={items.length}
              >
                <AiReportObservations items={items} sectionKey={key as string} />
              </AiReportSection>
            );
          })}

          {!!payload.suggested_focus_areas?.length && (
            <AiReportFocusAreas
              items={payload.suggested_focus_areas}
              label="Suggested areas to look at (for supervisor consideration)"
              note="These are suggestions only. No action, alert or workflow step is created by this analysis."
            />
          )}

          {!!payload.limitations?.length && <AiReportLimitations items={payload.limitations} />}

          <AiReportFooter
            left={<span>This analysis is advisory and does not change any calculated value on this page.</span>}
            right={
              insight?.id ? (
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
              ) : undefined
            }
          />
        </>
      )}
    </AiReportShell>
  );
}
