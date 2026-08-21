import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APPLICATION_DRILLDOWNS, type ApplicationDrilldownKey } from '@/lib/dashboardDrilldowns';
import { fetchCanonicalReturnsSummary } from '@/lib/returns/canonicalReturnsSummary';

import {
  getAdminReturnDisplayStatus,
  mapReturnWorkflowStatus,
  todayDateIso,
} from '@/lib/adminReturnFilters';

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

const head = async (q: any, label?: string): Promise<number> => {
  const { count, error } = await q;
  if (error) {
    if (import.meta.env.DEV) console.warn('[useSupervisoryMetrics] count failed', label, error);
    return 0;
  }
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

// Sentinel used with `.in(col, [...])` when a sector filter is active but the
// sector has zero licensees — guarantees zero matching rows instead of the
// `.in()` no-op behaviour (which would otherwise return everything).
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

// EPR-01: Return volumes come from the canonical model via a server-side
// aggregate (`returns_supervisory_summary`) over `return_filings` /
// `v_return_filing_workflow_state`. The retired `returns_filed` table is no
// longer read here, and no KPI is derived from `rows.length`.
const fetchReturnsFiledSummary = async (sectorId: string | null) => {
  const summary = await fetchCanonicalReturnsSummary(sectorId);
  return {
    counts: {
      overdue: summary.overdue,
      pending_review: summary.pending_review,
      submitted: summary.submitted,
      due_soon: summary.due_soon,
    },
    overdueRows: (summary.top_overdue || []).map((r) => ({
      id: r.id,
      due_date: r.due_date,
      status: 'overdue' as const,
    })),
  };
};


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
      // Coerce empty strings to null so we never send `.eq('col', '')` which returns 0 rows.
      const sectorId = filters?.sectorId && filters.sectorId.trim() ? filters.sectorId : null;
      const regulatorId = filters?.regulatorId && filters.regulatorId.trim() ? filters.regulatorId : null;
      const sectorEq = (q: any) => sectorId ? q.eq('sector_id', sectorId) : q;
      const regulatorEq = (q: any) => regulatorId ? q.eq('regulator_id', regulatorId) : q;

      // Several tables (complaints, enforcement_actions, inspections,
      // risk_ratings) reference the regulated entity via `entity_id`/
      // `licensee_id` rather than carrying their own `sector_id` column, so a
      // sector filter has to resolve through `licensees.sector_id` first.
      // Resolved once per dashboard load and reused across every query below.
      const licenseeIdsForSector: string[] | null = sectorId
        ? ((await supabase.from('licensees').select('id').eq('sector_id', sectorId)).data || []).map((r: any) => r.id)
        : null;
      const entityIdsForFilter = licenseeIdsForSector && licenseeIdsForSector.length === 0
        ? [NO_MATCH_ID]
        : licenseeIdsForSector;
      const entityEq = (q: any, column: string) => entityIdsForFilter ? q.in(column, entityIdsForFilter) : q;

      /**
       * Count helper — runs get_application_list_page with the canonical
       * rpcParams declared in APPLICATION_DRILLDOWNS for `key` and returns
       * the RPC's total_count. This is the SAME RPC + params the
       * /applications/queue page invokes when the user clicks the link,
       * so dashboard count and list count are guaranteed identical, and it
       * already resolves `_sector_id` server-side, so this is the source of
       * truth for every sector-aware application metric below (including
       * the "total" tile, which used to be a raw, sector-blind count).
       */
      const countDrilldown = async (key: ApplicationDrilldownKey, pageSize = 1, sortDir: 'asc' | 'desc' = 'desc') => {
        const def = APPLICATION_DRILLDOWNS[key];
        const rpcParams = def.rpcParams as { _status?: string | null; _status_group?: string | null; _sla?: string | null };
        const { data } = await supabase.rpc('get_application_list_page' as any, {
          _page: 0,
          _page_size: pageSize,
          _search: null,
          _search_mode: 'contains',
          _status: rpcParams._status ?? null,
          _version_id: null,
          _sort_by: 'created_at',
          _sort_dir: sortDir,
          _licensee_id: null,
          _sector_id: sectorId,
          _sla: rpcParams._sla ?? null,
          _status_group: rpcParams._status_group ?? null,
        });
        const rows = (data as any[] | null) || [];
        return { rows, count: Number(rows[0]?.total_count ?? 0) };
      };

      const [
        licTotal, licActive, licExpired, licSuspended, licRevoked, licExp30, licExp90,
        returnsFiledSummary,
        payPending, payPaid, payFailed,
        inspScheduled, inspCompleted, inspOverdue,
        enfOpen, enfNew, enfPending, enfClosed,
        cmpOpen, cmpInvestig, cmpClosed,
        riskHigh, riskMedium, riskLow,
        licenseesTotal, licenseesActive,
      ] = await Promise.all([
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true })))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'expired')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'suspended')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'revoked')))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('valid_until', daysFromNow(30)).gte('valid_until', new Date().toISOString())))),
        head(sectorEq(regulatorEq(supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('valid_until', daysFromNow(90)).gte('valid_until', new Date().toISOString())))),

        fetchReturnsFiledSummary(sectorId),

        head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('status', ['pending', 'awaiting_verification'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('status', ['paid', 'completed', 'verified'])),
        head(supabase.from('payments').select('*', { count: 'exact', head: true }).in('status', ['failed', 'rejected'])),

        head(entityEq(supabase.from('inspections').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'planned']), 'entity_id')),
        head(entityEq(supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'completed'), 'entity_id')),
        head(entityEq(supabase.from('inspections').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'planned']).lt('date_conducted', todayIso()), 'entity_id')),

        head(entityEq(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).in('status', ['open', 'investigation', 'pending']), 'entity_id')),
        head(entityEq(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).gte('date_opened', daysAgo(30).slice(0, 10)), 'entity_id')),
        head(entityEq(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).eq('status', 'pending'), 'entity_id')),
        head(entityEq(supabase.from('enforcement_actions').select('*', { count: 'exact', head: true }).eq('status', 'closed'), 'entity_id')),

        head(regulatorEq(entityEq(supabase.from('complaints').select('*', { count: 'exact', head: true }).in('status', ['open', 'submitted', 'pending', 'under_investigation']), 'licensee_id'))),
        head(regulatorEq(entityEq(supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'under_investigation'), 'licensee_id'))),
        head(regulatorEq(entityEq(supabase.from('complaints').select('*', { count: 'exact', head: true }).in('status', ['closed', 'resolved']), 'licensee_id'))),

        head(entityEq(supabase.from('risk_ratings').select('*', { count: 'exact', head: true }).ilike('overall_rating', 'high%'), 'entity_id')),
        head(entityEq(supabase.from('risk_ratings').select('*', { count: 'exact', head: true }).ilike('overall_rating', 'medium%'), 'entity_id')),
        head(entityEq(supabase.from('risk_ratings').select('*', { count: 'exact', head: true }).ilike('overall_rating', 'low%'), 'entity_id')),

        head(sectorEq(supabase.from('licensees').select('*', { count: 'exact', head: true }))),
        head(sectorEq(supabase.from('licensees').select('*', { count: 'exact', head: true }).eq('status', 'active'))),
      ]);

      // All per-status application metrics (including the overall total,
      // via the `all` drilldown) resolve via the SAME RPC the drill-down
      // list uses, with rpcParams sourced from the central dashboard
      // drill-down registry. This guarantees the dashboard count for each
      // metric is identical to the count shown on /applications/queue when
      // the user follows the link, and that every one is sector-aware.
      const [
        allRes, pendingRes, slaBreachedRes, slaDueSoonRes,
        draftRes, submittedRes, inProgressRes, approvedRes, rejectedRes, returnedRes,
      ] = await Promise.all([
        countDrilldown('all'),
        countDrilldown('pending', 5, 'asc'),
        countDrilldown('slaBreached'),
        countDrilldown('slaDueSoon'),
        countDrilldown('draft'),
        countDrilldown('submitted'),
        countDrilldown('inProgress'),
        countDrilldown('approved'),
        countDrilldown('rejected'),
        countDrilldown('returned'),
      ]);

      const appsTotal = allRes.count;
      const pendingRows = pendingRes.rows;
      const appsPending = pendingRes.count;
      const appsSlaBreached = slaBreachedRes.count;
      const appsSlaDueSoon = slaDueSoonRes.count;
      const appsDraft = draftRes.count;
      const appsSubmittedDirect = submittedRes.count;
      const appsUnderReview = inProgressRes.count;
      const appsApproved = approvedRes.count;
      const appsRejected = rejectedRes.count;
      const appsReturned = returnedRes.count;

      // Priority lists (small, ids only) — same sector scoping as their
      // corresponding aggregate counts above.
      const [expiringRes, highRiskRes, openEnfRes, sumPayRes] = await Promise.all([
        sectorEq(
          supabase.from('licenses')
            .select('id, license_number, valid_until')
            .eq('status', 'active')
            .gte('valid_until', new Date().toISOString())
            .lte('valid_until', daysFromNow(30))
            .order('valid_until', { ascending: true })
            .limit(5)
        ),
        entityEq(
          supabase.from('risk_ratings')
            .select('id, entity_id, overall_rating')
            .ilike('overall_rating', 'high%')
            .order('assessment_date', { ascending: false })
            .limit(5),
          'entity_id'
        ),
        entityEq(
          supabase.from('enforcement_actions')
            .select('id, case_number, status')
            .in('status', ['open', 'investigation', 'pending'])
            .order('date_opened', { ascending: true })
            .limit(5),
          'entity_id'
        ),
        supabase.from('payments')
          .select('amount, status, paid_at, created_at')
          .limit(1000),
      ]);

      // Aggregate payment amounts client-side from the (RLS-scoped) sample.
      // NOTE: payments have no direct sector/licensee link (only
      // `application_id`), so this tile is not yet sector-filterable
      // without an extra join through applications — left unfiltered.
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
          due_soon: returnsFiledSummary.counts.due_soon,
          overdue: returnsFiledSummary.counts.overdue,
          pending_review: returnsFiledSummary.counts.pending_review,
          submitted: returnsFiledSummary.counts.submitted,
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
          overdue_returns: returnsFiledSummary.overdueRows as any,
          high_risk_entities: (highRiskRes.data || []) as any,
          open_enforcement_cases: (openEnfRes.data || []) as any,
        },
      };
    },
  });
}
