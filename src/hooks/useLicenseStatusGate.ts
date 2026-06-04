import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';

/**
 * Statuses that block licensees from submitting new regulated activity
 * (post-license applications, returns, etc.).
 */
const BLOCKED_STATUSES = new Set([
  'suspended',
  'revoked',
  'cancelled',
  'canceled',
  'expired',
  'inactive',
]);

const ALLOWED_STATUSES = new Set([
  'active',
  'approved',
  'issued',
  'valid',
  'in_good_standing',
]);

function normalize(s: any): string {
  return String(s || '').trim().toLowerCase();
}

export interface LicenseStatusGate {
  loading: boolean;
  /** Raw normalized status of the licensee's active license, or null if none found. */
  status: string | null;
  /** True when the license is in a blocked state (suspended/revoked/etc.). */
  isBlocked: boolean;
  /** True when license exists and is in an allowed/active state. */
  isActive: boolean;
  /** Human-readable reason for blocking, suitable for banners. */
  blockedReason: string | null;
  /** The licensee id used for the lookup, if resolvable. */
  licenseeId: string | null;
}

/**
 * Resolves the license status for the current licensee user (or the PPOC's
 * active licensee selection) and reports whether new regulated activity is
 * allowed. Internal staff and pre-licensees (no licensee_id) are never blocked.
 */
export function useLicenseStatusGate(): LicenseStatusGate {
  const { user } = useAuth();
  const ppoc = (() => {
    try { return usePpoc(); } catch { return null as any; }
  })();
  const activeLicenseeId: string | null =
    (ppoc?.isPpoc ? ppoc?.activeLicenseeId : null) || user?.licenseeId || null;

  const { data, isLoading } = useQuery({
    queryKey: ['license-status-gate', activeLicenseeId, user?.id],
    enabled: !!user && !!activeLicenseeId,
    staleTime: 60_000,
    queryFn: async () => {
      // licensees.license_id -> licenses.status, fall back to licenses.holder_id
      const { data: licensee } = await supabase
        .from('licensees')
        .select('id, license_id, status')
        .eq('id', activeLicenseeId!)
        .maybeSingle();

      let licenseStatus: string | null = null;

      if (licensee?.license_id) {
        const { data: lic } = await supabase
          .from('licenses')
          .select('status')
          .eq('id', licensee.license_id)
          .maybeSingle();
        if (lic?.status) licenseStatus = lic.status;
      }

      if (!licenseStatus) {
        // Fallback: most recently-issued license held by this licensee
        const { data: held } = await supabase
          .from('licenses')
          .select('status, issued_at')
          .eq('holder_id', activeLicenseeId!)
          .order('issued_at', { ascending: false })
          .limit(1);
        if (held && held[0]?.status) licenseStatus = held[0].status;
      }

      if (!licenseStatus && licensee?.status) {
        licenseStatus = licensee.status;
      }

      return { status: licenseStatus };
    },
  });

  const status = normalize(data?.status) || null;

  // If there's no licensee context at all (e.g. internal staff, pre-licensee),
  // do not block — these flows aren't covered by this gate.
  if (!activeLicenseeId) {
    return { loading: false, status: null, isBlocked: false, isActive: false, blockedReason: null, licenseeId: null };
  }

  const isBlocked = !!status && BLOCKED_STATUSES.has(status);
  const isActive = !!status && (ALLOWED_STATUSES.has(status) || (!isBlocked && status === 'active'));

  let blockedReason: string | null = null;
  if (isBlocked) {
    const pretty = status!.charAt(0).toUpperCase() + status!.slice(1);
    blockedReason =
      `Your license is currently ${pretty}. New applications and return submissions ` +
      `are disabled until the license is restored to good standing. You can still view ` +
      `existing records and history. Please contact the regulator for assistance.`;
  }

  return {
    loading: isLoading,
    status,
    isBlocked,
    isActive,
    blockedReason,
    licenseeId: activeLicenseeId,
  };
}
