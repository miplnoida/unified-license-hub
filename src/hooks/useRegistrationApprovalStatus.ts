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

export function useRegistrationApprovalStatus(): RegistrationApprovalState {
  const { user } = useAuth();
  const isPreLicensee = user?.role === 'pre_licensee';
  const userId = user?.id;

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
      if (!reg) return { reg: null, remarks: null as string | null };

      // Pull the most recent reviewer remark for this registration, if any.
      let remarks: string | null = null;
      try {
        const { data: actions } = await supabase
          .from('approval_actions')
          .select('comments, created_at')
          .eq('entity_type', 'registration')
          .eq('entity_id', reg.id)
          .order('created_at', { ascending: false })
          .limit(1);
        remarks = actions?.[0]?.comments ?? null;
      } catch {
        /* ignore — remarks are best-effort */
      }
      return { reg, remarks };
    },
    staleTime: 30_000,
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

  return {
    enforced: true,
    isApproved: !!reg && isApprovedCategory(category),
    loading: query.isLoading,
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
