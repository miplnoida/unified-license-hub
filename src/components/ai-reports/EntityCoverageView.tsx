/**
 * Entity coverage view for the Supervisory AI Reports hub.
 *
 * Shows, for one supervised entity, whether an AI analysis exists in each of the
 * six supervisory areas — filings, prudential risk, inspections, complaints and
 * conduct, supervisory actions, and entity history. Read-only: gaps are shown
 * honestly with a link to the module where an officer generates the analysis.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/datetime';
import { useEntityAiCoverage } from '@/hooks/useSupervisoryAiReports';
import { groupReportsByArea } from '@/lib/ai/reportPlainLanguage';
import {
  CONFIDENCE_TEXT,
  FRESHNESS_LABEL,
  HUB_MODULE_LABEL,
  analysisTypeLabel,
  needsAttention,
  type SupervisoryAiReport,
} from '@/lib/ai/reportHub';


interface Props {
  entityId: string | null;
  entityName?: string | null;
  onOpen: (report: SupervisoryAiReport) => void;
}

export function EntityCoverageView({ entityId, entityName, onOpen }: Props) {
  const { reports, isLoading, isError, retry } = useEntityAiCoverage(entityId);

  if (!entityId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="font-medium text-foreground">Choose an entity to see its supervisory picture</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            Pick an entity in the Entity filter above. This view then connects its filings, prudential risk,
            inspections, complaints, supervisory actions and history in one place, and shows where no analysis
            exists yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>This entity’s reports could not be loaded — the entity record itself is unaffected.</span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => retry()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const grouped = groupReportsByArea(reports);
  const covered = grouped.filter((g) => g.latest).length;
  const attention = reports.filter(needsAttention).length;

  const stats = [
    { label: 'Reports available', value: reports.length },
    { label: 'Supervisory areas covered', value: `${covered} of ${grouped.length}` },
    { label: 'Areas with no report yet', value: grouped.length - covered },
    { label: 'Reports needing attention', value: attention },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-none">
        <CardContent className="space-y-4 p-5">
          <p className="font-semibold text-foreground">{entityName ?? 'Selected organisation'}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


      {grouped.map(({ area, latest, total }) => (
        <Card key={area.key}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              {latest ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              {area.label}
              {total > 1 && <Badge variant="secondary">{total} reports</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{area.description}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {latest ? (
              <>
                <p className="text-sm font-medium text-foreground">{latest.title}</p>
                <p className="text-xs text-muted-foreground">
                  {HUB_MODULE_LABEL[latest.module]} · {analysisTypeLabel(latest.analysisType)} · Prepared{' '}
                  {formatDateTime(latest.generatedAt)}
                  {latest.confidence ? ` · ${CONFIDENCE_TEXT[latest.confidence] ?? latest.confidence}` : ''}
                  {latest.freshness === 'outdated' ? ` · ${FRESHNESS_LABEL.outdated}` : ''}
                </p>
                {latest.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{latest.summary}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => onOpen(latest)}>
                    <FileText className="h-3.5 w-3.5" />
                    View report
                  </Button>
                  {latest.sourceRoute && (
                    <Button size="sm" variant="ghost" asChild className="gap-1.5">
                      <Link to={latest.sourceRoute}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        {latest.sourceActionLabel}
                      </Link>
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No AI analysis has been prepared for this area yet. Analyses are produced by officers inside the
                  module, then appear here.
                </p>
                <Button size="sm" variant="outline" asChild className="gap-1.5">
                  <Link to={area.generateRoute(entityId)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {area.generateLabel}
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
