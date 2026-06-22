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
      // Pull active grace-period policy alongside license data so we can keep
      // a license usable while it sits inside its grace window.
      const { data: settingRow } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'license_expiry')
        .maybeSingle();
      const cfg: any = (settingRow as any)?.value || {};
      const rules: any[] = Array.isArray(cfg.rules) ? cfg.rules : [];
      const defaultGrace = Number(cfg?.default?.grace_period_days) || 0;
      const resolveGrace = (sectorId?: string | null, subSectorId?: string | null, categoryId?: string | null) => {
        const matches = rules
          .filter((r) => !r.sector_id || r.sector_id === sectorId)
          .filter((r) => !r.sub_sector_id || r.sub_sector_id === subSectorId)
          .filter((r) => !r.category_id || r.category_id === categoryId)
          .map((r) => ({
            r,
            score: (r.category_id ? 4 : 0) + (r.sub_sector_id ? 2 : 0) + (r.sector_id ? 1 : 0),
          }))
          .sort((a, b) => b.score - a.score);
        return matches.length ? Number(matches[0].r.grace_period_days) || 0 : defaultGrace;
      };

      // licensees.license_id -> licenses.status, fall back to licenses.holder_id
      const { data: licensee } = await supabase
        .from('licensees')
        .select('id, license_id, status')
        .eq('id', activeLicenseeId!)
        .maybeSingle();

      let licenseStatus: string | null = null;
      let validUntil: string | null = null;
      let sectorId: string | null = null;
      let subSectorId: string | null = null;
      let categoryId: string | null = null;

      if (licensee?.license_id) {
        const { data: lic } = await supabase
          .from('licenses')
          .select('status, valid_until, sector_id, sub_sector_id, category_id')
          .eq('id', licensee.license_id)
          .maybeSingle();
        if (lic?.status) {
          licenseStatus = lic.status;
          validUntil = lic.valid_until;
          sectorId = (lic as any).sector_id ?? null;
          subSectorId = (lic as any).sub_sector_id ?? null;
          categoryId = (lic as any).category_id ?? null;
        }
      }

      if (!licenseStatus) {
        const { data: held } = await supabase
          .from('licenses')
          .select('status, valid_until, sector_id, sub_sector_id, category_id, issued_at')
          .eq('holder_id', activeLicenseeId!)
          .order('issued_at', { ascending: false })
          .limit(1);
        if (held && held[0]?.status) {
          licenseStatus = held[0].status;
          validUntil = (held[0] as any).valid_until;
          sectorId = (held[0] as any).sector_id ?? null;
          subSectorId = (held[0] as any).sub_sector_id ?? null;
          categoryId = (held[0] as any).category_id ?? null;
        }
      }

      if (!licenseStatus && licensee?.status) {
        licenseStatus = licensee.status;
      }

      // Grace handling via shared helper — keeps the rule identical to UI.
      if (licenseStatus && validUntil) {
        const { getLicenseValidity } = await import('@/lib/licenseValidity');
        const graceDays = resolveGrace(sectorId, subSectorId, categoryId);
        const v = getLicenseValidity({
          status: licenseStatus,
          valid_until: validUntil,
          grace_period_days: graceDays,
        });
        if (v.in_grace_period) licenseStatus = 'active';
        else if (v.is_past_grace) licenseStatus = 'expired';
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
