/**
 * RDM-ENTITY-001 — Phase 0 read-only integrity diagnostics.
 *
 * Reports the structural facts later phases must migrate away from (entity
 * bound 1:1 to a licence, applications without a pinned form version, free-text
 * relationship values). It never writes and never mutates business data.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { useRdmDuplicateEntities, useRdmDuplicateOrganizations, useRdmEntityFoundationReport, useRdmIntegrityReport } from '@/hooks/useRegulatoryDataModel';

interface Metric {
  label: string;
  value: number;
  /** Any value above this is a finding that Phase 2+ must resolve. */
  threshold?: number;
  note?: string;
}

export function DataIntegrityPanel() {
  const { data: report, isLoading, refetch, isRefetching } = useRdmIntegrityReport();
  const { data: duplicates = [] } = useRdmDuplicateEntities();
  const { data: foundation, refetch: refetchFoundation } = useRdmEntityFoundationReport();
  const { data: duplicateOrgs = [] } = useRdmDuplicateOrganizations();


  if (isLoading || !report) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  const groups: Array<{ title: string; description: string; metrics: Metric[] }> = [
    {
      title: 'Entity & licence structure',
      description: 'Today an entity row carries a single licence id. Multi-licence support is a Phase 2 change.',
      metrics: [
        { label: 'Entities', value: report.entities_total },
        { label: 'Licences', value: report.licenses_total },
        { label: 'Entities with no licence', value: report.entities_without_license },
        { label: 'Licences with no entity', value: report.licenses_without_entity, threshold: 0 },
        { label: 'Entities sharing a licence id', value: report.entities_sharing_license_id, threshold: 0 },
        { label: 'Possible duplicate entity names', value: report.duplicate_entity_names, threshold: 0 },
        { label: 'Foreign keys referencing entities', value: report.foreign_keys_referencing_licensees, note: 'Rename impact surface' },
      ],
    },
    {
      title: 'Applications & registrations',
      description: 'Submissions must be reproducible from a pinned form version and resolvable to an entity.',
      metrics: [
        { label: 'Applications', value: report.applications_total },
        { label: 'No pinned form version', value: report.applications_without_pinned_form_version, threshold: 0 },
        { label: 'No resolvable entity', value: report.applications_without_resolvable_entity, threshold: 0 },
        { label: 'Registrations', value: report.registrations_total },
        { label: 'Registrations with no user', value: report.registrations_without_user, threshold: 0 },
        { label: 'Duplicate registration numbers', value: report.duplicate_registration_numbers, threshold: 0 },
      ],
    },
    {
      title: 'Semantics still held as free text',
      description: 'Each distinct free-text value below must map onto configured metadata.',
      metrics: [
        { label: 'Relationship rows', value: report.relationship_rows },
        { label: 'Distinct relationship_type strings', value: report.distinct_relationship_type_values, note: 'Map to relationship types' },
        { label: 'Form templates', value: report.form_templates_total },
        { label: 'Distinct form_type strings', value: report.distinct_form_type_values, note: 'Map to form purposes' },
        { label: 'Templates with no version', value: report.form_templates_without_published_version, threshold: 0 },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Baseline generated {formatDateTime(report.generated_at)} — read-only, no data was changed.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {groups.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.metrics.map((m) => {
                const isFinding = m.threshold !== undefined && m.value > m.threshold;
                return (
                  <div
                    key={m.label}
                    className={`rounded-lg border p-3 ${isFinding ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/30'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                      {m.threshold !== undefined && (
                        isFinding
                          ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                          : <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </div>
                    <p className="mt-1 font-mono text-2xl font-semibold">{m.value.toLocaleString()}</p>
                    {m.note && <p className="mt-1 text-xs text-muted-foreground">{m.note}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Possible duplicate entities</CardTitle>
          <CardDescription>
            Name-normalised candidates only. Resolution cases are a Phase 2 capability — nothing is merged here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {duplicates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No duplicate entity names detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Normalised name</TableHead>
                    <TableHead className="w-20">Count</TableHead>
                    <TableHead>Records</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicates.map((d) => (
                    <TableRow key={d.normalised_name}>
                      <TableCell className="font-medium">{d.normalised_name}</TableCell>
                      <TableCell><Badge variant="destructive">{d.entity_count}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.entity_names.map((n, i) => `${n} (${d.statuses[i] ?? 'unknown'})`).join(' · ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured metadata coverage</CardTitle>
          <CardDescription>Rows currently configured in each Phase 1 metadata table.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(report.configured_metadata).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                <span className="font-mono text-sm font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
