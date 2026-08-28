/**
 * GAP-F1-04 — Service configuration completeness.
 *
 * Read-only certification surface: for every regulatory service, each of the
 * five configuration dimensions is classified as satisfied directly, satisfied
 * by a shared fallback, not applicable, or genuinely missing — using the
 * operator dispositions in `public.service_config_expectations`. Anything left
 * as MISSING_REQUIRED is a real configuration gap; each row carries the
 * disposition that explains why it is expected.
 */
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info, Search } from 'lucide-react';
import {
  useServiceCompletenessReport,
  useServiceExpectations,
} from '@/hooks/useServiceCompleteness';

const DIMENSION_LABELS: Record<string, string> = {
  workflow: 'Workflow',
  fee: 'Fee',
  forms_documents: 'Forms & documents',
  sla: 'Service standard (SLA)',
  decision_authority: 'Decision authority',
};

export default function ServiceCompletenessReport() {
  const { data, isLoading, error } = useServiceCompletenessReport();
  const { data: expectations = [] } = useServiceExpectations();
  const [query, setQuery] = useState('');

  const incomplete = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data?.incomplete ?? [];
    if (!q) return rows;
    return rows.filter((r) =>
      r.service_name.toLowerCase().includes(q) ||
      (r.service_code ?? '').toLowerCase().includes(q) ||
      r.dimension.includes(q));
  }, [data, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Configuration Completeness"
        description="Workflow, fee, forms, service standard and decision authority coverage for every regulatory service, with the operator disposition that explains each expectation."
        backHref="/admin/masters/services"
        backLabel="Services"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Explained, not assumed</AlertTitle>
        <AlertDescription>
          A dimension counts as complete when it is configured on the service, satisfied by a declared
          shared fallback, or explicitly classified as not applicable. Remaining items are genuine
          configuration decisions for the regulator — the platform does not invent them.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load the completeness report</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Services', value: data?.services },
          { label: 'Satisfied', value: data?.totals?.SATISFIED ?? 0 },
          { label: 'Shared fallback / N/A', value: (data?.totals?.SATISFIED_BY_FALLBACK ?? 0) + (data?.totals?.NOT_APPLICABLE ?? 0) },
          { label: 'Missing required', value: data?.totals?.MISSING_REQUIRED ?? 0 },
        ].map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="font-mono text-2xl">{isLoading ? '—' : (m.value ?? 0)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="dimensions">
        <TabsList>
          <TabsTrigger value="dimensions">By dimension</TabsTrigger>
          <TabsTrigger value="gaps">Missing configuration</TabsTrigger>
          <TabsTrigger value="expectations">Expectations</TabsTrigger>
        </TabsList>

        <TabsContent value="dimensions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coverage by dimension</CardTitle>
              <CardDescription>Counts are service-by-dimension evaluations.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? <Skeleton className="h-40 w-full" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dimension</TableHead>
                      <TableHead>Evaluated</TableHead>
                      <TableHead>Satisfied</TableHead>
                      <TableHead>Shared fallback</TableHead>
                      <TableHead>Not applicable</TableHead>
                      <TableHead>Missing required</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.by_dimension ?? []).map((d) => (
                      <TableRow key={d.dimension}>
                        <TableCell>{DIMENSION_LABELS[d.dimension] ?? d.dimension}</TableCell>
                        <TableCell className="font-mono text-xs">{d.evaluated}</TableCell>
                        <TableCell className="font-mono text-xs">{d.satisfied}</TableCell>
                        <TableCell className="font-mono text-xs">{d.satisfied_by_fallback}</TableCell>
                        <TableCell className="font-mono text-xs">{d.not_applicable}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.missing_required > 0
                            ? <Badge variant="destructive">{d.missing_required}</Badge>
                            : <Badge variant="secondary">0</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gaps" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search service or dimension" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Missing configuration ({data?.incomplete_services ?? 0} service{(data?.incomplete_services ?? 0) === 1 ? '' : 's'})
              </CardTitle>
              <CardDescription>Each row needs a regulator configuration decision.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? <Skeleton className="h-32 w-full" /> : incomplete.length === 0 ? (
                <p className="text-sm text-muted-foreground">No missing configuration.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Lifecycle</TableHead>
                      <TableHead>Dimension</TableHead>
                      <TableHead>Disposition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomplete.map((r) => (
                      <TableRow key={`${r.service_id}-${r.dimension}`}>
                        <TableCell>{r.service_name}</TableCell>
                        <TableCell className="font-mono text-xs">{r.service_code ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.lifecycle_stage ?? '—'}</TableCell>
                        <TableCell>{DIMENSION_LABELS[r.dimension] ?? r.dimension}</TableCell>
                        <TableCell><Badge variant="outline">{r.disposition}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expectations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration expectations</CardTitle>
              <CardDescription>
                Governed classifications. Changes are made through the governed configuration writer and audit-logged.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dimension</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expectations.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No expectations recorded.</TableCell></TableRow>
                  ) : expectations.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{DIMENSION_LABELS[e.dimension] ?? e.dimension}</TableCell>
                      <TableCell className="text-xs">
                        {e.service_id
                          ? 'Service-specific'
                          : [e.lifecycle_stage, e.decision_type].filter(Boolean).join(' / ') || 'All services'}
                      </TableCell>
                      <TableCell><Badge variant="outline">{e.disposition}</Badge></TableCell>
                      <TableCell className="max-w-md text-xs">{e.justification ?? '—'}</TableCell>
                      <TableCell className="text-xs">{e.is_active ? 'Yes' : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
