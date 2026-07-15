import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, Layers, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { SuspectedDuplicatesTable } from '@/components/complaints/duplicates/SuspectedDuplicatesTable';
import { ClusterGroupsPanel } from '@/components/complaints/duplicates/ClusterGroupsPanel';
import { DetectionRulesPanel } from '@/components/complaints/duplicates/DetectionRulesPanel';
import { seedPairs, seedClusters, seedRules } from './seed';

export default function DuplicateDetectionHub() {
  const pending = seedPairs.filter(p => p.status === 'pending').length;
  const linked = seedPairs.filter(p => p.status === 'linked' || p.status === 'merged').length;
  const clusters = seedClusters.length;
  const activeRules = seedRules.filter(r => r.enabled).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Duplicate Complaint Detection"
          description="Identify duplicate submissions and related complaints across institutions, products, intermediaries and issues"
          actions={
            <Button variant="outline" asChild>
              <Link to="/complaints"><ArrowLeft className="h-4 w-4 mr-2" />Back to Complaints</Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pending Review</p><p className="text-2xl font-semibold">{pending}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Linked / Merged</p><p className="text-2xl font-semibold">{linked}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Active Clusters</p><p className="text-2xl font-semibold">{clusters}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Active Rules</p><p className="text-2xl font-semibold">{activeRules}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="suspected">
          <TabsList>
            <TabsTrigger value="suspected" className="gap-2"><Copy className="h-4 w-4" />Suspected Duplicates</TabsTrigger>
            <TabsTrigger value="clusters" className="gap-2"><Layers className="h-4 w-4" />Clusters</TabsTrigger>
            <TabsTrigger value="rules" className="gap-2"><SlidersHorizontal className="h-4 w-4" />Detection Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="suspected" className="mt-4"><SuspectedDuplicatesTable /></TabsContent>
          <TabsContent value="clusters" className="mt-4"><ClusterGroupsPanel /></TabsContent>
          <TabsContent value="rules" className="mt-4"><DetectionRulesPanel /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
