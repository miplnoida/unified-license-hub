import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { useAmlPortfolio } from '@/hooks/useAmlSupervision';
import { NEUTRAL, ratingTone, titleCase, trendTone } from '@/lib/amlLabels';

const INHERENT = ['LOW', 'MEDIUM_LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH', 'SEVERE'];
const CONTROL = ['STRONG', 'EFFECTIVE', 'ACCEPTABLE', 'NEEDS_IMPROVEMENT', 'WEAK', 'INEFFECTIVE'];

const norm = (v?: string | null) => (v ?? '').toUpperCase();

export default function AmlRiskHeatmap() {
  const { data, isLoading, error } = useAmlPortfolio(300);
  const [sector, setSector] = useState('all');

  const rows = data ?? [];
  const sectors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sector_name).filter(Boolean))) as string[],
    [rows],
  );
  const filtered = useMemo(
    () => rows.filter((r) => sector === 'all' || r.sector_name === sector),
    [rows, sector],
  );

  const inherentAxis = useMemo(() => {
    const present = new Set(filtered.map((r) => norm(r.inherent_rating)).filter(Boolean));
    const ordered = INHERENT.filter((v) => present.has(v));
    const extra = Array.from(present).filter((v) => !INHERENT.includes(v));
    return [...ordered, ...extra];
  }, [filtered]);

  const controlAxis = useMemo(() => {
    const present = new Set(filtered.map((r) => norm(r.control_rating)).filter(Boolean));
    const ordered = CONTROL.filter((v) => present.has(v));
    const extra = Array.from(present).filter((v) => !CONTROL.includes(v));
    return [...ordered, ...extra];
  }, [filtered]);

  const cell = (inh: string, ctl: string) =>
    filtered.filter((r) => norm(r.inherent_rating) === inh && norm(r.control_rating) === ctl);

  const unrated = filtered.filter((r) => !norm(r.inherent_rating) || !norm(r.control_rating));

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Risk Heatmap"
          actions={
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sectors</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load the heatmap</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inherent risk × control effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : inherentAxis.length === 0 || controlAxis.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No rated AML/CFT assessments are available for this selection yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border p-2 text-left">Inherent ↓ / Control →</th>
                      {controlAxis.map((c) => (
                        <th key={c} className="border p-2 text-left">
                          {titleCase(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inherentAxis.map((inh) => (
                      <tr key={inh}>
                        <th className="border p-2 text-left align-top">
                          <Badge variant="outline" className={ratingTone(inh)}>
                            {titleCase(inh)}
                          </Badge>
                        </th>
                        {controlAxis.map((ctl) => {
                          const items = cell(inh, ctl);
                          return (
                            <td key={ctl} className="border p-2 align-top">
                              {items.length === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <div className="space-y-1">
                                  <div className="font-mono font-semibold">{items.length}</div>
                                  {items.slice(0, 4).map((r) => (
                                    <Link
                                      key={r.entity_id}
                                      to={r.last_assessment_id ? `/supervision/aml/assessments/${r.last_assessment_id}` : '/supervision/aml/entities'}
                                      className="block truncate underline-offset-2 hover:underline"
                                      title={r.entity_name ?? ''}
                                    >
                                      {r.entity_name}
                                    </Link>
                                  ))}
                                  {items.length > 4 ? (
                                    <span className="text-muted-foreground">+{items.length - 4} more</span>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rating movement watchlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              (() => {
                const moving = filtered.filter((r) => /DETERIOR|IMPROV/i.test(r.trend ?? ''));
                if (moving.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      No entity has recorded a rating movement in the current selection.
                    </p>
                  );
                }
                return moving.map((r) => (
                  <div key={r.entity_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <span className="font-medium">{r.entity_name}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className={NEUTRAL}>
                        {titleCase(r.prior_rating)} → {titleCase(r.residual_rating)}
                      </Badge>
                      <Badge variant="outline" className={trendTone(r.trend)}>
                        {titleCase(r.trend)}
                      </Badge>
                    </span>
                  </div>
                ));
              })()
            )}
          </CardContent>
        </Card>

        {unrated.length > 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{unrated.length} entit{unrated.length === 1 ? 'y' : 'ies'} not yet plotted</AlertTitle>
            <AlertDescription>
              These entities have no approved inherent or control rating yet, so they cannot be placed on the
              heatmap. Review their assessment coverage in{' '}
              <Link className="underline" to="/supervision/aml/entities">
                Supervised Entities
              </Link>
              .
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
