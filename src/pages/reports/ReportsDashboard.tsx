import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Mail } from 'lucide-react';
import { ReportsOverview } from './components/ReportsOverview';
import { ReportLibrary } from './components/ReportLibrary';
import { AdHocReportBuilder } from './components/AdHocReportBuilder';
import { ReportHistory } from './components/ReportHistory';
import { ReportSchedules } from './components/ReportSchedules';
import { ReportPreviewDialog } from './components/ReportPreviewDialog';
import type { ReportDefinition, ReportRun } from './types';

export default function ReportsDashboard() {
  const [tab, setTab] = useState('overview');
  const [previewRun, setPreviewRun] = useState<ReportRun | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const openPreview = (run: ReportRun) => {
    setPreviewRun(run);
    setPreviewOpen(true);
  };

  const handleScheduleFromLibrary = (_def: ReportDefinition) => {
    setTab('schedules');
    setScheduleDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reports & Analytics"
          description="Generate, schedule, and export reports across all modules."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setTab('schedules'); setScheduleDialogOpen(true); }}>
                <Mail className="h-4 w-4 mr-2" />Schedule Report
              </Button>
              <Button onClick={() => setTab('builder')}>
                <Plus className="h-4 w-4 mr-2" />New Report
              </Button>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="library">Report Library</TabsTrigger>
            <TabsTrigger value="builder">Ad-Hoc Builder</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            <ReportsOverview />
          </TabsContent>

          <TabsContent value="library" className="mt-4">
            <ReportLibrary onPreview={openPreview} onSchedule={handleScheduleFromLibrary} />
          </TabsContent>

          <TabsContent value="builder" className="mt-4">
            <AdHocReportBuilder onPreview={openPreview} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ReportHistory onPreview={openPreview} />
          </TabsContent>

          <TabsContent value="schedules" className="mt-4">
            <ReportSchedules
              scheduleDialogOpen={scheduleDialogOpen}
              setScheduleDialogOpen={setScheduleDialogOpen}
            />
          </TabsContent>
        </Tabs>

        <ReportPreviewDialog run={previewRun} open={previewOpen} onOpenChange={setPreviewOpen} />
      </div>
    </DashboardLayout>
  );
}
