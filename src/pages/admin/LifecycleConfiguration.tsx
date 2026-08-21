/**
 * P04 configuration closure — Licence Lifecycle Configuration workspace.
 *
 * One page where a regulator can see the difference between an available fee
 * type, an active fee schedule and an enabled workflow fee binding, inspect
 * versioned verification templates and process templates, and resolve both the
 * fee engine and the full ordered process for a chosen scope.
 */
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FeeBindingsPanel,
  FeeCataloguePanel,
  FeeSimulatorPanel,
  ProcessPreviewPanel,
  VerificationTemplatesPanel,
} from '@/components/admin/lifecycle-config/LifecycleConfigPanels';

export default function LifecycleConfiguration() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licence Lifecycle Configuration"
          description="Fee catalogue, fee schedules, workflow fee bindings, verification templates, process templates and resolution simulators."
          backHref="/admin"
          backLabel="Administration"
        />

        <Tabs defaultValue="catalogue" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="catalogue">Fee Catalogue</TabsTrigger>
            <TabsTrigger value="bindings">Fee Bindings</TabsTrigger>
            <TabsTrigger value="verification">Verification Templates</TabsTrigger>
            <TabsTrigger value="process">Process Designer & Preview</TabsTrigger>
            <TabsTrigger value="simulator">Fee Simulator</TabsTrigger>
          </TabsList>

          <TabsContent value="catalogue"><FeeCataloguePanel /></TabsContent>
          <TabsContent value="bindings"><FeeBindingsPanel /></TabsContent>
          <TabsContent value="verification"><VerificationTemplatesPanel /></TabsContent>
          <TabsContent value="process"><ProcessPreviewPanel /></TabsContent>
          <TabsContent value="simulator"><FeeSimulatorPanel /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
