import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

// Notifications for conditions/appeals/monitoring events carry that record's
// own id, but none of them have a standalone page — they're tabs inside the
// individual's profile. This resolves {type, id} to individual_id + the
// matching tab and forwards there, the same way FpaAssessmentRedirect does
// for fp_assessment notifications.
const TYPE_CONFIG: Record<string, { table: string; tab: string }> = {
  condition: { table: 'fp_conditions', tab: 'conditions' },
  appeal: { table: 'fp_appeals', tab: 'appeals' },
  monitoring_event: { table: 'fp_monitoring_events', tab: 'monitoring' },
  determination: { table: 'fp_determinations', tab: 'determinations' },
};

export default function FpaEntityRedirect() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const config = type ? TYPE_CONFIG[type] : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['fp_entity_redirect', type, id],
    enabled: !!config && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(config!.table as any)
        .select('individual_id')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { individual_id: string | null } | null;
    },
  });

  // An organisation (licensee) id opens its Entity 360 Fit & Proper section;
  // that page applies its own access checks.
  if ((type === 'licensee' || type === 'entity') && id) {
    return <Navigate to={`/entities/${id}?section=fit_and_proper`} replace />;
  }

  if (!config) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Unknown entity type.</div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
        </div>
      </DashboardLayout>
    );
  }

  if (data?.individual_id) {
    return <Navigate to={`/fpa/individuals/${data.individual_id}?tab=${config.tab}`} replace />;
  }

  return (
    <DashboardLayout>
      <div className="p-8 text-center text-muted-foreground">Record not found or access denied.</div>
    </DashboardLayout>
  );
}
