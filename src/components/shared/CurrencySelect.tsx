/**
 * Governed currency picker.
 *
 * Options come from the currency master, restricted to the currencies the
 * resolved monetary configuration supports. There is no hardcoded list and no
 * locale-derived default; when nothing is selected the configured base currency
 * is applied.
 */
import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGovernedCurrencies } from '@/hooks/useGovernedCurrencies';

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
  /** Default the field to the configured base currency when empty. */
  autoDefault?: boolean;
  disabled?: boolean;
  withinDialog?: boolean;
}

export function CurrencySelect({ value, onChange, autoDefault = true, disabled }: CurrencySelectProps) {
  const { supportedCurrencies, baseCurrency, isLoading } = useGovernedCurrencies();

  useEffect(() => {
    if (autoDefault && !value && baseCurrency) onChange(baseCurrency);
  }, [autoDefault, value, baseCurrency, onChange]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading currencies…' : 'Select currency'} />
      </SelectTrigger>
      <SelectContent>
        {supportedCurrencies.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code}
            {c.name ? ` — ${c.name}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
