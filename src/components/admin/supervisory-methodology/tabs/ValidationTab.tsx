/**
 * Content validation.
 *
 * Findings come from `supervisory_methodology_validate`. They are informational:
 * the governed action operations remain the enforcement point, so a blocking
 * finding is a statement about content, not a client-side gate.
 */
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupervisoryMethodologyValidation } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, humanize } from '../labels';

export function ValidationTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologyValidation(methodologyId);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} title="Validation could not be run" />;
  if (!data) return <EmptyPanel title="No validation result is available for this version." />;

  const blocking = data.findings.filter((f) => f.severity === 'BLOCKING');
  const advisory = data.findings.filter((f) => f.severity !== 'BLOCKING');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Content validation</CardTitle>
          <p className="text-sm text-muted-foreground">{data.note}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={blocking.length ? 'destructive' : 'secondary'}>
            {blocking.length} blocking
          </Badge>
          <Badge variant="outline">{advisory.length} advisory</Badge>
          <Badge variant="outline">Status {humanize(data.status)}</Badge>
        </CardContent>
      </Card>

      {data.findings.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            No content issue was found in this version.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...blocking, ...advisory].map((f) => (
            <div key={`${f.code}-${f.subject ?? ''}`} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {f.severity === 'BLOCKING'
                      ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                      : <Info className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    {humanize(f.code)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{f.message}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{humanize(f.object)}</Badge>
                  {f.subject ? <Badge variant="secondary" className="font-mono text-[11px]">{f.subject}</Badge> : null}
                  <span className="font-mono text-xs text-muted-foreground">{f.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
