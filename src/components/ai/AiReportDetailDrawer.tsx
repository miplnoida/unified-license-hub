/**
 * Read-only viewer for one stored AI advisory report.
 *
 * The drawer never generates, edits or approves anything — it renders the
 * stored analysis, its authorised version history and links back to the
 * authoritative source record where the regulatory decision actually happens.
 */
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/datetime';
import {
  CONFIDENCE_TEXT,
  FRESHNESS_LABEL,
  HUB_DISCLAIMER,
  HUB_MODULE_LABEL,
  REVIEW_STATUS_LABEL,
  analysisTypeLabel,
  reportStateBadge,
  subjectLabel,
  type SupervisoryAiReport,
} from '@/lib/ai/reportHub';
import { SUPERVISORY_SECTIONS, type AdvisoryObservation, type SupervisoryPayload } from '@/lib/ai/advisoryAi';
import {
  plainLanguageFromLegacyApplication,
  plainLanguageFromLegacyFpa,
  plainLanguageFromPayload,
  isEmptyPlainLanguage,
  type PlainLanguageBlock,
} from '@/lib/ai/reportPlainLanguage';
import {
  useSupervisoryAiReportDetail,
  useSupervisoryAiReportVersions,
} from '@/hooks/useSupervisoryAiReports';

interface Props {
  report: SupervisoryAiReport | null;
  onOpenChange: (open: boolean) => void;
  onSelectHistory?: (report: SupervisoryAiReport) => void;
}

/**
 * Legacy licensing/F&P AI rows store loosely-shaped objects. Render readable
 * wording instead of raw JSON, without inventing content.
 */
function legacyText(item: any): string {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  const label = item.title ?? item.issue ?? item.risk_type ?? item.category ?? item.field ?? null;
  const body = item.text ?? item.reason ?? item.description ?? item.detail ?? item.message ?? null;
  const level = item.level ?? item.severity ?? null;
  const parts = [label ? String(label).replace(/_/g, ' ') : null, body ? String(body) : null]
    .filter(Boolean)
    .join(' — ');
  const base = parts || 'Additional technical details are available in the source record.';
  return level ? `${base} (${String(level)})` : base;
}

/** Safe, humanised view of a Fit & Proper provider outcome — never raw JSON. */
function fpaOutcomeLines(outcomes: any): string[] {
  const list = Array.isArray(outcomes) ? outcomes : outcomes ? Object.values(outcomes) : [];
  return list
    .map((o: any) => {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      const provider = o.provider ?? o.source ?? o.name ?? null;
      const status = o.status ?? o.outcome ?? o.result ?? null;
      const hits = o.hits ?? o.match_count ?? o.matches ?? null;
      const when = o.checked_at ?? o.completed_at ?? null;
      const bits = [
        provider ? String(provider) : null,
        status ? `outcome: ${String(status)}` : null,
        hits != null ? `${hits} potential match(es)` : null,
        when ? `checked ${formatDateTime(when)}` : null,
      ].filter(Boolean);
      return bits.join(' · ');
    })
    .filter(Boolean);
}

function Bullets({ items }: { items?: AdvisoryObservation[] | string[] | null }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1.5 text-sm text-foreground">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted-foreground">•</span>
          <span>{typeof item === 'string' ? item : item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Plain-language opening block: the same stored content, arranged under the
 * questions a non-technical reader asks first. No new content is generated.
 */
function PlainLanguageSummary({ block }: { block: PlainLanguageBlock }) {
  if (isEmptyPlainLanguage(block)) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In plain language</p>
      {block.whatThisSays && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">What this says</p>
          <p className="text-sm text-foreground">{block.whatThisSays}</p>
        </div>
      )}
      {!!block.whyItMatters.length && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Why it matters</p>
          <ul className="mt-1 space-y-1 text-sm text-foreground">
            {block.whyItMatters.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!block.whatToLookAtNext.length && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">What to look at next</p>
          <ul className="mt-1 space-y-1 text-sm text-foreground">
            {block.whatToLookAtNext.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        This is advisory context only. The decision and the official record stay in the source module.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function AiReportDetailDrawer({ report, onOpenChange, onSelectHistory }: Props) {
  const { data, isLoading, isError, retry } = useSupervisoryAiReportDetail(report);
  const versionsQuery = useSupervisoryAiReportVersions(report?.versionKey ?? null);
  const history = versionsQuery.versions.filter((v) => v.id !== report?.id);

  const payload: SupervisoryPayload = (report?.source === 'ai_insights' ? (data as any)?.payload : null) ?? {};
  const legacy = report && report.source !== 'ai_insights' ? (data as any) : null;
  const stateBadge = reportStateBadge(report?.reportState);

  return (
    <Sheet open={!!report} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0">
        {report && (
          <div className="flex h-full flex-col">
            <SheetHeader className="space-y-2 border-b p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{HUB_MODULE_LABEL[report.module]}</Badge>
                <Badge variant="outline">{analysisTypeLabel(report.analysisType)}</Badge>
                {report.flagged && <Badge variant="destructive">Flagged for review</Badge>}
                {report.freshness === 'outdated' && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    {FRESHNESS_LABEL.outdated}
                  </Badge>
                )}
                {stateBadge && <Badge variant="outline">{stateBadge}</Badge>}
              </div>
              <SheetTitle className="text-left text-lg">{report.title}</SheetTitle>
              <SheetDescription className="text-left">
                {subjectLabel(report)} · Prepared {formatDateTime(report.generatedAt)}
                {report.confidence ? ` · ${CONFIDENCE_TEXT[report.confidence] ?? report.confidence}` : ''}
              </SheetDescription>
              {report.reviewStatus && REVIEW_STATUS_LABEL[report.reviewStatus] && (
                <p className="text-left text-xs text-muted-foreground">
                  Review status: {REVIEW_STATUS_LABEL[report.reviewStatus]} — dispositions are recorded in{' '}
                  <Link to="/analytics/ai-insights" className="underline">
                    AI Insight Review
                  </Link>
                  .
                </p>
              )}
              {report.sourceRoute && (
                <Button asChild size="sm" variant="outline" className="w-fit gap-1.5">
                  <Link to={report.sourceRoute}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {report.sourceActionLabel}
                  </Link>
                </Button>
              )}
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-5 p-6">
                <Alert>
                  <AlertDescription className="text-xs">{HUB_DISCLAIMER}</AlertDescription>
                </Alert>

                {report.freshness === 'outdated' && (
                  <Alert>
                    <AlertDescription className="text-xs">
                      Records connected to this analysis changed after it was prepared, so parts of it may be out of
                      date. Open the source record above for the current position.
                    </AlertDescription>
                  </Alert>
                )}

                {isLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                )}

                {isError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        This report could not be loaded — that is a loading problem, not an empty report. The source
                        record is unaffected.
                      </span>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => retry()}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try again
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {!isLoading && !isError && (
                  <PlainLanguageSummary
                    block={
                      report.source === 'ai_insights'
                        ? plainLanguageFromPayload(payload)
                        : report.source === 'fpa'
                          ? plainLanguageFromLegacyFpa(legacy)
                          : plainLanguageFromLegacyApplication(legacy)
                    }
                  />
                )}

                {!isLoading && !isError && report.source === 'ai_insights' && (
                  <>
                    {payload.summary && <Section title="Summary"><p className="text-sm">{payload.summary}</p></Section>}
                    {!!payload.facts?.length && (
                      <Section title="Information used"><Bullets items={payload.facts} /></Section>
                    )}
                    {!!payload.interpretation?.length && (
                      <Section title="What this may mean"><Bullets items={payload.interpretation} /></Section>
                    )}
                    {SUPERVISORY_SECTIONS.map(({ key, label }) => {
                      const items = payload[key] as AdvisoryObservation[] | undefined;
                      if (!items?.length) return null;
                      return (
                        <Section key={String(key)} title={label}>
                          <Bullets items={items} />
                        </Section>
                      );
                    })}
                    {!!payload.suggested_focus_areas?.length && (
                      <Section title="Suggested areas to look at">
                        <Bullets items={payload.suggested_focus_areas} />
                      </Section>
                    )}
                    {!!payload.draft_sections?.length && (
                      <Section title="Draft text (for the officer to edit)">
                        <div className="space-y-3">
                          {payload.draft_sections.map((s, i) => (
                            <div key={i} className="rounded-md border p-3">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">{s.heading}</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm">{s.text}</p>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                    {!!payload.limitations?.length && (
                      <Section title="Limitations"><Bullets items={payload.limitations} /></Section>
                    )}
                    {(data as any)?.recommendation && (
                      <Section title="Suggestion for the reviewer">
                        <p className="text-sm">{(data as any).recommendation}</p>
                      </Section>
                    )}
                  </>
                )}

                {!isLoading && !isError && legacy && report.source === 'application_assessment' && (
                  <>
                    {legacy.summary && <Section title="Summary"><p className="text-sm">{legacy.summary}</p></Section>}
                    {!!legacy.findings?.length && (
                      <Section title="What the assessment noted">
                        <Bullets items={legacy.findings.map((f: any) => ({ text: legacyText(f) }))} />
                      </Section>
                    )}
                    {!!legacy.risks?.length && (
                      <Section title="Possible risks">
                        <Bullets items={legacy.risks.map((f: any) => ({ text: legacyText(f) }))} />
                      </Section>
                    )}
                    {!!legacy.missing_information?.length && (
                      <Section title="Information that appears missing">
                        <Bullets items={legacy.missing_information.map((f: any) => ({ text: legacyText(f) }))} />
                      </Section>
                    )}
                  </>
                )}

                {!isLoading && !isError && legacy && report.source === 'fpa' && (
                  <>
                    <Section title="Screening outcome">
                      <p className="text-sm">
                        {legacy.total_hits ?? 0} potential match(es) across {legacy.total_checks ?? 0} check(s). This
                        source records adverse-media screening analysis rather than a narrative AI report.
                      </p>
                    </Section>
                    {!!fpaOutcomeLines(legacy.provider_outcomes).length && (
                      <Section title="What each check returned">
                        <Bullets items={fpaOutcomeLines(legacy.provider_outcomes)} />
                      </Section>
                    )}
                    {legacy.error && (
                      <Section title="Screening problem reported">
                        <p className="text-sm">{String(legacy.error)}</p>
                      </Section>
                    )}
                  </>
                )}

                <Separator />
                <Section title="Earlier versions of this analysis">
                  {versionsQuery.isLoading && <Skeleton className="h-8 w-full" />}
                  {versionsQuery.isError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                        <span>Version history could not be loaded.</span>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => versionsQuery.retry()}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Try again
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  {!versionsQuery.isLoading && !versionsQuery.isError && !history.length && (
                    <p className="text-sm text-muted-foreground">This is the only version of this analysis.</p>
                  )}
                  {!!history.length && (
                    <div className="space-y-1.5">
                      {history.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => onSelectHistory?.(h)}
                          className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDateTime(h.generatedAt)}
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
