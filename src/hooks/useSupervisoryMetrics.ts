import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Aggregate supervisory metrics across all modules.
 *
 * Implementation note: counts are fetched via `head:true, count:'exact'`
 * which returns ONLY the count (no rows) and respects RLS server-side.
 * Priority lists fetch a tiny `limit(5)` of ids/key fields only.
 *
 * This keeps the network footprint small and prevents any sensitive row
 * data from being shipped to the client beyond what RLS allows.
 */

const head = async (q: any): Promise<number> => {
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
};

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export interface SupervisoryFilters {
  sectorId?: string | null;
  regulatorId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface SupervisoryMetrics {
  applications: {
    total: number;
    draft: number;
    pending: number;
    submitted: number;
    under_review: number;
    approved: number;
    rejected: number;
    returned: number;
    sla_breached: number;
    sla_due_soon: number;
    oldest_pending_days: number;
  };
  licenses: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    revoked: number;
    expiring_30d: number;
    expiring_90d: number;
  };
  returns: {
    due_soon: number;
    overdue: number;
    pending_review: number;
    submitted: number;
    repeat_late_filers: number;
  };
  payments: {
    pending: number;
    paid: number;
    failed: number;
    overdue: number;
    outstanding_amount: number;
    revenue_month: number;
    blocked_applications: number;
  };
  inspections: {
    scheduled: number;
    completed: number;
    overdue: number;
    high_severity_findings: number;
  };
  enforcement: {
    open: number;
    new_this_month: number;
    pending_action: number;
    closed: number;
    sla_breached: number;
  };
  complaints: {
    open: number;
    pending_triage: number;
    under_investigation: number;
    closed: number;
    high_priority: number;
    sla_breached: number;
  };
  risk: {
    high: number;
    medium: number;
    low: number;
    high_risk_with_overdue_returns: number;
  };
  licensees: {
    total: number;
    active: number;
  };
  workflow: {
    bottleneck_stage: string | null;
    bottleneck_avg_hours: number;
  };
  priority_lists: {
    oldest_pending_applications: Array<{ id: string; application_number?: string | null; created_at: string; status: string }>;
    upcoming_license_expiries: Array<{ id: string; license_number?: string | null; valid_until?: string | null }>;
    overdue_returns: Array<{ id: string; due_date?: string | null; status: string }>;
    high_risk_entities: Array<{ id: string; entity_id: string; overall_rating?: string | null }>;
    open_enforcement_cases: Array<{ id: string; case_number?: string | null; status: string }>;
  };
}

export function useSupervisoryMetrics(filters?: SupervisoryFilters, enabled = true) {
  const { user } = useAuth();

  return useQuery<SupervisoryMetrics>({
    queryKey: ['supervisory-metrics', user?.id, filters],
    enabled: !!user && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const sectorEq = (q: any) => filters?.sectorId ? q.eq('sector_id', filters.sectorId) : q;
      const regulatorEq = (q: any) => filters?.regulatorId ? q.eq('regulator_id', filters.regulatorId) : q;

      const [
        appsTotal, appsDraft, appsSubmittedDirect, appsUnderReview,
        appsApproved, appsRejected, appsReturned,
        licTotal, licActive, licExpired, licSuspended, licRevoked, licExp30, licExp90,
        retDueSoon, retOverdue, retPendingReview, retSubmitted,
        payPending, payPaid, payFailed,
        inspScheduled, inspCompleted, inspOverdue,
        enfOpen, enfNew, enfPending, enfClosed,
        cmpOpen, cmpInvestig, cmpClosed,
        riskHigh, riskMedium, riskLow,
        licenseesTotal, licenseesActive,
      ] = await Promise.all([
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }))),
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'draft'))),
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'submitted'))),
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'))),
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'))),
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'))),
        head(regulatorEq(supabase.from('applications').select('*', { count: 'exact', head: true }).in('status', ['returned', 'returned_for_clarification', 'resubmission_required']))),

        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true })))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'expired')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'suspended')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'revoked')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('valid_until', daysFromNow(30)).gte('valid_until', new Date().toISOString())))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('valid_until', daysFromNow(90)).gte('valid_until', new Date().toISOString())))),

        head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).in('status', ['pending', 'draft', 'not_submitted']).lte('due_date', todayIso())),
        head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).in('status', ['pending', 'draft', 'overdue', 'not_submitted']).lt('due_date', todayIso())),
        head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).eq('status', 'submitted')),
        head(supabase.from('compliance_returns').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'reviewed', 'approved'])),

        head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('status', ['pending', 'awaiting_verification'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('status', ['paid', 'completed', 'verified'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('status', ['failed', 'rejected'])),

        head(supabase.from('inspections').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'planned'])),
        head(supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'completed')),
        head(supabase.from('inspections').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'planned']).lt('date_conducted', todayIso())),

        head(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).in('status', ['open', 'investigation', 'pending'])),
        head(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).gte('date_opened', daysAgo(30).slice(0, 10))),
        head(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
        head(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).eq('status', 'closed')),

        head(regulatorEq(supabase.from('complaints').select('*', { count: 'exact', head: true }).in('status', ['open', 'submitted', 'pending', 'under_investigation']))),
        head(regulatorEq(supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'under_investigation'))),
        head(regulatorEq(supabase.from('complaints').select('*', { count: 'exact', head: true }).in('status', ['closed', 'resolved']))),

        head(supabase.from('risk_ratings').select('*', { count: 'exact', head: true }).ilike('overall_rating', 'high%')),
        head(supabase.from('risk_ratings').select('*', { count: 'exact', head: true }).ilike('overall_rating', 'medium%')),
        head(supabase.from('risk_ratings').select('*', { count: 'exact', head: true }).ilike('overall_rating', 'low%')),

        head(sectorEq(supabase.from('licensees').select('*', { count: 'exact', head: true }))),
        head(sectorEq(supabase.from('licensees').select('*', { count: 'exact', head: true }).eq('status', 'active'))),
      ]);

      const [{ data: pendingRows }, { data: breachedRows }, { data: dueSoonRows }] = await Promise.all([
        supabase.rpc('get_application_list_page' as any, {
          _page: 0,
          _page_size: 5,
          _search: null,
          _search_mode: 'contains',
          _status: null,
          _version_id: null,
          _sort_by: 'created_at',
          _sort_dir: 'asc',
          _licensee_id: null,
          _sector_id: filters?.sectorId || null,
          _sla: 'pending',
        }),
        supabase.rpc('get_application_list_page' as any, {
          _page: 0,
          _page_size: 1,
          _search: null,
          _search_mode: 'contains',
          _status: null,
          _version_id: null,
          _sort_by: 'created_at',
          _sort_dir: 'desc',
          _licensee_id: null,
          _sector_id: filters?.sectorId || null,
          _sla: 'breached',
        }),
        supabase.rpc('get_application_list_page' as any, {
          _page: 0,
          _page_size: 1,
          _search: null,
          _search_mode: 'contains',
          _status: null,
          _version_id: null,
          _sort_by: 'created_at',
          _sort_dir: 'desc',
          _licensee_id: null,
          _sector_id: filters?.sectorId || null,
          _sla: 'due_soon',
        }),
      ]);

      const appsPending = Number((pendingRows as any[] | null)?.[0]?.total_count ?? 0);
      const appsSlaBreached = Number((breachedRows as any[] | null)?.[0]?.total_count ?? 0);
      const appsSlaDueSoon = Number((dueSoonRows as any[] | null)?.[0]?.total_count ?? 0);

      // Priority lists (small, ids only)
      const [expiringRes, overdueReturnsRes, highRiskRes, openEnfRes, sumPayRes] = await Promise.all([
        supabase.from('licenses')
          .select('id, license_number, valid_until')
          .eq('status', 'active')
          .gte('valid_until', new Date().toISOString())
          .lte('valid_until', daysFromNow(30))
          .order('valid_until', { ascending: true })
          .limit(5),
        supabase.from('compliance_returns')
          .select('id, due_date, status')
          .in('status', ['pending', 'draft', 'overdue', 'not_submitted'])
          .lt('due_date', todayIso())
          .order('due_date', { ascending: true })
          .limit(5),
        supabase.from('risk_ratings')
          .select('id, entity_id, overall_rating')
          .ilike('overall_rating', 'high%')
          .order('assessment_date', { ascending: false })
          .limit(5),
        supabase.from('enforcement_actions')
          .select('id, case_number, status')
          .in('status', ['open', 'investigation', 'pending'])
          .order('date_opened', { ascending: true })
          .limit(5),
        supabase.from('payments')
          .select('amount, status, paid_at, created_at')
          .limit(1000),
      ]);

      // Aggregate payment amounts client-side from the (RLS-scoped) sample.
      let outstanding_amount = 0;
      let revenue_month = 0;
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      for (const p of ((sumPayRes.data || []) as any[])) {
        const amt = Number(p.amount) || 0;
        if (['pending', 'awaiting_verification'].includes(p.status)) outstanding_amount += amt;
        if (['paid', 'completed', 'verified'].includes(p.status) && p.paid_at && p.paid_at >= startOfMonth) {
          revenue_month += amt;
        }
      }

      const oldestPendingApplications = (pendingRows || []) as any[];
      const oldest = oldestPendingApplications[0] as any;
      const oldestDays = oldest?.created_at
        ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        applications: {
          total: appsTotal,
          draft: appsDraft,
          pending: appsPending,
          submitted: appsSubmittedDirect,
          under_review: appsUnderReview,
          approved: appsApproved,
          rejected: appsRejected,
          returned: appsReturned,
          sla_breached: appsSlaBreached,
          sla_due_soon: appsSlaDueSoon,
          oldest_pending_days: oldestDays,
        },
        licenses: {
          total: licTotal,
          active: licActive,
          expired: licExpired,
          suspended: licSuspended,
          revoked: licRevoked,
          expiring_30d: licExp30,
          expiring_90d: licExp90,
        },
        returns: {
          due_soon: retDueSoon,
          overdue: retOverdue,
          pending_review: retPendingReview,
          submitted: retSubmitted,
          repeat_late_filers: 0,
        },
        payments: {
          pending: payPending,
          paid: payPaid,
          failed: payFailed,
          overdue: payPending, // best-effort
          outstanding_amount,
          revenue_month,
          blocked_applications: 0,
        },
        inspections: {
          scheduled: inspScheduled,
          completed: inspCompleted,
          overdue: inspOverdue,
          high_severity_findings: 0,
        },
        enforcement: {
          open: enfOpen,
          new_this_month: enfNew,
          pending_action: enfPending,
          closed: enfClosed,
          sla_breached: 0,
        },
        complaints: {
          open: cmpOpen,
          pending_triage: 0,
          under_investigation: cmpInvestig,
          closed: cmpClosed,
          high_priority: 0,
          sla_breached: 0,
        },
        risk: {
          high: riskHigh,
          medium: riskMedium,
          low: riskLow,
          high_risk_with_overdue_returns: 0,
        },
        licensees: { total: licenseesTotal, active: licenseesActive },
        workflow: { bottleneck_stage: null, bottleneck_avg_hours: 0 },
        priority_lists: {
          oldest_pending_applications: oldestPendingApplications as any,
          upcoming_license_expiries: (expiringRes.data || []) as any,
          overdue_returns: (overdueReturnsRes.data || []) as any,
          high_risk_entities: (highRiskRes.data || []) as any,
          open_enforcement_cases: (openEnfRes.data || []) as any,
        },
      };
    },
  });
}
