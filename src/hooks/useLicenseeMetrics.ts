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
  licenses: {
    total: number;
    active: number;
    expiring_30d: number;
    expired: number;
    suspended: number;
    revoked: number;
    list: Array<{
      id: string;
      license_number: string | null;
      status: string;
      valid_until: string | null;
      days_until_expiry: number | null;
    }>;
  };
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

interface ResolvedLicenseeScope {
  primaryId: string | null;
  licenseeIds: string[];
}

const EMPTY_METRICS: LicenseeMetrics = {
  licenses: { total: 0, active: 0, expiring_30d: 0, expired: 0, suspended: 0, revoked: 0, list: [] },
  applications: { draft: 0, submitted: 0, approved: 0, rejected: 0 },
  returns: { due_soon: 0, overdue: 0, submitted: 0, pending_review: 0 },
  payments: { pending: 0, paid: 0, outstanding_amount: 0 },
  notifications: { unread: 0 },
  priority_lists: {
    upcoming_returns: [],
    expiring_licenses: [],
    pending_payments: [],
  },
};


async function resolveLicenseeScope(
  activeLicenseeId: string | null | undefined,
  userId: string | undefined,
): Promise<ResolvedLicenseeScope> {
  if (activeLicenseeId) {
    return { primaryId: activeLicenseeId, licenseeIds: [activeLicenseeId] };
  }

  if (!userId) {
    return { primaryId: null, licenseeIds: [] };
  }

  const candidateIds = new Set<string>();

  const [profileRes, holderLicensesRes, recentReturnsRes] = await Promise.all([
    supabase.from('profiles').select('licensee_id, entity_name').eq('id', userId).maybeSingle(),
    supabase.from('licenses').select('id').eq('holder_id', userId),
    supabase
      .from('returns_filed')
      .select('entity_id')
      .eq('created_by', userId)
      .not('entity_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (profileRes.error) {
    console.error('[useLicenseeMetrics] Failed to resolve profile licensee:', profileRes.error);
    throw profileRes.error;
  }
  if (holderLicensesRes.error) {
    console.error('[useLicenseeMetrics] Failed to resolve holder licenses:', holderLicensesRes.error);
    throw holderLicensesRes.error;
  }
  if (recentReturnsRes.error) {
    console.error('[useLicenseeMetrics] Failed to resolve recent return scope:', recentReturnsRes.error);
    throw recentReturnsRes.error;
  }

  const profile = profileRes.data as { licensee_id?: string | null; entity_name?: string | null } | null;
  if (profile?.licensee_id) candidateIds.add(profile.licensee_id);
  ((recentReturnsRes.data || []) as Array<{ entity_id?: string | null }>).forEach((row) => {
    if (row.entity_id) candidateIds.add(row.entity_id);
  });

  const holderLicenseIds = ((holderLicensesRes.data || []) as Array<{ id: string }>).map((row) => row.id);

  if (holderLicenseIds.length > 0) {
    const linkedLicenseesRes = await supabase
      .from('licensees')
      .select('id')
      .in('license_id', holderLicenseIds);

    if (linkedLicenseesRes.error) {
      console.error('[useLicenseeMetrics] Failed to resolve licensees from holder licenses:', linkedLicenseesRes.error);
      throw linkedLicenseesRes.error;
    }

    ((linkedLicenseesRes.data || []) as Array<{ id: string }>).forEach((row) => {
      if (row.id) candidateIds.add(row.id);
    });
  }

  if (candidateIds.size === 0 && profile?.entity_name) {
    const namedLicenseesRes = await supabase
      .from('licensees')
      .select('id')
      .eq('name', profile.entity_name)
      .order('created_at', { ascending: true })
      .limit(5);

    if (namedLicenseesRes.error) {
      console.error('[useLicenseeMetrics] Failed to resolve licensee by entity name:', namedLicenseesRes.error);
      throw namedLicenseesRes.error;
    }

    ((namedLicenseesRes.data || []) as Array<{ id: string }>).forEach((row) => {
      if (row.id) candidateIds.add(row.id);
    });
  }

  const licenseeIds = [...candidateIds];
  return {
    primaryId: licenseeIds[0] ?? null,
    licenseeIds,
  };
}

function buildReturnsScope(licenseeIds: string[]) {
  return licenseeIds
    .flatMap((id) => [`entity_id.eq.${id}`, `on_behalf_of_licensee_id.eq.${id}`])
    .join(',');
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
export async function fetchLicenseeMetrics(activeLicenseeId: string | null | undefined, userId: string | undefined): Promise<LicenseeMetrics> {
      const scope = await resolveLicenseeScope(activeLicenseeId, userId);
      const lid = scope.primaryId;
      const today = todayIso();
      const in30 = daysFromNow(30);
      const returnScope = scope.licenseeIds.length > 0 ? buildReturnsScope(scope.licenseeIds) : null;

      let visibleApps: Awaited<ReturnType<typeof loadVisibleApplications>> = [];
      try {
        visibleApps = await loadVisibleApplications({ licenseeId: lid });
      } catch (error) {
        console.error('[useLicenseeMetrics] Failed to resolve visible applications, continuing with entity metrics only:', error);
      }
      const visibleAppIds = visibleApps.map((app) => app.id).filter(Boolean);
      const visibleAppIdSet = new Set(visibleAppIds);

      const draftApps = visibleApps.filter((app) => app.status === 'draft').length;
      const submittedApps = visibleApps.filter((app) => ['submitted', 'under_review', 'in_progress'].includes(app.status)).length;
      const approvedApps = visibleApps.filter((app) => app.status === 'approved').length;
      const rejectedApps = visibleApps.filter((app) => app.status === 'rejected').length;

      const [entityLicenseLinksRes, returnsRes] = await Promise.all([
        scope.licenseeIds.length > 0
          ? supabase.from('licensees').select('id, license_id').in('id', scope.licenseeIds)
          : Promise.resolve({ data: [], error: null } as any),
        returnScope
          ? supabase
              .from('returns_filed')
              .select('id, unique_id, due_date, workflow_status, entity_id, on_behalf_of_licensee_id')
              .or(returnScope)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (entityLicenseLinksRes.error) {
        console.warn('[useLicenseeMetrics] Could not read licensee links; falling back to holder licenses:', entityLicenseLinksRes.error);
      }
      if (returnsRes.error) {
        console.error('[useLicenseeMetrics] Failed to resolve returns:', returnsRes.error);
        throw returnsRes.error;
      }

      const linkedLicenseIds = ((entityLicenseLinksRes.error ? [] : entityLicenseLinksRes.data || []) as Array<{ license_id?: string | null }>)
        .map((row) => row.license_id)
        .filter(Boolean) as string[];
      const licenseIdSet = new Set<string>(linkedLicenseIds);

      let licenseRows: Array<{ id: string; license_number: string | null; status: string | null; valid_until: string | null }> = [];
      if (licenseIdSet.size > 0) {
        const licensesRes = await supabase
          .from('licenses')
          .select('id, license_number, status, valid_until')
          .in('id', [...licenseIdSet]);

        if (licensesRes.error) {
          console.error('[useLicenseeMetrics] Failed to load scoped licenses:', licensesRes.error);
          throw licensesRes.error;
        }
        licenseRows = (licensesRes.data || []) as any[];
      }

      if (userId) {
        const holderLicensesRes = await supabase
          .from('licenses')
          .select('id, license_number, status, valid_until')
          .eq('holder_id', userId);

        if (holderLicensesRes.error) {
          console.warn('[useLicenseeMetrics] Failed to load holder licenses:', holderLicensesRes.error);
        } else {
          const seenLicenseIds = new Set(licenseRows.map((row) => row.id));
          ((holderLicensesRes.data || []) as any[]).forEach((row) => {
            if (row?.id && !seenLicenseIds.has(row.id)) {
              seenLicenseIds.add(row.id);
              licenseRows.push(row);
            }
          });
        }
      }

      const normalizedLicenseRows = licenseRows.map((row) => ({
        ...row,
        status: String(row.status || '').toLowerCase(),
      }));

      const licTotal = normalizedLicenseRows.length;
      const licActive = normalizedLicenseRows.filter((row) => row.status === 'active').length;
      const licExpiring30 = normalizedLicenseRows.filter((row) => row.status === 'active' && !!row.valid_until && row.valid_until >= today && row.valid_until <= in30).length;
      const licExpired = normalizedLicenseRows.filter((row) => row.status === 'expired' || (row.status === 'active' && !!row.valid_until && row.valid_until < today)).length;
      const licSuspended = normalizedLicenseRows.filter((row) => row.status === 'suspended').length;
      const licRevoked = normalizedLicenseRows.filter((row) => row.status === 'revoked' || row.status === 'cancelled').length;

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const licenseList = normalizedLicenseRows.map((row) => {
        let days: number | null = null;
        if (row.valid_until) {
          const t = new Date(row.valid_until).getTime();
          if (Number.isFinite(t)) days = Math.ceil((t - startOfToday.getTime()) / 86_400_000);
        }
        const effectiveStatus = row.status === 'active' && days !== null && days < 0 ? 'expired' : row.status;
        return {
          id: row.id,
          license_number: row.license_number,
          status: effectiveStatus,
          valid_until: row.valid_until,
          days_until_expiry: days,
        };
      });

      const returnRows = ((returnsRes.data || []) as any[]).map((row) => ({
        ...row,
        workflow_status: String(row.workflow_status || '').toUpperCase(),
      }));
      const UNFILED = ['TEMP', 'WIP', 'TBR'] as const;
      const retDueSoon = returnRows.filter((row) => UNFILED.includes(row.workflow_status) && !!row.due_date && row.due_date >= today && row.due_date <= in30).length;
      const retOverdue = returnRows.filter((row) => UNFILED.includes(row.workflow_status) && !!row.due_date && row.due_date < today).length;
      const retSubmitted = returnRows.filter((row) => ['SUB', 'VAL', 'REJ'].includes(row.workflow_status)).length;
      const retPending = returnRows.filter((row) => row.workflow_status === 'SUB').length;


      // ── Payments (via visible applications) ────────────────────────────────
      const [payPendingRes, payPaidRes] = await Promise.all([
        visibleAppIds.length > 0
          ? supabase.from('payments').select('id', { count: 'exact', head: true }).in('application_id', visibleAppIds).in('status', ['pending', 'awaiting_verification'])
          : Promise.resolve({ count: 0, error: null } as any),
        visibleAppIds.length > 0
          ? supabase.from('payments').select('id', { count: 'exact', head: true }).in('application_id', visibleAppIds).in('status', ['paid', 'completed', 'verified'])
          : Promise.resolve({ count: 0, error: null } as any),
      ]);

      if (payPendingRes.error) {
        console.error('[useLicenseeMetrics] Failed to resolve pending payments:', payPendingRes.error);
        throw payPendingRes.error;
      }
      if (payPaidRes.error) {
        console.error('[useLicenseeMetrics] Failed to resolve paid payments:', payPaidRes.error);
        throw payPaidRes.error;
      }

      const notifUnreadRes = userId
        ? await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)
        : ({ count: 0, error: null } as any);

      if (notifUnreadRes.error) {
        console.error('[useLicenseeMetrics] Failed to resolve unread notifications:', notifUnreadRes.error);
        throw notifUnreadRes.error;
      }

      // ── Priority lists ─────────────────────────────────────────────────────
      const pendingPaymentsRes = visibleAppIds.length > 0
        ? await supabase.from('payments').select('id, application_id, amount, status, created_at').in('application_id', visibleAppIds).in('status', ['pending', 'awaiting_verification']).order('created_at', { ascending: false })
        : ({ data: [] as any[], error: null } as any);

      if (pendingPaymentsRes.error) {
        console.error('[useLicenseeMetrics] Failed to resolve pending payment list:', pendingPaymentsRes.error);
        throw pendingPaymentsRes.error;
      }

      const pendingPayments = ((pendingPaymentsRes.data || []) as any[])
        .filter((payment: any) => visibleAppIdSet.has(payment.application_id));
      const outstanding_amount = pendingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const upcomingReturns = returnRows
        .filter((row) => UNFILED.includes(row.workflow_status) && !!row.due_date && row.due_date >= today)
        .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
        .slice(0, 5)
        .map((r) => ({
        id: r.id,
        unique_id: r.unique_id,
        due_date: r.due_date,
        status: r.workflow_status,
        }));

      const expiringLicenses = normalizedLicenseRows
        .filter((row) => row.status === 'active' && !!row.valid_until)
        .sort((a, b) => String(a.valid_until || '').localeCompare(String(b.valid_until || '')))
        .slice(0, 5)
        .map((row) => ({
          id: row.id,
          license_number: row.license_number,
          valid_until: row.valid_until,
        }));

      return {
        licenses: {
          total: licTotal,
          active: licActive,
          expiring_30d: licExpiring30,
          expired: licExpired,
          suspended: licSuspended,
          revoked: licRevoked,
          list: licenseList,
        },

        applications: { draft: draftApps, submitted: submittedApps, approved: approvedApps, rejected: rejectedApps },
        returns: {
          due_soon: retDueSoon,
          overdue: retOverdue,
          submitted: retSubmitted,
          pending_review: retPending,
        },
        payments: { pending: payPendingRes.count ?? 0, paid: payPaidRes.count ?? 0, outstanding_amount },
        notifications: { unread: notifUnreadRes.count ?? 0 },
        priority_lists: {
          upcoming_returns: upcomingReturns,
          expiring_licenses: expiringLicenses,
          pending_payments: pendingPayments.slice(0, 5) as any,
        },
      };
}

export function useLicenseeMetrics(activeLicenseeId: string | null | undefined, userId: string | undefined) {
  return useQuery<LicenseeMetrics>({
    queryKey: ['licensee-metrics', activeLicenseeId, userId],
    enabled: !!(activeLicenseeId || userId),
    staleTime: 60_000,
    placeholderData: EMPTY_METRICS,
    queryFn: () => fetchLicenseeMetrics(activeLicenseeId, userId),
  });
}
