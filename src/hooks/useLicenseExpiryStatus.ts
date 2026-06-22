import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLicenseExpiryConfig } from './useLicenseExpiryConfig';

export interface LicenseExpiryStatus {
  license_id: string;
  license_number: string | null;
  valid_until: string | null;
  /** valid_until + grace_period_days. Until this date the license is still usable. */
  grace_ends_on: string | null;
  /** Same as grace_ends_on — the effective validity end including grace. */
  effective_valid_until: string | null;
  status: string;
  days_until_expiry: number | null;
  /** True only when the grace period has ended (license is past grace). */
  is_expired: boolean;
  in_reminder_window: boolean;
  /** True when the original valid_until has passed but grace period is still active. */
  in_grace_period: boolean;
}

const dayDiff = (target: string): number => {
  const t = new Date(target).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / 86_400_000);
};

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export function useLicenseExpiryStatus(userId: string | undefined) {
  const { data: config } = useLicenseExpiryConfig();

  return useQuery({
    queryKey: ['license_expiry_status', userId, config?.rules?.length, config?.default],
    enabled: !!userId && !!config,
    queryFn: async (): Promise<LicenseExpiryStatus[]> => {
      if (!userId || !config) return [];
      const { data, error } = await (supabase
        .from('licenses' as any)
        .select('id, license_number, valid_until, status, sector_id, sub_sector_id, category_id')
        .eq('holder_id', userId) as any);
      if (error) {
        console.error('[useLicenseExpiryStatus]', error);
        return [];
      }
      const results: LicenseExpiryStatus[] = [];
      for (const lic of (data || []) as any[]) {
        if (!lic.valid_until) continue;
        const policy = config.resolveFor({
          sector_id: lic.sector_id,
          sub_sector_id: lic.sub_sector_id,
          category_id: lic.category_id,
        });
        const maxReminder = Math.max(0, ...(policy.reminder_days || [0]));
        const graceDays = policy.grace_period_days || 0;
        const days = dayDiff(lic.valid_until);
        const graceEndsOn = addDays(lic.valid_until, graceDays);
        const daysUntilGraceEnd = dayDiff(graceEndsOn);
        // Past original expiry but still within the grace window.
        const inGrace = days < 0 && daysUntilGraceEnd >= 0;
        // Expired only when grace has fully elapsed (or status flagged and no grace left).
        const isExpired = daysUntilGraceEnd < 0 || (lic.status === 'expired' && graceDays === 0);
        const inReminder = !inGrace && !isExpired && days <= maxReminder && days >= 0;
        if (inReminder || inGrace || isExpired) {
          results.push({
            license_id: lic.id,
            license_number: lic.license_number,
            valid_until: lic.valid_until,
            grace_ends_on: graceEndsOn,
            effective_valid_until: graceEndsOn,
            status: lic.status,
            days_until_expiry: days,
            is_expired: isExpired,
            in_reminder_window: inReminder,
            in_grace_period: inGrace,
          });
        }
      }
      return results.sort((a, b) => (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0));
    },
    staleTime: 60_000,
  });
}
