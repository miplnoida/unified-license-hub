/**
 * F6-X — governed currency presentation.
 *
 * The browser never invents a currency list or a default currency. Selectable
 * currencies and the default come from the governed currency master
 * (`public.currencies`) and the server-resolved monetary configuration
 * (`monetary_config_resolve`). The presentation registry used by
 * `formatMoney` is primed from the same source, so symbols and precision are
 * always the regulator's, never the browser's guess.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { primeCurrencyRegistry, type CurrencyMasterRow } from '@/lib/money';

interface ResolvedMonetaryConfig {
  base_currency: string | null;
  reporting_currency: string | null;
  supported_transaction_currencies: string[] | null;
  accepted_payment_currencies: string[] | null;
}

export function useCurrencyMaster() {
  return useQuery({
    queryKey: ['currency_master'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('currencies')
        .select('code, name, display_symbol, decimal_precision, is_active')
        .order('code');
      if (error) throw error;
      return (data ?? []) as CurrencyMasterRow[];
    },
  });
}

export function useMonetaryConfig() {
  return useQuery({
    queryKey: ['monetary_config_resolved'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }).rpc('monetary_config_resolve', { _regulator_id: null });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as ResolvedMonetaryConfig | null;
    },
  });
}

/**
 * Currencies a user may transact in, plus the server-authoritative default.
 * `defaultCurrency` is empty until the configuration is known — callers must
 * not substitute a guess.
 */
export function useGovernedCurrencies() {
  const master = useCurrencyMaster();
  const config = useMonetaryConfig();

  useEffect(() => {
    if (master.data?.length) primeCurrencyRegistry(master.data);
  }, [master.data]);

  const active = useMemo(
    () => (master.data ?? []).filter((c) => c.is_active !== false),
    [master.data],
  );

  const supported = useMemo(() => {
    const allowed = config.data?.supported_transaction_currencies ?? null;
    if (!allowed || allowed.length === 0) return active;
    const set = new Set(allowed.map((c) => c.toUpperCase()));
    const matched = active.filter((c) => set.has(c.code.toUpperCase()));
    return matched.length ? matched : active;
  }, [active, config.data]);

  return {
    isLoading: master.isLoading || config.isLoading,
    currencies: active,
    supportedCurrencies: supported,
    baseCurrency: config.data?.base_currency ?? '',
    reportingCurrency: config.data?.reporting_currency ?? '',
    defaultCurrency: config.data?.base_currency ?? '',
  };
}
