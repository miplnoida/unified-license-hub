import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, ShieldAlert, TrendingUp, Repeat } from 'lucide-react';
import { EscalationQueueTable } from './EscalationQueueTable';
import { TriggeredRulesLog } from './TriggeredRulesLog';
import { EscalationRulesAdmin } from './EscalationRulesAdmin';
import { MOCK_CASES, MOCK_RULES } from './mockData';

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div className={`p-2 rounded ${tone}`}>{icon}</div>
        <div>
          <div className="text-xs text-slate-600">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EscalationHub() {
  const pending = MOCK_CASES.filter((c) => c.status === 'pending').length;
  const critical = MOCK_CASES.filter((c) => c.severity === 'critical').length;
  const activeRules = MOCK_RULES.filter((r) => r.enabled).length;
  const escalated = MOCK_CASES.filter((c) => c.status === 'escalated').length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Complaint Auto-Escalation"
        description="Automatically escalate complaints based on consumer harm, age, institution risk, volume, and recurrence."
      />

      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Stat icon={<AlertTriangle className="h-4 w-4 text-red-700" />} label="Pending escalations" value={pending} tone="bg-red-50" />
        <Stat icon={<ShieldAlert className="h-4 w-4 text-amber-700" />} label="Critical severity" value={critical} tone="bg-amber-50" />
        <Stat icon={<TrendingUp className="h-4 w-4 text-purple-700" />} label="Escalated to tier" value={escalated} tone="bg-purple-50" />
        <Stat icon={<Repeat className="h-4 w-4 text-blue-700" />} label="Active rules" value={`${activeRules} / ${MOCK_RULES.length}`} tone="bg-blue-50" />
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue"><Clock className="h-4 w-4 mr-2" />Queue</TabsTrigger>
          <TabsTrigger value="log">Triggered Rules Log</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4"><EscalationQueueTable /></TabsContent>
        <TabsContent value="log" className="mt-4"><TriggeredRulesLog /></TabsContent>
        <TabsContent value="rules" className="mt-4"><EscalationRulesAdmin /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
