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

      // Resolve licensee row + the licensee's primary user(s). When a PPOC
      // switches licensee in the header, applications/payments must reflect
      // the SELECTED licensee's records — not the caller's personal data.
      const [licenseeRowRes, primaryUserRes] = await Promise.all([
        lid
          ? supabase.from('licensees').select('id, license_id, status').eq('id', lid).maybeSingle()
          : Promise.resolve({ data: null as any }),
        lid
          ? supabase.from('profiles').select('id').eq('licensee_id', lid)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const licenseeRow = (licenseeRowRes as any).data;
      const licenseId = (licenseeRow as any)?.license_id;
      const primaryUserIds = (((primaryUserRes as any).data || []) as any[])
        .map((r: any) => r.id)
        .filter(Boolean) as string[];
      // Scope app/payment queries to the licensee's owner(s) when available,
      // else fall back to the calling user (Primary User viewing own data).
      const scopedUserIds: string[] = primaryUserIds.length > 0
        ? primaryUserIds
        : (userId ? [userId] : []);
      const hasScoped = scopedUserIds.length > 0;
      const applyUserScope = (q: any) =>
        scopedUserIds.length === 1 ? q.eq('applicant_id', scopedUserIds[0]) : q.in('applicant_id', scopedUserIds);
      const applyPayUserScope = (q: any) =>
        scopedUserIds.length === 1 ? q.eq('user_id', scopedUserIds[0]) : q.in('user_id', scopedUserIds);

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

        hasScoped ? head(applyUserScope(supabase.from('applications').select('*', { count: 'exact', head: true })).eq('status', 'draft')) : 0,
        hasScoped ? head(applyUserScope(supabase.from('applications').select('*', { count: 'exact', head: true })).in('status', ['submitted', 'under_review'])) : 0,
        hasScoped ? head(applyUserScope(supabase.from('applications').select('*', { count: 'exact', head: true })).eq('status', 'approved')) : 0,
        hasScoped ? head(applyUserScope(supabase.from('applications').select('*', { count: 'exact', head: true })).eq('status', 'rejected')) : 0,

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

        hasScoped ? head(applyPayUserScope(supabase.from('payments').select('*', { count: 'exact', head: true })).in('status', ['pending', 'awaiting_verification'])) : 0,
        hasScoped ? head(applyPayUserScope(supabase.from('payments').select('*', { count: 'exact', head: true })).in('status', ['paid', 'completed', 'verified'])) : 0,

        userId ? head(supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)) : 0,
      ]);

      const [upcomingReturnsRes, expiringLicensesRes, pendingPaymentsRes] = await Promise.all([
        licenseId
          ? supabase.from('compliance_returns').select('id, due_date, status').eq('license_id', licenseId).in('status', ['pending', 'draft', 'not_submitted']).order('due_date', { ascending: true }).limit(5)
          : Promise.resolve({ data: [] as any[] }),
        licenseEq(supabase.from('licenses').select('id, license_number, valid_until').eq('status', 'active').order('valid_until', { ascending: true })).limit(5),
        hasScoped
          ? applyPayUserScope(supabase.from('payments').select('id, amount, status, created_at')).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false }).limit(5)
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
