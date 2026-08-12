import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

// Notifications for fp_assessment events carry the assessment id, but the
// current F&P UI has no standalone assessment page — assessments are viewed
// inside the individual's profile (Assessments tab). This resolves the
// assessment id to its individual_id and forwards there.
export default function FpaAssessmentRedirect() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['fp_assessment_redirect', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('individual_id')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading assessment…
        </div>
      </DashboardLayout>
    );
  }

  if (data?.individual_id) {
    return <Navigate to={`/fpa/individuals/${data.individual_id}`} replace />;
  }

  return (
    <DashboardLayout>
      <div className="p-8 text-center text-muted-foreground">Assessment not found or access denied.</div>
    </DashboardLayout>
  );
}
