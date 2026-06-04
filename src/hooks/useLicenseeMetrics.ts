import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

      // licenses are linked via licensees.license_id → licenses.id, plus holder_id
      const [{ data: licenseeRow }] = lid
        ? await Promise.all([
            supabase.from('licensees').select('id, license_id, status').eq('id', lid).maybeSingle(),
          ])
        : [{ data: null as any }];
      const licenseId = (licenseeRow as any)?.license_id;

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

        userId ? head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId).eq('status', 'draft')) : 0,
        userId ? head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId).in('status', ['submitted', 'under_review'])) : 0,
        userId ? head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId).eq('status', 'approved')) : 0,
        userId ? head(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('applicant_id', userId).eq('status', 'rejected')) : 0,

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

        userId ? head(supabase.from('payments').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['pending', 'awaiting_verification'])) : 0,
        userId ? head(supabase.from('payments').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['paid', 'completed', 'verified'])) : 0,

        userId ? head(supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)) : 0,
      ]);

      const [upcomingReturnsRes, expiringLicensesRes, pendingPaymentsRes] = await Promise.all([
        licenseId
          ? supabase.from('compliance_returns').select('id, due_date, status').eq('license_id', licenseId).in('status', ['pending', 'draft', 'not_submitted']).order('due_date', { ascending: true }).limit(5)
          : Promise.resolve({ data: [] as any[] }),
        licenseEq(supabase.from('licenses').select('id, license_number, valid_until').eq('status', 'active').order('valid_until', { ascending: true })).limit(5),
        userId
          ? supabase.from('payments').select('id, amount, status, created_at').eq('user_id', userId).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const outstanding_amount = ((pendingPaymentsRes.data || []) as any[]).reduce((s, p) => s + (Number(p.amount) || 0), 0);

      return {
        licenses: { total: licTotal, active: licActive, expiring_30d: licExp30, expired: licExpired },
        applications: { draft: appDraft, submitted: appSubmitted, approved: appApproved, rejected: appRejected },
        returns: { due_soon: retDueSoon, overdue: retOverdue, submitted: retSubmitted, pending_review: retPendingReview },
        payments: { pending: payPending, paid: payPaid, outstanding_amount },
        notifications: { unread: notifUnread },
        priority_lists: {
          upcoming_returns: (upcomingReturnsRes.data || []) as any,
          expiring_licenses: (expiringLicensesRes.data || []) as any,
          pending_payments: (pendingPaymentsRes.data || []) as any,
        },
      };
    },
  });
}
