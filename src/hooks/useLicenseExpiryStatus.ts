import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLicenseExpiryConfig } from './useLicenseExpiryConfig';
import { getLicenseValidity } from '@/lib/licenseValidity';

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

export function useLicenseExpiryStatus(userOrLicenseeId: string | undefined) {
  const { data: config } = useLicenseExpiryConfig();

  return useQuery({
    queryKey: ['license_expiry_status', userOrLicenseeId, config?.rules?.length, config?.default],
    enabled: !!userOrLicenseeId && !!config,
    queryFn: async (): Promise<LicenseExpiryStatus[]> => {
      if (!userOrLicenseeId || !config) return [];

      // Pull licenses scoped both ways:
      //  1) directly owned (licenses.holder_id = id)
      //  2) linked via a licensee row (licensees.license_id, where licensees.id = id)
      const [heldRes, linkRes] = await Promise.all([
        supabase
          .from('licenses' as any)
          .select('id, license_number, valid_until, status, sector_id, sub_sector_id, category_id')
          .eq('holder_id', userOrLicenseeId),
        supabase
          .from('licensees' as any)
          .select('license_id')
          .eq('id', userOrLicenseeId),
      ]);

      if (heldRes.error) {
        console.error('[useLicenseExpiryStatus] held', heldRes.error);
      }

      const seen = new Set<string>();
      const licenses: any[] = [];
      for (const row of ((heldRes.data || []) as any[])) {
        if (row?.id && !seen.has(row.id)) { seen.add(row.id); licenses.push(row); }
      }

      const linkedIds = (((linkRes.data || []) as any[])
        .map((r) => r?.license_id)
        .filter(Boolean)) as string[];
      const missingLinked = linkedIds.filter((id) => !seen.has(id));
      if (missingLinked.length) {
        const { data: extra, error: extraErr } = await (supabase
          .from('licenses' as any)
          .select('id, license_number, valid_until, status, sector_id, sub_sector_id, category_id')
          .in('id', missingLinked) as any);
        if (extraErr) console.error('[useLicenseExpiryStatus] linked', extraErr);
        for (const row of ((extra || []) as any[])) {
          if (row?.id && !seen.has(row.id)) { seen.add(row.id); licenses.push(row); }
        }
      }

      const results: LicenseExpiryStatus[] = [];
      for (const lic of licenses) {
        if (!lic?.valid_until) continue;
        const policy = config.resolveFor({
          sector_id: lic.sector_id,
          sub_sector_id: lic.sub_sector_id,
          category_id: lic.category_id,
        });
        const v = getLicenseValidity({
          status: lic.status,
          valid_until: lic.valid_until,
          grace_period_days: policy.grace_period_days,
        });
        const maxReminder = Math.max(0, ...(policy.reminder_days || [0]));
        const days = v.days_until_expiry ?? 0;
        const inReminder = !v.in_grace_period && !v.is_past_grace && days <= maxReminder && days >= 0;
        if (inReminder || v.in_grace_period || v.is_past_grace) {
          results.push({
            license_id: lic.id,
            license_number: lic.license_number,
            valid_until: lic.valid_until,
            grace_ends_on: v.grace_ends_on,
            effective_valid_until: v.grace_ends_on,
            status: lic.status,
            days_until_expiry: v.days_until_expiry,
            is_expired: v.is_past_grace,
            in_reminder_window: inReminder,
            in_grace_period: v.in_grace_period,
          });
        }
      }
      return results.sort((a, b) => (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0));
    },
    staleTime: 60_000,
  });
}
