import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const head = async (q: any, label?: string): Promise<number> => {
  const { count, error } = await q;
  if (error) {
    if (import.meta.env.DEV) console.warn('[useApplicantMetrics] count failed', label, error);
    return 0;
  }
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
    recent_applications: Array<{ id: string; application_number: string | null; status: string; created_at: string; updated_at?: string | null; submitted_at?: string | null; data?: any }>;
    pending_payments: Array<{ id: string; amount: number; status: string; created_at: string }>;
    action_required: Array<{ id: string; application_number: string | null; status: string; updated_at: string; application_id?: string; rfi_id?: string; item_count?: number }>;
  };
}

// Apply pre/post-license scoping at the application query level. Post-license
// applications always carry a `service_id` inside `data` (set during
// NewPostLicenseApplication); pre-license never do.
function scopeApps(q: any, scope: ApplicantMetricsScope) {
  if (scope === 'pre') {
    // Pre-license apps: no service_id AND (type is NULL OR type != 'post_license').
    // `.neq` in PostgREST excludes NULL, so use `.or` to include rows with no type key.
    return q
      .is('data->>service_id', null)
      .or('data->>type.is.null,data->>type.neq.post_license');
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
        supabase.from('applications').select('id, application_number, status, created_at, updated_at, submitted_at, data').eq('applicant_id', userId!),
        scope,
      ).order('created_at', { ascending: false }).limit(8);

      const ACTION_REQUIRED_STATUSES = [
        'query_raised',
        'info_requested',
        'resubmission_requested',
        'resubmission_required',
        'returned_for_correction',
      ];

      const actionRequiredQuery = scopeApps(
        supabase.from('applications').select('id, application_number, status, updated_at').eq('applicant_id', userId!),
        scope,
      ).in('status', ACTION_REQUIRED_STATUSES).order('updated_at', { ascending: false }).limit(10);

      const openRfisQuery = supabase
        .from('application_rfis' as any)
        .select('id, application_id, raised_at, status, applications!inner(id, application_number, applicant_id)')
        .in('status', ['open', 'responded'])
        .eq('applications.applicant_id', userId!)
        .order('raised_at', { ascending: false })
        .limit(20);

      const [recentAppsRes, pendingPaymentsRes, actionReqRes, openRfisRes] = await Promise.all([
        recentAppsQuery,
        supabase.from('payments').select('id, amount, status, created_at').eq('user_id', userId!).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false }).limit(5),
        actionRequiredQuery,
        openRfisQuery,
      ]);

      const outstanding_amount = ((pendingPaymentsRes.data || []) as any[]).reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const openRfiAppIds = new Set(((openRfisRes.data || []) as any[]).map((r) => r.application_id));

      // Merge open RFIs into action_required, deduped by application_id. If an
      // application is still parked in a legacy info/query status but there is
      // no active RFI, do not keep showing it as applicant action-required.
      const statusRows = ((actionReqRes.data || []) as any[]).filter((r) => {
        if (r.status === 'info_requested' || r.status === 'query_raised') {
          return openRfiAppIds.has(r.id);
        }
        return true;
      });
      const seenAppIds = new Set(statusRows.map((r) => r.id));
      const rfiRows = ((openRfisRes.data || []) as any[])
        .filter((r) => r.applications && !seenAppIds.has(r.application_id))
        .map((r) => ({
          id: r.id,
          rfi_id: r.id,
          application_id: r.application_id,
          application_number: r.applications?.application_number ?? null,
          status: 'rfi_open',
          updated_at: r.raised_at,
        }));
      const mergedActionRequired = [...statusRows, ...rfiRows];

      return {
        applications: {
          draft,
          submitted,
          under_review,
          approved,
          rejected,
          clarification_requested: mergedActionRequired.filter((r: any) => r.status === 'info_requested' || r.status === 'query_raised' || r.status === 'rfi_open').length,
          resubmission_requested: resubmission,
        },
        payments: { pending: payPending, paid: payPaid, outstanding_amount },
        notifications: { unread: notif },
        priority_lists: {
          recent_applications: (recentAppsRes.data || []) as any,
          pending_payments: (pendingPaymentsRes.data || []) as any,
          action_required: mergedActionRequired as any,
        },
      };
    },
  });
}
