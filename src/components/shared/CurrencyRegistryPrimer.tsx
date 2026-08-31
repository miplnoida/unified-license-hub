/**
 * Primes the canonical money presentation registry (symbols + precision) from
 * the governed currency master once per session. Renders nothing.
 */
import { useGovernedCurrencies } from '@/hooks/useGovernedCurrencies';

export function CurrencyRegistryPrimer() {
  useGovernedCurrencies();
  return null;
}
