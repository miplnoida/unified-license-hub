import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadVisibleApplications } from '@/lib/visibleApplications';

const head = async (q: any): Promise<number> => {
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface LicenseeMetrics {
  licenses: { total: number; active: number; expiring_30d: number; expired: number };
  applications: { draft: number; submitted: number; approved: number; rejected: number };
  returns: { due_soon: number; overdue: number; submitted: number; pending_review: number };
  payments: { pending: number; paid: number; outstanding_amount: number };
  notifications: { unread: number };
  priority_lists: {
    upcoming_returns: Array<{ id: string; due_date: string | null; status: string }>;
    expiring_licenses: Array<{ id: string; license_number: string | null; valid_until: string | null }>;
    pending_payments: Array<{ id: string; amount: number; status: string; created_at: string }>;
  };
}

export function useLicenseeMetrics(activeLicenseeId: string | null | undefined, userId: string | undefined) {
  return useQuery<LicenseeMetrics>({
    queryKey: ['licensee-metrics', activeLicenseeId, userId],
    enabled: !!(activeLicenseeId || userId),
    staleTime: 60_000,
    queryFn: async () => {
      const lid = activeLicenseeId || null;

      const [licenseeRowRes, visibleApps] = await Promise.all([
        lid
          ? supabase.from('licensees').select('id, license_id, status').eq('id', lid).maybeSingle()
          : Promise.resolve({ data: null as any }),
        loadVisibleApplications({ licenseeId: lid }),
      ]);
      const licenseeRow = (licenseeRowRes as any).data;
      const licenseId = (licenseeRow as any)?.license_id;
      const visibleAppIds = visibleApps.map((app) => app.id).filter(Boolean);
      const visibleAppIdSet = new Set(visibleAppIds);
      const draftApps = visibleApps.filter((app) => app.status === 'draft').length;
      const submittedApps = visibleApps.filter((app) => ['submitted', 'under_review', 'in_progress'].includes(app.status)).length;
      const approvedApps = visibleApps.filter((app) => app.status === 'approved').length;
      const rejectedApps = visibleApps.filter((app) => app.status === 'rejected').length;

      const licenseEq = (q: any) => licenseId ? q.eq('id', licenseId) : q.eq('id', '00000000-0000-0000-0000-000000000000');

      const [
        licTotal, licActive, licExp30, licExpired,
        appDraft, appSubmitted, appApproved, appRejected,
        retDueSoon, retOverdue, retSubmitted, retPendingReview,
        payPending, payPaid,
        notifUnread,
      ] = await Promise.all([
        head(licenseEq(supabase.from('licenses').select('*', { count: 'exact', head: true }))),
        head(licenseEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'))),
        head(licenseEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('valid_until', new Date(Date.now() + 30*86400000).toISOString()))),
        head(licenseEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'expired'))),

        Promise.resolve(draftApps),
        Promise.resolve(submittedApps),
        Promise.resolve(approvedApps),
        Promise.resolve(rejectedApps),

        licenseId
          ? head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('license_id', licenseId).in('status', ['pending', 'draft', 'not_submitted']).lte('due_date', daysFromNow(30)))
          : 0,
        licenseId
          ? head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('license_id', licenseId).in('status', ['pending', 'draft', 'overdue', 'not_submitted']).lt('due_date', todayIso()))
          : 0,
        licenseId
          ? head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('license_id', licenseId).eq('status', 'submitted'))
          : 0,
        licenseId
          ? head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('license_id', licenseId).in('status', ['submitted', 'pending_review']))
          : 0,

        visibleAppIds.length > 0 ? head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('application_id', visibleAppIds).in('status', ['pending', 'awaiting_verification'])) : 0,
        visibleAppIds.length > 0 ? head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('application_id', visibleAppIds).in('status', ['paid', 'completed', 'verified'])) : 0,

        userId ? head(supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)) : 0,
      ]);

      const [upcomingReturnsRes, expiringLicensesRes, pendingPaymentsRes] = await Promise.all([
        licenseId
          ? supabase.from('compliance_returns').select('id, due_date, status').eq('license_id', licenseId).in('status', ['pending', 'draft', 'not_submitted']).order('due_date', { ascending: true }).limit(5)
          : Promise.resolve({ data: [] as any[] }),
        licenseEq(supabase.from('licenses').select('id, license_number, valid_until').eq('status', 'active').order('valid_until', { ascending: true })).limit(5),
        visibleAppIds.length > 0
          ? supabase.from('payments').select('id, application_id, amount, status, created_at').in('application_id', visibleAppIds).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const pendingPayments = ((pendingPaymentsRes.data || []) as any[])
        .filter((payment: any) => visibleAppIdSet.has(payment.application_id))
      const outstanding_amount = pendingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      return {
        licenses: { total: licTotal, active: licActive, expiring_30d: licExp30, expired: licExpired },
        applications: { draft: appDraft, submitted: appSubmitted, approved: appApproved, rejected: appRejected },
        returns: { due_soon: retDueSoon, overdue: retOverdue, submitted: retSubmitted, pending_review: retPendingReview },
        payments: { pending: payPending, paid: payPaid, outstanding_amount },
        notifications: { unread: notifUnread },
        priority_lists: {
          upcoming_returns: (upcomingReturnsRes.data || []) as any,
          expiring_licenses: (expiringLicensesRes.data || []) as any,
          pending_payments: pendingPayments.slice(0, 5) as any,
        },
      };
    },
  });
}
