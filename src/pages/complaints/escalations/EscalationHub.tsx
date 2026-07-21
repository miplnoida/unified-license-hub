import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, ShieldAlert, TrendingUp, Repeat, PlayCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EscalationQueueTable } from './EscalationQueueTable';
import { TriggeredRulesLog } from './TriggeredRulesLog';
import { EscalationRulesAdmin } from './EscalationRulesAdmin';

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div className={`p-2 rounded ${tone}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EscalationHub() {
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['escalation_hub_stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('escalation_hub_stats');
      if (error) throw error;
      return (data ?? {}) as {
        pending: number;
        critical: number;
        escalated: number;
        activeRules: number;
        totalRules: number;
      };
    },
    staleTime: 30_000,
  });


  const sweep = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('run_complaint_escalation_sweep');
      if (error) throw error;
      return data as { created_cases: number };
    },
    onSuccess: (r) => {
      toast.success(`Sweep complete — ${r.created_cases ?? 0} new case(s)`);
      qc.invalidateQueries({ queryKey: ['escalation_hub_stats'] });
      qc.invalidateQueries({ queryKey: ['pending_escalation_count'] });
      qc.invalidateQueries({ queryKey: ['complaint_escalation_cases'] });
      qc.invalidateQueries({ queryKey: ['complaint_escalation_log'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <PageHeader
        title="Complaint Auto-Escalation"
        description="Automatically escalate complaints based on consumer harm, age, institution risk, volume, and recurrence."
        actions={
          <Button data-rbac="complaints.configure" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
            {sweep.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run sweep now
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Stat icon={<AlertTriangle className="h-4 w-4 text-red-700" />} label="Pending escalations" value={stats?.pending ?? 0} tone="bg-red-50" />
        <Stat icon={<ShieldAlert className="h-4 w-4 text-amber-700" />} label="Critical severity" value={stats?.critical ?? 0} tone="bg-amber-50" />
        <Stat icon={<TrendingUp className="h-4 w-4 text-purple-700" />} label="Escalated" value={stats?.escalated ?? 0} tone="bg-purple-50" />
        <Stat icon={<Repeat className="h-4 w-4 text-blue-700" />} label="Active rules" value={`${stats?.activeRules ?? 0} / ${stats?.totalRules ?? 0}`} tone="bg-blue-50" />
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
