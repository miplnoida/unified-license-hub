import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CycleType = 'annual' | 'periodic';

export interface LicenseExpiryPolicy {
  cycle_type: CycleType;
  period_days: number;
  reminder_days: number[];
  grace_period_days: number;
  auto_notify_officer: boolean;
}

export interface LicenseExpiryRule extends LicenseExpiryPolicy {
  id: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
}

export interface LicenseExpiryConfig extends LicenseExpiryPolicy {
  // Back-compat flat view = the default policy. Existing callers that read
  // top-level reminder_days/grace_period_days/cycle_type continue to work.
  default: LicenseExpiryPolicy;
  rules: LicenseExpiryRule[];
  resolveFor: (ctx: {
    sector_id?: string | null;
    sub_sector_id?: string | null;
    category_id?: string | null;
  }) => LicenseExpiryPolicy;
}

export const DEFAULT_LICENSE_EXPIRY_POLICY: LicenseExpiryPolicy = {
  cycle_type: 'annual',
  period_days: 365,
  reminder_days: [10, 5, 1],
  grace_period_days: 30,
  auto_notify_officer: true,
};

export const DEFAULT_LICENSE_EXPIRY_CONFIG: LicenseExpiryConfig = {
  ...DEFAULT_LICENSE_EXPIRY_POLICY,
  default: DEFAULT_LICENSE_EXPIRY_POLICY,
  rules: [],
  resolveFor: () => DEFAULT_LICENSE_EXPIRY_POLICY,
};

function normalizePolicy(raw: any, fallback: LicenseExpiryPolicy): LicenseExpiryPolicy {
  if (!raw || typeof raw !== 'object') return fallback;
  const reminder = Array.isArray(raw.reminder_days)
    ? raw.reminder_days.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n >= 0)
    : fallback.reminder_days;
  return {
    cycle_type: raw.cycle_type === 'periodic' ? 'periodic' : 'annual',
    period_days: Number(raw.period_days) > 0 ? Number(raw.period_days) : fallback.period_days,
    reminder_days: reminder.length ? reminder : fallback.reminder_days,
    grace_period_days: Number.isFinite(Number(raw.grace_period_days))
      ? Math.max(0, Number(raw.grace_period_days))
      : fallback.grace_period_days,
    auto_notify_officer:
      typeof raw.auto_notify_officer === 'boolean' ? raw.auto_notify_officer : fallback.auto_notify_officer,
  };
}

function buildConfig(raw: any): LicenseExpiryConfig {
  // Back-compat: old shape was the policy fields directly on `value`.
  const hasNewShape = raw && typeof raw === 'object' && (raw.default || raw.rules);
  const def = hasNewShape
    ? normalizePolicy(raw?.default, DEFAULT_LICENSE_EXPIRY_POLICY)
    : normalizePolicy(raw, DEFAULT_LICENSE_EXPIRY_POLICY);

  const rules: LicenseExpiryRule[] = Array.isArray(raw?.rules)
    ? raw.rules.map((r: any, idx: number) => ({
        id: typeof r?.id === 'string' && r.id ? r.id : `rule_${idx}`,
        sector_id: r?.sector_id || null,
        sub_sector_id: r?.sub_sector_id || null,
        category_id: r?.category_id || null,
        ...normalizePolicy(r, def),
      }))
    : [];

  const resolveFor: LicenseExpiryConfig['resolveFor'] = (ctx) => {
    const matches = rules
      .filter((r) => !r.sector_id || r.sector_id === ctx.sector_id)
      .filter((r) => !r.sub_sector_id || r.sub_sector_id === ctx.sub_sector_id)
      .filter((r) => !r.category_id || r.category_id === ctx.category_id)
      .map((r) => ({
        r,
        score:
          (r.category_id ? 4 : 0) +
          (r.sub_sector_id ? 2 : 0) +
          (r.sector_id ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    return matches.length ? matches[0].r : def;
  };

  return { ...def, default: def, rules, resolveFor };
}

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
      return buildConfig((data as any)?.value);
    },
    staleTime: 5 * 60 * 1000,
  });
}
