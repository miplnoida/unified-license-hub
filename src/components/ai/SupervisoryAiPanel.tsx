/**
 * Shared advisory AI panel for supervisory modules.
 *
 * Visually distinct, clearly labelled, always optional and always collapsed
 * until a user asks for it. The panel renders interpretation, summarisation and
 * draft text only — it never displays a status, rating or decision as if the AI
 * produced it, and it never triggers a workflow action.
 *
 * Presentation lives in `./report/AiReportKit`; the data contract, hooks and
 * feature flag behaviour are unchanged.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, Flag, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { SUPERVISORY_ADVISORY_AI_ENABLED } from '@/lib/featureFlags';
import { useAdvisoryAiAnalysis } from '@/hooks/useAdvisoryAiAnalysis';
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
} from './report/AiReportKit';
import {
  ADVISORY_DISCLAIMER,
  CONFIDENCE_LABEL,
  SUPERVISORY_SECTIONS,
  advisoryStateMessage,
  hasSupervisoryContent,
  type AdvisoryModule,
  type AdvisoryObservation,
  type SupervisoryAnalysisType,
} from '@/lib/ai/advisoryAi';

interface Props {
  module: AdvisoryModule;
  analysisType: SupervisoryAnalysisType;
  scopeId?: string | null;
  scope?: 'record' | 'entity' | 'portfolio';
  periodKey?: string | null;
  /** Small marker of the on-screen data, used only for staleness detection. */
  stalenessFacts?: unknown;
  label?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  /** Set false while the deterministic data behind the panel is still loading. */
  ready?: boolean;
  disabledReason?: string;
  /** Show a free-text question box (governed natural-language enquiry). */
  askable?: boolean;
  /**
   * On-screen context (filters, window, displayed aggregates) so the analysis
   * describes exactly what the user is looking at. Never record data.
   */
  context?: unknown;
  className?: string;
}

export function SupervisoryAiPanel({
  module,
  analysisType,
  scopeId = null,
  scope = 'record',
  periodKey = null,
  stalenessFacts,
  label,
  title = 'AI-assisted analysis',
  description,
  actionLabel,
  ready = true,
  disabledReason,
  askable = false,
  context,
  className,
}: Props) {
  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);

  const { insight, isStale, isLoading, generate, feedback } = useAdvisoryAiAnalysis({
    module,
    analysisType,
    scope,
    scopeId,
    periodKey,
    stalenessFacts,
    label,
    enabled: SUPERVISORY_ADVISORY_AI_ENABLED && ready,
  });

  if (!SUPERVISORY_ADVISORY_AI_ENABLED) return null;

  const payload = insight?.payload ?? null;
  const stateMessage = advisoryStateMessage(insight?.provider_state);
  const hasContent = hasSupervisoryContent(payload);
  const busy = generate.isPending;
  const generateLabel = actionLabel ?? 'Generate analysis';

  const canAsk = !busy && ready && !!question.trim();

  const runAsk = () => {
    if (!canAsk) return;
    const q = question.trim();
    setAskedQuestion(q);
    generate.mutate({ force: true, question: q, context });
  };

  const copyDraft = async () => {
    const text = (payload?.draft_sections ?? []).map((s) => `${s.heading}\n${s.text}`).join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Draft text copied — paste it into the official field and edit as needed');
    } catch {
      toast.error('Could not copy the draft text');
    }
  };

  let sectionIndex = 0;

  return (
    <AiReportShell
      className={className}
      title={title}
      description={description ?? ADVISORY_DISCLAIMER}
      meta={
        hasContent && payload ? (
          <>
            {payload.confidence && (
              <AiReportMetaChip>
                {CONFIDENCE_LABEL[payload.confidence] ?? 'Evidence confidence: Limited'}
              </AiReportMetaChip>
            )}
            {insight?.generated_at && <AiReportMetaChip>Produced {formatDateTime(insight.generated_at)}</AiReportMetaChip>}
            {insight?.period_key && <AiReportMetaChip>Period {insight.period_key}</AiReportMetaChip>}
          </>
        ) : undefined
      }
      actions={
        <>
          {!askable && (
            <Button
              size="sm"
              variant={hasContent ? 'outline' : 'default'}
              onClick={() => generate.mutate({ force: hasContent, question: null, context })}
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
              {busy ? 'Analysing…' : hasContent ? 'Refresh analysis' : generateLabel}
            </Button>
          )}
          {!ready && disabledReason && (
            <p className="max-w-xs text-right text-xs text-muted-foreground">{disabledReason}</p>
          )}
        </>
      }
    >
      {askable && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                runAsk();
              }
            }}
            placeholder="Ask about this entity's supervisory record, e.g. what has changed since the last examination?"
            rows={2}
            className="bg-background"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {question.trim() ? 'Press Ctrl/Cmd + Enter to ask.' : 'Type a question above to enable the Ask button.'}
            </p>
            <Button
              size="sm"
              onClick={runAsk}
              disabled={!canAsk}
              title={
                !ready
                  ? disabledReason ?? 'Waiting for the entity record to finish loading'
                  : !question.trim()
                    ? 'Type a question first'
                    : undefined
              }
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {busy ? 'Asking…' : hasContent ? 'Ask again' : actionLabel ?? 'Ask'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Answers use only records you are already permitted to see. Nothing you ask changes any record.
          </p>
          {askedQuestion && hasContent && !busy && (
            <div className="rounded-md border bg-background p-2 text-xs">
              <span className="font-medium">You asked:</span> {askedQuestion}
            </div>
          )}
        </div>
      )}

      {isLoading && !insight && <AiReportSkeleton />}

      {!isLoading && !insight && !busy && (
        <AiReportEmptyState message="No AI analysis has been produced here yet. Everything else on this page comes from the official record and works independently of AI." />
      )}

      {isStale && insight && (
        <AiReportNotice tone="warning">
          The record has changed since this analysis was produced. Refresh to interpret the current information.
        </AiReportNotice>
      )}

      {stateMessage && !hasContent && <AiReportNotice>{stateMessage}</AiReportNotice>}

      {hasContent && payload && (
        <>
          {payload.summary && <AiReportSummary text={payload.summary} />}

          {SUPERVISORY_SECTIONS.map(({ key, label: sectionLabel }) => {
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
              label="Suggestions for your consideration"
              note="Suggestions only. No scope, finding, task, notice, action or workflow step is created by this analysis."
            />
          )}

          {!!payload.draft_sections?.length && (
            <AiReportSection label="Draft text — not saved anywhere" sectionKey="key_observations">
              <div className="space-y-3 rounded-lg border bg-card/60 p-3">
                <div className="flex items-center justify-end">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copyDraft}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                {payload.draft_sections.map((s, i) => (
                  <div key={i} className="space-y-1 border-l-2 border-primary/30 pl-3">
                    <div className="text-sm font-semibold">{s.heading}</div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  This draft is suggested wording only. Copy it into the official field, review and edit it — you remain
                  the author, and approval stays with the normal process.
                </p>
              </div>
            </AiReportSection>
          )}

          {!!payload.limitations?.length && <AiReportLimitations items={payload.limitations} />}

          <AiReportFooter
            left={<span>{ADVISORY_DISCLAIMER}</span>}
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
                  <Button
                    size="sm"
                    variant={insight.feedback === 'flagged' ? 'default' : 'ghost'}
                    className="h-7 px-2"
                    title="Flag this analysis as incorrect"
                    onClick={() => feedback.mutate('flagged')}
                    disabled={feedback.isPending}
                  >
                    <Flag className="h-3.5 w-3.5" />
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
