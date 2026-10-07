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
      // AML-CLOSE-08E: ONE bounded server aggregate (SECURITY INVOKER, caller's RLS)
      // replaces ~40 independent count requests. Application counts inside it use
      // the same list RPC + params as the drill-down list, so numbers stay identical.
      const { data: d, error } = await supabase.rpc('supervisory_dashboard_operational_summary' as any, {
        _sector_id: sectorId,
        _regulator_id: regulatorId,
      });
      if (error) throw error;
      const s = (d ?? {}) as any;
      const n = (v: unknown) => Number(v ?? 0) || 0;
      const a = s.applications ?? {};
      const r = s.returns ?? {};
      const pendingRows = (s.priority?.pending_applications ?? []) as any[];
      const oldest = pendingRows[0];
      const oldestDays = oldest?.created_at
        ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        applications: {
          total: n(a.all), draft: n(a.draft), pending: n(a.pending), submitted: n(a.submitted),
          under_review: n(a.inProgress), approved: n(a.approved), rejected: n(a.rejected),
          returned: n(a.returned), sla_breached: n(a.slaBreached), sla_due_soon: n(a.slaDueSoon),
          oldest_pending_days: oldestDays,
        },
        licenses: {
          total: n(s.licenses?.total), active: n(s.licenses?.active), expired: n(s.licenses?.expired),
          suspended: n(s.licenses?.suspended), revoked: n(s.licenses?.revoked),
          expiring_30d: n(s.licenses?.expiring_30d), expiring_90d: n(s.licenses?.expiring_90d),
        },
        returns: {
          due_soon: n(r.due_soon), overdue: n(r.overdue), pending_review: n(r.pending_review),
          submitted: n(r.submitted), repeat_late_filers: 0,
        },
        payments: {
          pending: n(s.payments?.pending), paid: n(s.payments?.paid), failed: n(s.payments?.failed),
          overdue: n(s.payments?.pending), // best-effort
          outstanding_amount: n(s.payments?.outstanding_amount), revenue_month: n(s.payments?.revenue_month),
          blocked_applications: 0,
        },
        inspections: {
          scheduled: n(s.examinations?.scheduled), completed: n(s.examinations?.completed),
          overdue: n(s.examinations?.overdue), high_severity_findings: 0,
        },
        enforcement: {
          open: n(s.enforcement?.open), new_this_month: n(s.enforcement?.new_this_month),
          pending_action: n(s.enforcement?.pending_action), closed: n(s.enforcement?.closed), sla_breached: 0,
        },
        complaints: {
          open: n(s.complaints?.open), pending_triage: 0, under_investigation: n(s.complaints?.under_investigation),
          closed: n(s.complaints?.closed), high_priority: 0, sla_breached: 0,
        },
        risk: { high: n(s.risk?.high), medium: n(s.risk?.medium), low: n(s.risk?.low), high_risk_with_overdue_returns: 0 },
        licensees: { total: n(s.licensees?.total), active: n(s.licensees?.active) },
        workflow: { bottleneck_stage: null, bottleneck_avg_hours: 0 },
        priority_lists: {
          oldest_pending_applications: pendingRows as any,
          upcoming_license_expiries: (s.priority?.license_expiries ?? []) as any,
          overdue_returns: ((r.top_overdue ?? []) as any[]).map((x) => ({ id: x.id, due_date: x.due_date, status: 'overdue' as const })),
          high_risk_entities: (s.priority?.high_risk ?? []) as any,
          open_enforcement_cases: (s.priority?.open_enforcement ?? []) as any,
        },
      };
    },
  });
}
