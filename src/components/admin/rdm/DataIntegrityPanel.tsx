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

  if (foundation) {
    groups.push(
      {
        title: 'Phase 2A · Party & regulated-entity foundation',
        description: 'Every regulated entity must bind to exactly one organisation party. The entity UUID itself is unchanged.',
        metrics: [
          { label: 'Parties', value: foundation.parties_total },
          { label: 'Organisation parties', value: foundation.organization_parties },
          { label: 'Person parties', value: foundation.person_parties, note: 'Person consolidation deferred' },
          { label: 'Regulated entities', value: foundation.regulated_entities_total },
          { label: 'Entities with no party binding', value: foundation.entities_without_party_binding, threshold: 0 },
          { label: 'Organisation parties with no entity', value: foundation.organization_parties_without_entity, note: 'Non-regulated organisations are valid' },
          { label: 'Duplicate organisation candidates', value: foundation.duplicate_organization_candidates, threshold: 0, note: 'Report only — never merged' },
          { label: 'Entities with no lifecycle stage', value: foundation.entities_without_lifecycle_stage, note: 'Non-deterministic legacy states left unset' },
          { label: 'Entities with no identity status', value: foundation.entities_without_identity_status, threshold: 0 },
        ],
      },
      {
        title: 'Phase 2A · Multi-licence relationships',
        description: 'entity_licenses is the canonical entity↔licence relationship; the legacy single-licence column is compatibility only.',
        metrics: [
          { label: 'entity_licenses rows', value: foundation.entity_licenses_rows },
          { label: 'Entities with no licence', value: foundation.entities_with_zero_licenses },
          { label: 'Entities with one licence', value: foundation.entities_with_one_license },
          { label: 'Entities with multiple licences', value: foundation.entities_with_multiple_licenses },
          { label: 'Licences with no relationship', value: foundation.licenses_without_entity_relationship, threshold: 0 },
          { label: 'Legacy licence links not represented', value: foundation.legacy_license_links_not_represented, threshold: 0 },
        ],
      },
      {
        title: 'Phase 2A · Identifiers & application readiness',
        description: 'Identifier uniqueness follows the configured scope, never one global rule. Ambiguous application mappings stay unset by design.',
        metrics: [
          { label: 'Entity identifiers', value: foundation.identifiers_total },
          { label: 'Scope uniqueness conflicts', value: foundation.identifier_scope_conflicts, threshold: 0 },
          { label: 'Missing required scope', value: foundation.identifiers_missing_required_scope, threshold: 0 },
          { label: 'Licences with no regulator', value: foundation.licenses_without_regulator_scope_identifier, note: 'Cannot carry regulator-scoped identifier' },
          { label: 'Applications mapped to entity', value: foundation.applications_mapped_to_entity },
          { label: 'Ambiguous application mappings', value: foundation.applications_ambiguous_entity_mapping, note: 'Left NULL deliberately' },
        ],
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Baseline generated {formatDateTime(report.generated_at)} — read-only, no data was changed.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => { refetch(); refetchFoundation(); }}
          disabled={isRefetching}
        >
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
