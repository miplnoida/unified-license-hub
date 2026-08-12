/**
 * Read-only viewer for one stored AI advisory report.
 *
 * The drawer never generates, edits or approves anything — it renders the
 * stored analysis and links back to the authoritative source record where the
 * regulatory decision actually happens.
 */
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle, Clock } from 'lucide-react';
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
  analysisTypeLabel,
  providerStateBadge,
  subjectLabel,
  type SupervisoryAiReport,
} from '@/lib/ai/reportHub';
import { SUPERVISORY_SECTIONS, type AdvisoryObservation, type SupervisoryPayload } from '@/lib/ai/advisoryAi';
import { useSupervisoryAiReportDetail } from '@/hooks/useSupervisoryAiReports';

interface Props {
  report: SupervisoryAiReport | null;
  history?: SupervisoryAiReport[];
  onOpenChange: (open: boolean) => void;
  onSelectHistory?: (report: SupervisoryAiReport) => void;
}

/**
 * Legacy licensing/F&P AI rows store loosely-shaped objects. Render readable
 * wording instead of a raw object, without inventing content.
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
  const base = parts || JSON.stringify(item);
  return level ? `${base} (${String(level)})` : base;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function AiReportDetailDrawer({ report, history = [], onOpenChange, onSelectHistory }: Props) {
  const { data, isLoading, isError } = useSupervisoryAiReportDetail(report);

  const payload: SupervisoryPayload = (report?.source === 'ai_insights' ? (data as any)?.payload : null) ?? {};
  const legacy = report && report.source !== 'ai_insights' ? (data as any) : null;
  const stateBadge = providerStateBadge(report?.providerState);

  return (
    <Sheet open={!!report} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0">
        {report && (
          <div className="flex h-full flex-col">
            <SheetHeader className="space-y-2 border-b p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{HUB_MODULE_LABEL[report.module]}</Badge>
                <Badge variant="outline">{analysisTypeLabel(report.analysisType)}</Badge>
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
                    <AlertDescription>
                      This report could not be loaded. The source record is unaffected — you can still open it above.
                    </AlertDescription>
                  </Alert>
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
                  <Section title="Screening outcome">
                    <p className="text-sm">
                      {legacy.total_hits ?? 0} potential match(es) across {legacy.total_checks ?? 0} check(s). Review the
                      individual assessment for the confirmed outcome.
                    </p>
                  </Section>
                )}

                {history.length > 0 && (
                  <>
                    <Separator />
                    <Section title="Earlier versions of this analysis">
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
                    </Section>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
