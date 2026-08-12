/**
 * Shared advisory AI panel for supervisory modules.
 *
 * Visually distinct, clearly labelled, always optional and always collapsed
 * until a user asks for it. The panel renders interpretation, summarisation and
 * draft text only — it never displays a status, rating or decision as if the AI
 * produced it, and it never triggers a workflow action.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Loader2,
  Sparkles,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Flag,
  Info,
  ChevronDown,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { SUPERVISORY_ADVISORY_AI_ENABLED } from '@/lib/featureFlags';
import { useAdvisoryAiAnalysis } from '@/hooks/useAdvisoryAiAnalysis';
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
    const text = (payload?.draft_sections ?? [])
      .map((s) => `${s.heading}\n${s.text}`)
      .join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Draft text copied — paste it into the official field and edit as needed');
    } catch {
      toast.error('Could not copy the draft text');
    }
  };

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
            <p className="mt-1 text-xs text-muted-foreground">{description ?? ADVISORY_DISCLAIMER}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {askable && (
          <div className="space-y-2">
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
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {question.trim()
                  ? 'Press Ctrl/Cmd + Enter to ask.'
                  : 'Type a question above to enable the Ask button.'}
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
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
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

        {isLoading && !insight && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />Checking for a previous analysis…
          </p>
        )}

        {!isLoading && !insight && !busy && (
          <p className="text-sm text-muted-foreground">
            No AI analysis has been produced here yet. Everything else on this page comes from the official record and
            works independently of AI.
          </p>
        )}

        {isStale && insight && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            The record has changed since this analysis was produced. Refresh to interpret the current information.
          </div>
        )}

        {stateMessage && !hasContent && (
          <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">{stateMessage}</div>
        )}

        {hasContent && payload && (
          <>
            {payload.summary && <p className="text-sm leading-relaxed">{payload.summary}</p>}

            {SUPERVISORY_SECTIONS.map(({ key, label: sectionLabel }) => {
              const items = (payload[key] as AdvisoryObservation[] | undefined) ?? [];
              if (!items.length) return null;
              return (
                <div key={key as string} className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {sectionLabel}
                  </div>
                  <ObservationList items={items} />
                </div>
              );
            })}

            {!!payload.suggested_focus_areas?.length && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggestions for your consideration
                </div>
                <ul className="list-disc pl-5 text-sm">
                  {payload.suggested_focus_areas.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Suggestions only. No scope, finding, task, notice, action or workflow step is created by this analysis.
                </p>
              </div>
            )}

            {!!payload.draft_sections?.length && (
              <div className="space-y-2 rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Draft text — not saved anywhere
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copyDraft}>
                    <Copy className="mr-1 h-3.5 w-3.5" />Copy
                  </Button>
                </div>
                {payload.draft_sections.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-sm font-medium">{s.heading}</div>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.text}</p>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  This draft is suggested wording only. Copy it into the official field, review and edit it — you remain
                  the author, and approval stays with the normal process.
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
                  <Badge variant="secondary">{CONFIDENCE_LABEL[payload.confidence] ?? 'Evidence confidence: Limited'}</Badge>
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
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
