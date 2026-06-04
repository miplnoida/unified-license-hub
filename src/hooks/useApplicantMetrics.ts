import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const head = async (q: any): Promise<number> => {
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
};

export interface ApplicantMetrics {
  applications: {
    draft: number;
    submitted: number;
    under_review: number;
    approved: number;
    rejected: number;
    clarification_requested: number;
    resubmission_requested: number;
  };
  payments: { pending: number; paid: number; outstanding_amount: number };
  notifications: { unread: number };
  priority_lists: {
    recent_applications: Array<{ id: string; application_number: string | null; status: string; created_at: string }>;
    pending_payments: Array<{ id: string; amount: number; status: string; created_at: string }>;
  };
}

export function useApplicantMetrics(userId: string | undefined) {
  return useQuery<ApplicantMetrics>({
    queryKey: ['applicant-metrics', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [draft, submitted, under_review, approved, rejected, clarification, resubmission, payPending, payPaid, notif] = await Promise.all([
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).eq('status', 'draft')),
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).in('status', ['submitted', 'in_progress'])),
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).in('status', ['under_review', 'in_review', 'review', 'pending_review'])),
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).eq('status', 'approved')),
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).eq('status', 'rejected')),
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).eq('status', 'query_raised')),
        head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!).in('status', ['resubmission_requested', 'resubmission_required'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).eq('user_id', userId!).in('status', ['pending', 'awaiting_verification'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).eq('user_id', userId!).in('status', ['paid', 'completed', 'verified'])),
        head(supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId!).eq('read', false)),
      ]);

      const [recentAppsRes, pendingPaymentsRes] = await Promise.all([
        supabase.from('applications').select('id, application_number, status, created_at').eq('applicant_id', userId!).order('created_at', { ascending: false }).limit(5),
        supabase.from('payments').select('id, amount, status, created_at').eq('user_id', userId!).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false }).limit(5),
      ]);

      const outstanding_amount = ((pendingPaymentsRes.data || []) as any[]).reduce((s, p) => s + (Number(p.amount) || 0), 0);

      return {
        applications: {
          draft,
          submitted,
          under_review,
          approved,
          rejected,
          clarification_requested: clarification,
          resubmission_requested: resubmission,
        },
        payments: { pending: payPending, paid: payPaid, outstanding_amount },
        notifications: { unread: notif },
        priority_lists: {
          recent_applications: (recentAppsRes.data || []) as any,
          pending_payments: (pendingPaymentsRes.data || []) as any,
        },
      };
    },
  });
}

