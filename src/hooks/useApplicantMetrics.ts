import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const head = async (q: any): Promise<number> => {
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
};

export type ApplicantMetricsScope = 'all' | 'pre' | 'post';

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
    recent_applications: Array<{ id: string; application_number: string | null; status: string; created_at: string; updated_at?: string | null }>;
    pending_payments: Array<{ id: string; amount: number; status: string; created_at: string }>;
    action_required: Array<{ id: string; application_number: string | null; status: string; updated_at: string }>;
  };
}

// Apply pre/post-license scoping at the application query level. Post-license
// applications always carry a `service_id` inside `data` (set during
// NewPostLicenseApplication); pre-license never do.
function scopeApps(q: any, scope: ApplicantMetricsScope) {
  if (scope === 'pre') {
    return q.is('data->>service_id', null).neq('data->>type', 'post_license');
  }
  if (scope === 'post') {
    return q.not('data->>service_id', 'is', null);
  }
  return q;
}

export function useApplicantMetrics(userId: string | undefined, scope: ApplicantMetricsScope = 'all') {
  return useQuery<ApplicantMetrics>({
    queryKey: ['applicant-metrics', userId, scope],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const apps = (status: string | string[]) => {
        const base = supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId!);
        const filtered = Array.isArray(status) ? base.in('status', status) : base.eq('status', status);
        return scopeApps(filtered, scope);
      };

      const [draft, submitted, under_review, approved, rejected, clarification, resubmission, payPending, payPaid, notif] = await Promise.all([
        head(apps('draft')),
        head(apps(['submitted', 'in_progress'])),
        head(apps(['under_review', 'in_review', 'review', 'pending_review'])),
        head(apps('approved')),
        head(apps('rejected')),
        head(apps(['query_raised', 'info_requested'])),
        head(apps(['resubmission_requested', 'resubmission_required', 'returned_for_correction'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).eq('user_id', userId!).in('status', ['pending', 'awaiting_verification'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).eq('user_id', userId!).in('status', ['paid', 'completed', 'verified'])),
        head(supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId!).eq('read', false)),
      ]);

      const recentAppsQuery = scopeApps(
        supabase.from('applications').select('id, application_number, status, created_at').eq('applicant_id', userId!),
        scope,
      ).order('created_at', { ascending: false }).limit(5);

      const [recentAppsRes, pendingPaymentsRes] = await Promise.all([
        recentAppsQuery,
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
