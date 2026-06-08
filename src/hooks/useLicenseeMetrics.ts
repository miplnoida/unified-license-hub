import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadVisibleApplications } from '@/lib/visibleApplications';

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
    upcoming_returns: Array<{ id: string; unique_id?: string | null; due_date: string | null; status: string }>;
    expiring_licenses: Array<{ id: string; license_number: string | null; valid_until: string | null }>;
    pending_payments: Array<{ id: string; amount: number; status: string; created_at: string }>;
  };
}

/**
 * Aggregates dashboard metrics for the currently-selected licensee entity.
 *
 * Every count is derived dynamically from live Supabase queries scoped to
 * `activeLicenseeId`. Notable scoping rules:
 *   - Licences are matched by `licenses.holder_id = activeLicenseeId` (a
 *     licensee can hold multiple licences; we must NOT collapse to a single
 *     primary `licensees.license_id`).
 *   - Returns are read from `returns_filed` (the canonical table used across
 *     the returns module) and matched on either `entity_id` or
 *     `on_behalf_of_licensee_id` so PPOC-filed returns are included.
 *   - Returns workflow statuses: TEMP/WIP = unfinished draft, SUB = submitted
 *     awaiting review, VAL = validated/approved, TBR = sent back for edit.
 *   - Payments are scoped through this licensee's visible applications.
 */
export function useLicenseeMetrics(activeLicenseeId: string | null | undefined, userId: string | undefined) {
  return useQuery<LicenseeMetrics>({
    queryKey: ['licensee-metrics', activeLicenseeId, userId],
    enabled: !!(activeLicenseeId || userId),
    staleTime: 60_000,
    queryFn: async () => {
      const lid = activeLicenseeId || null;
      const today = todayIso();
      const in30 = daysFromNow(30);
      const ZERO = { count: 0 } as const;

      const visibleApps = await loadVisibleApplications({ licenseeId: lid });
      const visibleAppIds = visibleApps.map((app) => app.id).filter(Boolean);
      const visibleAppIdSet = new Set(visibleAppIds);

      const draftApps = visibleApps.filter((app) => app.status === 'draft').length;
      const submittedApps = visibleApps.filter((app) => ['submitted', 'under_review', 'in_progress'].includes(app.status)).length;
      const approvedApps = visibleApps.filter((app) => app.status === 'approved').length;
      const rejectedApps = visibleApps.filter((app) => app.status === 'rejected').length;

      // ── Licences (scoped by holder_id) ─────────────────────────────────────
      const licBase = () => supabase.from('licenses').select('id, license_number, status, valid_until').eq('holder_id', lid as string);
      const licCount = () => supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('holder_id', lid as string);

      const licQueries = lid
        ? await Promise.all([
            licCount(),
            licCount().eq('status', 'active'),
            licCount().eq('status', 'active').not('valid_until', 'is', null).gte('valid_until', today).lte('valid_until', new Date(Date.now() + 30 * 86400000).toISOString()),
            licCount().eq('status', 'expired'),
          ])
        : [ZERO, ZERO, ZERO, ZERO];

      const [licTotalRes, licActiveRes, licExp30Res, licExpiredRes] = licQueries as any[];

      // ── Returns (returns_filed scoped to this licensee) ────────────────────
      // Match returns owned by the entity OR filed on its behalf.
      const retScope = lid ? `entity_id.eq.${lid},on_behalf_of_licensee_id.eq.${lid}` : null;
      const retCount = () => supabase.from('returns_filed').select('id', { count: 'exact', head: true }).or(retScope as string);

      const UNFILED = ['TEMP', 'WIP', 'TBR'];

      const retQueries = retScope
        ? await Promise.all([
            // due_soon: not yet submitted/approved, due within next 30 days (today..+30)
            retCount().in('workflow_status', UNFILED).not('due_date', 'is', null).gte('due_date', today).lte('due_date', in30),
            // overdue: not yet submitted/approved, due_date before today
            retCount().in('workflow_status', UNFILED).not('due_date', 'is', null).lt('due_date', today),
            // submitted: SUB or VAL (anything actually filed)
            retCount().in('workflow_status', ['SUB', 'VAL']),
            // pending_review: with admin (SUB) awaiting validation
            retCount().eq('workflow_status', 'SUB'),
          ])
        : [ZERO, ZERO, ZERO, ZERO];

      const [retDueSoonRes, retOverdueRes, retSubmittedRes, retPendingRes] = retQueries as any[];

      // ── Payments (via visible applications) ────────────────────────────────
      const [payPendingRes, payPaidRes] = await Promise.all([
        visibleAppIds.length > 0
          ? supabase.from('payments').select('id', { count: 'exact', head: true }).in('application_id', visibleAppIds).in('status', ['pending', 'awaiting_verification'])
          : Promise.resolve(ZERO as any),
        visibleAppIds.length > 0
          ? supabase.from('payments').select('id', { count: 'exact', head: true }).in('application_id', visibleAppIds).in('status', ['paid', 'completed', 'verified'])
          : Promise.resolve(ZERO as any),
      ]);

      const notifUnreadRes = userId
        ? await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)
        : (ZERO as any);

      // ── Priority lists ─────────────────────────────────────────────────────
      const [upcomingReturnsRes, expiringLicensesRes, pendingPaymentsRes] = await Promise.all([
        retScope
          ? supabase
              .from('returns_filed')
              .select('id, unique_id, due_date, workflow_status')
              .or(retScope)
              .in('workflow_status', UNFILED)
              .not('due_date', 'is', null)
              .gte('due_date', today)
              .order('due_date', { ascending: true })
              .limit(5)
          : Promise.resolve({ data: [] as any[] }),
        lid
          ? licBase().eq('status', 'active').not('valid_until', 'is', null).order('valid_until', { ascending: true }).limit(5)
          : Promise.resolve({ data: [] as any[] }),
        visibleAppIds.length > 0
          ? supabase.from('payments').select('id, application_id, amount, status, created_at').in('application_id', visibleAppIds).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const pendingPayments = ((pendingPaymentsRes.data || []) as any[])
        .filter((payment: any) => visibleAppIdSet.has(payment.application_id));
      const outstanding_amount = pendingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const upcomingReturns = ((upcomingReturnsRes.data || []) as any[]).map((r) => ({
        id: r.id,
        unique_id: r.unique_id,
        due_date: r.due_date,
        status: r.workflow_status,
      }));

      return {
        licenses: {
          total: licTotalRes.count ?? 0,
          active: licActiveRes.count ?? 0,
          expiring_30d: licExp30Res.count ?? 0,
          expired: licExpiredRes.count ?? 0,
        },
        applications: { draft: draftApps, submitted: submittedApps, approved: approvedApps, rejected: rejectedApps },
        returns: {
          due_soon: retDueSoonRes.count ?? 0,
          overdue: retOverdueRes.count ?? 0,
          submitted: retSubmittedRes.count ?? 0,
          pending_review: retPendingRes.count ?? 0,
        },
        payments: { pending: payPendingRes.count ?? 0, paid: payPaidRes.count ?? 0, outstanding_amount },
        notifications: { unread: notifUnreadRes.count ?? 0 },
        priority_lists: {
          upcoming_returns: upcomingReturns,
          expiring_licenses: (expiringLicensesRes.data || []) as any,
          pending_payments: pendingPayments.slice(0, 5) as any,
        },
      };
    },
  });
}
