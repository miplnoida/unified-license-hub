/**
 * RDM-ENTITY-001 — Regulatory Data Model hub (Phase 0 + Phase 1).
 *
 * One admin surface for the configurable regulatory vocabulary the entity
 * architecture programme depends on, plus the read-only integrity baseline.
 * Nothing here changes business behaviour yet: Phase 2 onwards consumes this
 * configuration instead of hardcoded strings.
 */
import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from 'lucide-react';
import { MetadataTablePanel } from '@/components/admin/rdm/MetadataTablePanel';
import { DataIntegrityPanel } from '@/components/admin/rdm/DataIntegrityPanel';
import { RDM_SCHEMAS } from '@/lib/rdm/rdmSchema';
import { useCan } from '@/hooks/useCan';
import { useRdmRows } from '@/hooks/useRegulatoryDataModel';

export default function RegulatoryDataModel() {
  const canWrite = useCan('settings', 'edit');
  const { data: schemes = [] } = useRdmRows('classification_schemes');
  const [schemeId, setSchemeId] = useState<string | null>(null);

  const activeSchemeId = useMemo(
    () => schemeId ?? (schemes.length ? schemes[0].id : null),
    [schemeId, schemes],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Regulatory Data Model"
          description="Configurable classifications, lifecycle and identity policy, relationship and role types, form semantics, data ownership and integrity diagnostics."
          backHref="/admin/config/forms-master-data"
          backLabel="Configuration"
        />

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Configuration, not code</AlertTitle>
          <AlertDescription>
            Every value below is deployment-configurable and audit-logged. This foundation is additive —
            existing licensing, returns and supervision behaviour is unchanged until later phases consume it.
            {!canWrite && ' You have read-only access to this configuration.'}
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="classifications">
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="classifications">Classifications</TabsTrigger>
            <TabsTrigger value="lifecycle">Lifecycle &amp; Identity</TabsTrigger>
            <TabsTrigger value="relationships">Relationships &amp; Roles</TabsTrigger>
            <TabsTrigger value="forms">Form Semantics</TabsTrigger>
            <TabsTrigger value="ownership">Data Ownership</TabsTrigger>
            <TabsTrigger value="identity-policy">Identity Policy</TabsTrigger>
            <TabsTrigger value="integrity">Data Integrity</TabsTrigger>
          </TabsList>

          <TabsContent value="classifications" className="mt-4 space-y-4">
            <MetadataTablePanel schema={RDM_SCHEMAS.classification_schemes} canWrite={canWrite} />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scheme values</CardTitle>
                <CardDescription>Select a scheme to manage its values.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor="rdm-scheme">Scheme</Label>
                  <Select value={activeSchemeId ?? ''} onValueChange={setSchemeId}>
                    <SelectTrigger id="rdm-scheme">
                      <SelectValue placeholder="Select a scheme" />
                    </SelectTrigger>
                    <SelectContent>
                      {schemes.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {activeSchemeId && (
                  <MetadataTablePanel
                    key={activeSchemeId}
                    schema={RDM_SCHEMAS.classification_values}
                    schemeId={activeSchemeId}
                    contextValues={{ scheme_id: activeSchemeId }}
                    canWrite={canWrite}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lifecycle" className="mt-4 space-y-4">
            <MetadataTablePanel schema={RDM_SCHEMAS.lifecycle_stages} canWrite={canWrite} />
            <MetadataTablePanel schema={RDM_SCHEMAS.entity_identity_statuses} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="relationships" className="mt-4 space-y-4">
            <MetadataTablePanel schema={RDM_SCHEMAS.relationship_types} canWrite={canWrite} />
            <MetadataTablePanel schema={RDM_SCHEMAS.role_types} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="forms" className="mt-4 space-y-4">
            <MetadataTablePanel schema={RDM_SCHEMAS.form_purposes} canWrite={canWrite} />
            <MetadataTablePanel schema={RDM_SCHEMAS.form_trigger_types} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="ownership" className="mt-4 space-y-4">
            <MetadataTablePanel schema={RDM_SCHEMAS.data_domains} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="identity-policy" className="mt-4 space-y-4">
            <MetadataTablePanel schema={RDM_SCHEMAS.entity_identifier_types} canWrite={canWrite} />
            <MetadataTablePanel schema={RDM_SCHEMAS.entity_resolution_policies} canWrite={canWrite} />
            <MetadataTablePanel schema={RDM_SCHEMAS.entity_registry_failure_policies} canWrite={canWrite} />
          </TabsContent>

          <TabsContent value="integrity" className="mt-4">
            <DataIntegrityPanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
