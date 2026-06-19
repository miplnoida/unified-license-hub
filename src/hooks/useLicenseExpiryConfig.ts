import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CycleType = 'annual' | 'periodic';
export type RenewalFeeMode = 'free' | 'paid';

export interface LicenseExpiryConfig {
  cycle_type: CycleType;
  period_days: number;
  reminder_days: number[];
  renewal_fee_mode: RenewalFeeMode;
  renewal_fee_amount: number;
  renewal_fee_currency: string;
  grace_period_days: number;
  auto_notify_officer: boolean;
}

export const DEFAULT_LICENSE_EXPIRY_CONFIG: LicenseExpiryConfig = {
  cycle_type: 'annual',
  period_days: 365,
  reminder_days: [10, 5, 1],
  renewal_fee_mode: 'free',
  renewal_fee_amount: 0,
  renewal_fee_currency: 'USD',
  grace_period_days: 30,
  auto_notify_officer: true,
};

export function useLicenseExpiryConfig() {
  return useQuery({
    queryKey: ['license_expiry_config'],
    queryFn: async (): Promise<LicenseExpiryConfig> => {
      const { data, error } = await (supabase
        .from('site_settings' as any)
        .select('value')
        .eq('key', 'license_expiry')
        .maybeSingle() as any);
      if (error) {
        console.error('[useLicenseExpiryConfig]', error);
        return DEFAULT_LICENSE_EXPIRY_CONFIG;
      }
      if (!data?.value) return DEFAULT_LICENSE_EXPIRY_CONFIG;
      return { ...DEFAULT_LICENSE_EXPIRY_CONFIG, ...(data.value as any) };
    },
    staleTime: 5 * 60 * 1000,
  });
}
