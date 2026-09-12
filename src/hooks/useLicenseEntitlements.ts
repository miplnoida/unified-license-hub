import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';

/**
 * CANONICAL LICENCE ENTITLEMENT RESOLVER (client side).
 *
 * Single source of truth for "what may this user actually do, and for which
 * licence?". It is a thin wrapper over `public.entity_license_entitlements`,
 * which derives the caller server-side and applies the same status +
 * grace-period rules the database uses when it validates a write.
 *
 * Registration approval is NEVER an entitlement. Post-licence services and
 * regulatory returns require an eligible (approved / issued / in-grace)
 * licence covering the sector being acted on.
 *
 * Components may use this to shape the UI, but every create / save / submit
 * path re-validates the same rule in the database (`can_act_on_license`).
 */

export interface LicenseEntitlement {
  license_id: string;
  licensee_id: string | null;
  licensee_name: string | null;
  license_number: string | null;
  license_type: string | null;
  status: string | null;
  /** active | active_grace | expired | suspended | revoked | cancelled | inactive | pending */
  effective_status: string;
  regulator_id: string | null;
  sector_id: string | null;
  sector_name: string | null;
  sub_sector_id: string | null;
  sub_sector_name: string | null;
  category_id: string | null;
  category_name: string | null;
  issued_at: string | null;
  valid_until: string | null;
  grace_period_days: number | null;
  grace_ends_on: string | null;
  in_grace_period: boolean;
  is_eligible_for_new_activity: boolean;
}

export interface LicenseEntitlementsResult {
  loading: boolean;
  /** Every licence resolvable for the active entity/user (eligible or not). */
  licenses: LicenseEntitlement[];
  /** Licences that currently permit new regulated activity. */
  eligible: LicenseEntitlement[];
  /** True when at least one licence permits new regulated activity. */
  hasEligibleLicense: boolean;
  /** True when licences exist but none are currently eligible. */
  hasBlockedLicenseOnly: boolean;
  /** Non-technical explanation for why new activity is unavailable (null when it is). */
  unavailableReason: string | null;
  /** Sector ids the user may act on right now. */
  eligibleSectorIds: string[];
  refetch: () => void;
}

const STATUS_COPY: Record<string, string> = {
  suspended: 'suspended',
  revoked: 'revoked',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  inactive: 'inactive',
  expired: 'expired',
  pending: 'not yet issued',
};

export function useLicenseEntitlements(targetLicenseeId?: string | null): LicenseEntitlementsResult {
  const { user } = useAuth();
  // usePpoc() returns a safe stub outside its provider, so it is called
  // unconditionally here — hook order must never depend on a try/catch.
  const ppoc = usePpoc();


  // PPOC users recalculate against the entity they are currently acting for.
  const scopedLicenseeId: string | null =
    targetLicenseeId
    ?? (ppoc?.isPpoc ? (ppoc?.activeLicenseeId as string | null) : null)
    ?? null;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['license-entitlements', scopedLicenseeId, user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<LicenseEntitlement[]> => {
      const { data, error } = await (supabase.rpc as any)('entity_license_entitlements', {
        target_licensee_id: scopedLicenseeId,
      });
      if (error) throw new Error(error.message);
      return (data || []) as LicenseEntitlement[];
    },
  });

  return useMemo(() => {
    const licenses = data || [];
    const eligible = licenses.filter(l => l.is_eligible_for_new_activity);
    const hasEligibleLicense = eligible.length > 0;
    const hasBlockedLicenseOnly = !hasEligibleLicense && licenses.length > 0;

    let unavailableReason: string | null = null;
    if (!isLoading && !hasEligibleLicense) {
      if (licenses.length === 0) {
        unavailableReason =
          'Post-licence services and regulatory returns become available once your licence has been approved and issued. '
          + 'You can continue with your pre-licensing application in the meantime.';
      } else {
        const worst = licenses[0];
        const label = STATUS_COPY[worst.effective_status] || worst.effective_status;
        unavailableReason =
          `This service is unavailable because the related licence is currently ${label}. `
          + 'You can still view your existing records and history. Please contact the regulator for assistance.';
      }
    }

    return {
      loading: isLoading,
      licenses,
      eligible,
      hasEligibleLicense,
      hasBlockedLicenseOnly,
      unavailableReason,
      eligibleSectorIds: Array.from(new Set(eligible.map(l => l.sector_id).filter(Boolean) as string[])),
      refetch,
    };
  }, [data, isLoading, refetch]);
}
