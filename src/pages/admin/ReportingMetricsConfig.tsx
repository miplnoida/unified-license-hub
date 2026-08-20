/**
 * RDM-ENTITY-001 Wave C — "Reporting & Metrics" configuration workspace.
 * Return definitions, obligation rules, regulatory metrics and a data
 * integrity diagnostic, all gated to `returns_management.manage_config`.
 */
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/hooks/useCan';
import { ReturnDefinitionsPanel } from '@/components/admin/returns-config/ReturnDefinitionsPanel';
import { ObligationRulesPanel } from '@/components/admin/returns-config/ObligationRulesPanel';
import { RegulatoryMetricsPanel } from '@/components/admin/returns-config/RegulatoryMetricsPanel';
import { DataIntegrityPanel } from '@/components/admin/returns-config/DataIntegrityPanel';

export default function ReportingMetricsConfig() {
  const canWrite = useCan('returns_management', 'manage_config');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reporting & Metrics Configuration"
          description="Return definitions, obligation rules, regulatory metrics and dataset integrity checks."
          backHref="/admin/regulatory-data-model"
          backLabel="Regulatory Data Model"
        />

        <Tabs defaultValue="definitions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="definitions">Return Definitions</TabsTrigger>
            <TabsTrigger value="obligations">Obligation Rules</TabsTrigger>
            <TabsTrigger value="metrics">Regulatory Metrics</TabsTrigger>
            <TabsTrigger value="integrity">Data Integrity</TabsTrigger>
          </TabsList>

          <TabsContent value="definitions">
            <ReturnDefinitionsPanel canWrite={canWrite} />
          </TabsContent>
          <TabsContent value="obligations">
            <ObligationRulesPanel canWrite={canWrite} />
          </TabsContent>
          <TabsContent value="metrics">
            <RegulatoryMetricsPanel canWrite={canWrite} />
          </TabsContent>
          <TabsContent value="integrity">
            <DataIntegrityPanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
