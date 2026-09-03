/**
 * EXEC-02 — the single AI narrative surface on the Executive Dashboard.
 *
 * Principle: "the arithmetic is deterministic; the narrative can be AI-assisted".
 * Nothing here produces a fact, a rule outcome, a supervisory priority or a
 * regulatory decision. The figures the model interprets are re-read server-side
 * from the canonical executive snapshot; this component only supplies the scope
 * (sector + window) and the snapshot fingerprint used for staleness.
 *
 * Colour contract used across the dashboard:
 *   recorded facts            → neutral / blue
 *   deterministic rule output → amber
 *   AI observations           → purple
 *   human-reviewed wording    → green
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Loader2,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  Check,
  X,
  Pencil,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatDateTime } from '@/lib/datetime';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { useAdvisoryAiAnalysis } from '@/hooks/useAdvisoryAiAnalysis';
import {
  AiReportEmptyState,
  AiReportLimitations,
  AiReportNotice,
  AiReportObservations,
  AiReportSection,
  AiReportSkeleton,
} from '@/components/ai/report/AiReportKit';
import {
  CONFIDENCE_LABEL,
  advisoryStateMessage,
  hasSupervisoryContent,
  type SupervisoryAnalysisType,
  type SupervisoryPayload,
} from '@/lib/ai/advisoryAi';
import {
  KPI_LABELS,
  describeSnapshotScope,
  type ExecutiveSnapshot,
  type ExecutiveSnapshotComparison,
  type ExecutiveSnapshotKpis,
  type KpiMovement,
} from '@/lib/dashboard/executiveSnapshot';

export const EXECUTIVE_AI_TITLE = 'AI-assisted Executive Briefing';
export const EXECUTIVE_AI_DISCLAIMER = 'Advisory AI — not a regulatory decision';
export const SUGGESTED_AREAS_LABEL = 'Suggested areas to review';
export const SUGGESTION_NOTE = 'No supervisory action is created by this suggestion';

type TabKey = 'executive_briefing' | 'what_changed' | 'suggested_priorities' | 'meeting_brief';

const TABS: Array<{ key: TabKey; label: string; action: string; blurb: string }> = [
  {
    key: 'executive_briefing',
    label: 'Executive briefing',
    action: 'Generate briefing',
    blurb: 'Narrative over the figures already shown above. Every number is calculated by the system, not by AI.',
  },
  {
    key: 'what_changed',
    label: 'What changed',
    action: 'Summarise what changed',
    blurb: 'Movement is only described when two comparable canonical snapshots exist.',
  },
  {
    key: 'suggested_priorities',
    label: SUGGESTED_AREAS_LABEL,
    action: 'Suggest areas to review',
    blurb: SUGGESTION_NOTE + '.',
  },
  {
    key: 'meeting_brief',
    label: 'Meeting brief',
    action: 'Draft talking points',
    blurb: 'Draft talking points to copy and edit. Nothing is written to any record.',
  },
];

export type ReviewState = 'pending' | 'accepted' | 'modified_accepted' | 'rejected' | 'stale';

const REVIEW_LABEL: Record<ReviewState, string> = {
  pending: 'Pending review',
  accepted: 'Accepted',
  modified_accepted: 'Modified and accepted',
  rejected: 'Rejected',
  stale: 'Stale / superseded',
};

const REVIEW_CLASS: Record<ReviewState, string> = {
  pending: 'border-purple-300 bg-purple-50 text-purple-900',
  accepted: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  modified_accepted: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  stale: 'border-amber-300 bg-amber-50 text-amber-900',
};

/** Review state shown to the user: staleness always wins over a stored state. */
export function resolveReviewState(
  storedStatus: string | null | undefined,
  isStale: boolean,
): ReviewState {
  if (isStale) return 'stale';
  const s = String(storedStatus ?? 'pending');
  if (s === 'accepted' || s === 'modified_accepted' || s === 'rejected') return s;
  return 'pending';
}

/** Only current, human-adopted output may appear in an approved executive pack. */
export function isAdoptedForApprovedPack(state: ReviewState): boolean {
  return state === 'accepted' || state === 'modified_accepted';
}

interface Props {
  snapshot: ExecutiveSnapshot;
  comparison: ExecutiveSnapshotComparison | null;
  comparisonAvailable: boolean;
  movements: KpiMovement[] | null;
  /** Lifted so Export briefing can include the active narrative + review state. */
  onNarrativeChange?: (info: {
    analysisType: TabKey;
    insightId: string | null;
    payload: SupervisoryPayload | null;
    humanPayload: SupervisoryPayload | null;
    reviewState: ReviewState;
    reviewerId: string | null;
    reviewedAt: string | null;
    generatedAt: string | null;
  }) => void;
  presentation?: boolean;
}

export function ExecutiveAiWorkspace({
  snapshot,
  comparison,
  comparisonAvailable,
  movements,
  onNarrativeChange,
  presentation = false,
}: Props) {
  const qc = useQueryClient();
  const { hasPermission } = useUserDynamicPermissions() as any;
  const canGenerate = !!hasPermission?.('ai_management', 'execute');
  const canReview = !!hasPermission?.('ai_management', 'approve');

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('executive_briefing');
  const [editing, setEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [rationale, setRationale] = useState('');

  const active = TABS.find((t) => t.key === tab)!;

  // The dashboard snapshot fingerprint is the staleness key: when the snapshot
  // moves, any existing narrative is marked stale rather than shown as current.
  const context = useMemo(
    () => ({
      snapshot_fingerprint: snapshot.fingerprint,
      as_of: snapshot.as_of,
      sector_id: snapshot.filters?.sector_id ?? null,
      window_days: snapshot.window?.days ?? 30,
      comparison_available: comparisonAvailable,
      comparison_as_of: comparison?.as_of ?? null,
    }),
    [snapshot, comparison, comparisonAvailable],
  );

  const { insight, isStale, isLoading, generate, feedback } = useAdvisoryAiAnalysis({
    module: 'executive',
    analysisType: tab as SupervisoryAnalysisType,
    scope: 'portfolio',
    stalenessFacts: snapshot.fingerprint,
    label: `Executive dashboard — ${describeSnapshotScope(snapshot)}`,
    enabled: open,
  });

  const raw = insight as any;
  const payload: SupervisoryPayload | null = (raw?.payload ?? null) as SupervisoryPayload | null;
  const humanPayload: SupervisoryPayload | null = (raw?.human_payload ?? null) as SupervisoryPayload | null;
  const reviewState = resolveReviewState(raw?.review_status, isStale);
  const hasContent = hasSupervisoryContent(payload);
  const stateMessage = advisoryStateMessage(raw?.provider_state);
  const shown = reviewState === 'modified_accepted' && humanPayload ? humanPayload : payload;

  // Keep the parent (export) in step with what is on screen.
  useMemo(() => {
    onNarrativeChange?.({
      analysisType: tab,
      insightId: raw?.id ?? null,
      payload,
      humanPayload,
      reviewState,
      reviewerId: raw?.reviewer_id ?? null,
      reviewedAt: raw?.reviewed_at ?? null,
      generatedAt: raw?.generated_at ?? null,
    });
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, raw?.id, reviewState, raw?.reviewed_at, payload, humanPayload]);

  const review = useMutation({
    mutationFn: async (vars: { decision: 'accepted' | 'modified_accepted' | 'rejected' }) => {
      if (!raw?.id) throw new Error('Nothing to review yet');
      const edited =
        vars.decision === 'modified_accepted'
          ? { ...(payload ?? {}), summary: editedSummary.trim() }
          : null;
      const { data, error } = await (supabase as any).rpc('ai_insight_executive_review', {
        _insight_id: raw.id,
        _decision: vars.decision,
        _human_payload: edited,
        _rationale: rationale.trim() || null,
        _snapshot_fingerprint: snapshot.fingerprint,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.decision === 'rejected'
          ? 'Recorded as rejected — it will not be included in an approved pack'
          : 'Recorded as reviewed and adopted',
      );
      setEditing(false);
      setRationale('');
      qc.invalidateQueries({ queryKey: ['supervisory_ai_insight', 'executive'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not record the review decision'),
  });

  const busy = generate.isPending;
  const comparisonBlocked = tab === 'what_changed' && !comparisonAvailable;

  const provenance = (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-900">
        Source snapshot {formatDateTime(snapshot.as_of)}
      </Badge>
      <Badge variant="outline">{describeSnapshotScope(snapshot)}</Badge>
      {raw?.generated_at && <Badge variant="outline">Generated {formatDateTime(raw.generated_at)}</Badge>}
      {payload?.confidence && (
        <Badge variant="outline">{CONFIDENCE_LABEL[payload.confidence] ?? 'Evidence confidence: Limited'}</Badge>
      )}
      <Badge variant="outline" className={REVIEW_CLASS[reviewState]}>
        {REVIEW_LABEL[reviewState]}
      </Badge>
      <Badge variant="outline" className={isStale ? 'border-amber-300 bg-amber-50 text-amber-900' : ''}>
        {isStale ? 'Stale — snapshot has moved on' : 'Current for this snapshot'}
      </Badge>
    </div>
  );

  return (
    <Card className="overflow-hidden border-purple-300/70" data-testid="executive-ai-workspace">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="border-b border-purple-200 bg-purple-50/60 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold sm:text-base">{EXECUTIVE_AI_TITLE}</h3>
                <Badge variant="outline" className="border-purple-400 bg-white text-[10px] uppercase text-purple-800">
                  {EXECUTIVE_AI_DISCLAIMER}
                </Badge>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground">
                Narrative assistance over the authoritative figures above. AI does not calculate any figure, assign a
                rating, set a supervisory priority or take a regulatory decision.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                {open ? 'Hide' : 'Open briefing workspace'}
                <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList className="flex-wrap">
                {TABS.map((t) => (
                  <TabsTrigger key={t.key} value={t.key} className="text-xs">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <p className="text-xs text-muted-foreground">{active.blurb}</p>
            {provenance}

            {!canGenerate && (
              <AiReportNotice tone="warning">
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> You do not hold the AI execution permission
                  (<code>ai_management.execute</code>), so narrative generation is unavailable. The figures above are
                  unaffected.
                </span>
              </AiReportNotice>
            )}

            {comparisonBlocked ? (
              <AiReportNotice tone="warning">
                <strong>Comparison unavailable.</strong> A second comparable canonical snapshot has not been recorded
                for this scope and window yet, so no movement can be stated.
              </AiReportNotice>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={hasContent ? 'outline' : 'default'}
                  disabled={!canGenerate || busy}
                  onClick={() => generate.mutate({ force: hasContent, question: null, context })}
                  title={!canGenerate ? 'Requires ai_management.execute' : undefined}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : hasContent ? (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {busy ? 'Analysing…' : hasContent ? 'Regenerate for this snapshot' : active.action}
                </Button>
                {tab === 'what_changed' && comparison && (
                  <span className="text-[11px] text-muted-foreground">
                    Comparing against the snapshot of {formatDateTime(comparison.as_of)}
                  </span>
                )}
              </div>
            )}

            {isLoading && !insight && <AiReportSkeleton />}

            {!isLoading && !insight && !busy && (
              <AiReportEmptyState message="No AI narrative has been produced for this snapshot. Everything above comes from the official record and works independently of AI." />
            )}

            {isStale && insight && (
              <AiReportNotice tone="warning">
                The dashboard snapshot has changed since this narrative was produced. It is marked stale and must not be
                presented as current.
              </AiReportNotice>
            )}

            {stateMessage && !hasContent && <AiReportNotice tone="warning">{stateMessage}</AiReportNotice>}

            {hasContent && shown && (
              <div className="space-y-4 rounded-lg border border-purple-200 bg-purple-50/40 p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-purple-800">
                  <ShieldAlert className="h-3.5 w-3.5" /> AI observation — advisory only
                </div>
                {shown.summary && <p className="text-sm leading-relaxed">{shown.summary}</p>}
                {!!shown.key_observations?.length && (
                  <AiReportSection label="Observations" sectionKey="key_observations" count={shown.key_observations.length}>
                    <AiReportObservations items={shown.key_observations as any} sectionKey="key_observations" />
                  </AiReportSection>
                )}
                {!!shown.suggested_focus_areas?.length && (
                  <AiReportSection label={SUGGESTED_AREAS_LABEL} count={shown.suggested_focus_areas.length}>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {shown.suggested_focus_areas.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-muted-foreground">{SUGGESTION_NOTE}.</p>
                  </AiReportSection>
                )}
                {!!shown.draft_sections?.length && (
                  <AiReportSection label="Draft wording">
                    <div className="space-y-2">
                      {shown.draft_sections.map((s, i) => (
                        <div key={i} className="rounded-md border bg-background p-3">
                          <div className="text-xs font-semibold">{s.heading}</div>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{s.text}</p>
                        </div>
                      ))}
                    </div>
                  </AiReportSection>
                )}
                {!!shown.limitations?.length && <AiReportLimitations items={shown.limitations} />}

                {reviewState === 'modified_accepted' && (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                    Human-reviewed and adopted wording. The original AI output is retained unchanged for audit.
                  </div>
                )}

                {/* Evidence used — the canonical snapshot the narrative was written over. */}
                <Collapsible>
                  <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/40">
                    Evidence used
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="space-y-2 text-xs">
                      <p className="text-muted-foreground">
                        Canonical snapshot {snapshot.fingerprint.slice(0, 12)} · as of {formatDateTime(snapshot.as_of)} ·{' '}
                        {describeSnapshotScope(snapshot)}
                      </p>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {(Object.keys(snapshot.kpis) as Array<keyof ExecutiveSnapshotKpis>).map((k) => (
                          <div key={k} className="flex items-center justify-between rounded border bg-background px-2 py-1">
                            <span className="text-muted-foreground">{KPI_LABELS[k]}</span>
                            <span className="font-mono">{String(snapshot.kpis[k])}</span>
                          </div>
                        ))}
                      </div>
                      {!!movements?.length && (
                        <div className="rounded border border-amber-300 bg-amber-50 p-2">
                          <div className="font-medium text-amber-900">Deterministic movement since the previous snapshot</div>
                          <ul className="mt-1 space-y-0.5">
                            {movements.slice(0, 10).map((m) => (
                              <li key={String(m.key)}>
                                {KPI_LABELS[m.key]}: {m.previous} → {m.current} ({m.delta > 0 ? '+' : ''}
                                {m.delta})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!presentation && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Link className="text-primary underline" to="/admin/applications">
                            Applications
                          </Link>
                          <Link className="text-primary underline" to="/complaints">
                            Complaints
                          </Link>
                          <Link className="text-primary underline" to="/supervision/breaches">
                            Breach inbox
                          </Link>
                          <Link className="text-primary underline" to="/returns/queue">
                            Returns queue
                          </Link>
                          <Link className="text-primary underline" to="/supervision/risk">
                            Risk ratings
                          </Link>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Human review — formal adoption. Distinct from usefulness feedback. */}
                {!presentation && (
                  <div className="space-y-2 rounded-md border bg-background p-3">
                    <div className="text-xs font-semibold">Human review</div>
                    {!canReview ? (
                      <p className="text-xs text-muted-foreground">
                        Recording a review decision requires <code>ai_management.approve</code>.
                      </p>
                    ) : editing ? (
                      <div className="space-y-2">
                        <Textarea
                          rows={4}
                          value={editedSummary}
                          onChange={(e) => setEditedSummary(e.target.value)}
                          placeholder="Adopted wording"
                        />
                        <Textarea
                          rows={2}
                          value={rationale}
                          onChange={(e) => setRationale(e.target.value)}
                          placeholder="Why the wording was changed (required, at least 10 characters)"
                        />
                        <div className="flex gap-2">
                          <Button
                            data-rbac="ai_management.approve"
                            size="sm"
                            disabled={review.isPending || rationale.trim().length < 10 || !editedSummary.trim()}
                            onClick={() => review.mutate({ decision: 'modified_accepted' })}
                          >
                            Save and accept with changes
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          data-rbac="ai_management.approve"
                          size="sm"
                          variant="outline"
                          disabled={review.isPending || isStale}
                          onClick={() => review.mutate({ decision: 'accepted' })}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" /> Accept
                        </Button>
                        <Button
                          data-rbac="ai_management.approve"
                          size="sm"
                          variant="outline"
                          disabled={isStale}
                          onClick={() => {
                            setEditedSummary(shown.summary ?? '');
                            setEditing(true);
                          }}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modify and accept
                        </Button>
                        <Button
                          data-rbac="ai_management.approve"
                          size="sm"
                          variant="outline"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ decision: 'rejected' })}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                    {raw?.reviewed_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Reviewed {formatDateTime(raw.reviewed_at)}
                        {raw?.review_rationale ? ` — ${raw.review_rationale}` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Usefulness feedback is NOT formal acceptance. */}
                {!presentation && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span>Usefulness feedback (not a formal review):</span>
                    <Button size="sm" variant="ghost" onClick={() => feedback.mutate('helpful')}>
                      <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> Helpful
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => feedback.mutate('not_helpful')}>
                      <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Not helpful
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
