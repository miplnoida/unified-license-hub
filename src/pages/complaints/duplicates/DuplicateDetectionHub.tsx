import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, SlidersHorizontal, ArrowLeft, PlayCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SuspectedDuplicatesTable } from '@/components/complaints/duplicates/SuspectedDuplicatesTable';
import { DetectionRulesPanel } from '@/components/complaints/duplicates/DetectionRulesPanel';

export default function DuplicateDetectionHub() {
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['duplicate_hub_stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('duplicate_hub_stats');
      if (error) throw error;
      return (data ?? {}) as { pending: number; linkedMerged: number; activeRules: number };
    },
    staleTime: 30_000,
  });


  // GAP-F1-06: the detection window is configured in
  // `complaint_duplicate_scoring_config.time_window_days` — never hard-coded here.
  const { data: scoringConfig } = useQuery({
    queryKey: ['complaint_duplicate_scoring_config', 'window'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_duplicate_scoring_config')
        .select('time_window_days')
        .eq('active', true)
        .maybeSingle();
      if (error) throw error;
      return data as { time_window_days: number } | null;
    },
    staleTime: 60_000,
  });

  const detect = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('detect_complaint_duplicates', {
        _complaint_id: null,
        _window_days: scoringConfig?.time_window_days ?? null,
      });
      if (error) throw error;
      return data as { detected: number };
    },
    onSuccess: (r) => {
      toast.success(`Detection complete — ${r.detected ?? 0} new pair(s)`);
      qc.invalidateQueries({ queryKey: ['complaint_duplicate_pairs'] });
      qc.invalidateQueries({ queryKey: ['duplicate_hub_stats'] });
      qc.invalidateQueries({ queryKey: ['pending_duplicate_count'] });
      qc.invalidateQueries({ queryKey: ['list_duplicate_clusters'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Duplicate Complaint Detection"
          description="Identify duplicate submissions and related complaints across institutions, products, intermediaries and issues"
          actions={
            <div className="flex gap-2">
              <Button data-rbac="complaint_management.edit" onClick={() => detect.mutate()} disabled={detect.isPending}>
                {detect.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Run detection
              </Button>
              <Button variant="outline" asChild>
                <Link to="/complaints"><ArrowLeft className="h-4 w-4 mr-2" />Back to Complaints</Link>
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pending Review</p><p className="text-2xl font-semibold">{stats?.pending ?? 0}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Linked / Merged</p><p className="text-2xl font-semibold">{stats?.linkedMerged ?? 0}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Active Rules</p><p className="text-2xl font-semibold">{stats?.activeRules ?? 0}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="suspected">
          <TabsList>
            <TabsTrigger value="suspected" className="gap-2"><Copy className="h-4 w-4" />Suspected Duplicates</TabsTrigger>
            <TabsTrigger value="rules" className="gap-2"><SlidersHorizontal className="h-4 w-4" />Detection Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="suspected" className="mt-4"><SuspectedDuplicatesTable /></TabsContent>
          <TabsContent value="rules" className="mt-4"><DetectionRulesPanel /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
