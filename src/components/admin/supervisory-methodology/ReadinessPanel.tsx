/**
 * Layered review readiness.
 *
 * Ten independent governance layers, each with its own state — never collapsed
 * into a single traffic light, because "content complete" and "calculation
 * policy approved" are different decisions taken by different authorities.
 * Readiness is informational: the governed action RPCs remain the enforcement
 * point.
 */
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MethodologyReadiness } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, ReadinessStateBadge, humanize } from './labels';

function MetricList({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics ?? {}).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
  if (!entries.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {entries.map(([k, v]) => (
        <li key={k} className="text-xs text-muted-foreground">
          {humanize(k)}: <span className="font-mono text-foreground">{typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReadinessPanel({
  data,
  isLoading,
  error,
}: {
  data?: MethodologyReadiness;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} title="Readiness could not be assessed" />;
  if (!data?.layers?.length) return <EmptyPanel title="No readiness assessment is available for this version." />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Review readiness</CardTitle>
        <p className="text-sm text-muted-foreground">{data.note}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.layers.map((layer) => (
          <div key={layer.key} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{layer.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{layer.headline}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {layer.blocks_approval ? (
                  <span className="flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Blocks approval
                  </span>
                ) : null}
                <ReadinessStateBadge state={layer.state} />
              </div>
            </div>
            <MetricList metrics={layer.metrics} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
