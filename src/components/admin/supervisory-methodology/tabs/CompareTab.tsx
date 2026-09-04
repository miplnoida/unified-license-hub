/**
 * Version comparison.
 *
 * The mapping is question-level and derives entirely from the recorded
 * predecessor mapping and change classification. Historical assessment
 * responses were NOT migrated between versions, and the screen states that
 * plainly rather than implying continuity.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { useSupervisoryMethodologyCompare } from '@/hooks/useSupervisoryMethodologyAdmin';
import { CountTile, EmptyPanel, ErrorPanel, OriginBadge, StatusBadge, humanize } from '../labels';

const GROUP_ORDER = ['KEEP', 'REWORD', 'SEMANTIC_CORRECTION', 'SPLIT', 'MERGE', 'MOVE_DIMENSION', 'NEW', 'RETIRED', 'UNCLASSIFIED'];

export function CompareTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologyCompare(methodologyId);

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (error) return <ErrorPanel error={error} />;
  if (!data) return <EmptyPanel title="Comparison is unavailable." />;
  if (!data.comparable) {
    return <EmptyPanel title="Comparison is unavailable for this version." description={data.reason} />;
  }

  const groups = [...(data.groups ?? [])].sort(
    (a, b) => GROUP_ORDER.indexOf(a.change_classification) - GROUP_ORDER.indexOf(b.change_classification),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {[data.baseline, data.target].map((m, i) => m ? (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {i === 0 ? 'Baseline' : 'This version'} — <span className="font-mono">{m.code} v{m.version}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={m.status} />
              <OriginBadge origin={m.origin} label={m.origin_label} />
              <Badge variant="outline">{m.dimension_count} dimensions</Badge>
              <Badge variant="outline">{m.question_count} questions</Badge>
            </CardContent>
          </Card>
        ) : null)}
      </div>

      {data.summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {Object.entries(data.summary).sort(
            (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
          ).map(([k, v]) => <CountTile key={k} label={humanize(k)} value={v} />)}
        </div>
      ) : null}

      <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{data.note}</p>

      <Accordion type="multiple" className="rounded-md border">
        {groups.map((g) => (
          <AccordionItem key={g.change_classification} value={g.change_classification}>
            <AccordionTrigger className="px-3 text-sm">
              <span className="flex items-center gap-2">
                <Badge variant="outline">{humanize(g.change_classification)}</Badge>
                <span className="text-muted-foreground">{g.count} {g.count === 1 ? 'question' : 'questions'}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3">
              <ul className="space-y-3">
                {g.questions.map((q) => (
                  <li key={q.question_code} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{q.question_code}</span>
                      <span className="text-xs text-muted-foreground">{q.dimension_code} · {q.dimension_label}</span>
                      {q.dimension_changed ? <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Dimension moved</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-foreground">{q.prompt}</p>
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Predecessor</p>
                      {q.predecessors?.length ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {q.predecessors.map((p) => (
                            <li key={p.question_code} className="text-xs text-muted-foreground">
                              <span className="font-mono">{p.question_code}</span> ({p.dimension_code}) — {p.prompt}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {g.change_classification === 'RETIRED' ? 'Not carried forward into this version.' : 'No predecessor recorded — new question.'}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
