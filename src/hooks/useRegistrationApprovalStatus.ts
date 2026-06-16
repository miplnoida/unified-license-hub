/**
 * Pre-licensee registration approval gate.
 *
 * Fetches the user's latest `registrations` row and surfaces the
 * approval category so route guards / status page can block dashboard
 * access until the registration is approved.
 *
 * Only meaningful for `pre_licensee` users — for everyone else the hook
 * returns `enforced: false` and approval is implicitly granted.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  categorizeRegistrationStatus,
  isApprovedCategory,
  type RegistrationCategory,
} from '@/lib/registrationStatus';

export interface RegistrationApprovalState {
  /** Whether this user is subject to the registration approval gate. */
  enforced: boolean;
  /** True when not enforced, or when the latest registration is approved. */
  isApproved: boolean;
  loading: boolean;
  category: RegistrationCategory;
  registration: {
    id: string;
    status: string | null;
    registration_reference: string | null;
    created_at: string | null;
    updated_at: string | null;
    remarks: string | null;
  } | null;
}

type CachedStatus = {
  reg: RegistrationApprovalState['registration'];
  remarks: string | null;
};

/**
 * Session-storage cache keyed by user id. Used as React Query's `initialData`
 * so returning pre-licensee users get an immediate render (no visible
 * "checking registration" loader on every navigation/login) while the query
 * silently refetches in the background. Scoping by user id prevents leakage
 * across accounts on a shared browser.
 */
const cacheKey = (userId: string) => `registration_approval_cache:${userId}`;

function readCache(userId: string): CachedStatus | undefined {
  try {
    const raw = sessionStorage.getItem(cacheKey(userId));
    if (!raw) return undefined;
    return JSON.parse(raw) as CachedStatus;
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, value: CachedStatus) {
  try {
    sessionStorage.setItem(cacheKey(userId), JSON.stringify(value));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function useRegistrationApprovalStatus(): RegistrationApprovalState {
  const { user } = useAuth();
  const isPreLicensee = user?.role === 'pre_licensee';
  const userId = user?.id;

  const initialData = userId ? readCache(userId) : undefined;

  const query = useQuery({
    enabled: !!userId && isPreLicensee,
    queryKey: ['registration_approval_status', userId],
    queryFn: async () => {
      const { data: reg, error } = await supabase
        .from('registrations')
        .select('id, status, registration_reference, created_at, updated_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!reg) {
        const result = { reg: null, remarks: null as string | null };
        if (userId) writeCache(userId, result as CachedStatus);
        return result;
      }

      let remarks: string | null = null;
      try {
        // Exclude the applicant's own resubmit audit row (and any other
        // self-authored action) so the status page surfaces the latest
        // *reviewer* remark, not "Applicant resubmitted registration".
        const { data: actions } = await supabase
          .from('approval_actions')
          .select('comments, created_at, actor_id, action, action_type')
          .eq('entity_type', 'registration')
          .eq('entity_id', reg.id)
          .neq('actor_id', userId!)
          .order('created_at', { ascending: false })
          .limit(5);
        const reviewerAction = (actions ?? []).find(
          (a) =>
            (a as any).action !== 'resubmit' &&
            (a as any).action_type !== 'resubmit' &&
            !!(a as any).comments,
        );
        remarks = (reviewerAction as any)?.comments ?? null;
      } catch {
        /* ignore — remarks are best-effort */
      }
      const result = { reg, remarks };
      if (userId) writeCache(userId, result as CachedStatus);
      return result;
    },
    staleTime: 30_000,
    initialData: initialData as any,
  });

  if (!isPreLicensee) {
    return {
      enforced: false,
      isApproved: true,
      loading: false,
      category: 'approved',
      registration: null,
    };
  }

  const reg = query.data?.reg ?? null;
  const category = categorizeRegistrationStatus(reg?.status);

  // Only treat as "loading" when we have nothing at all to render. With
  // cached initialData this is false on every visit after the first, so the
  // gate/status page no longer flashes a "checking…" screen on each login.
  const loading = query.isLoading && !query.data && !initialData;

  return {
    enforced: true,
    isApproved: !!reg && isApprovedCategory(category),
    loading,
    category,

    registration: reg
      ? {
          id: reg.id,
          status: reg.status,
          registration_reference: reg.registration_reference,
          created_at: reg.created_at,
          updated_at: reg.updated_at,
          remarks: query.data?.remarks ?? null,
        }
      : null,
  };
}
