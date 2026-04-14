import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AddressData {
  street: string;
  city: string;
  state: string;
  country: string;
}

interface Props {
  mailingAddress: AddressData;
  physicalAddress: AddressData;
  sameAsMailing: boolean;
  onMailingChange: (field: keyof AddressData, value: string) => void;
  onPhysicalChange: (field: keyof AddressData, value: string) => void;
  onSameAsMailingChange: (checked: boolean) => void;
  errors: Record<string, string>;
}

function useCountriesList() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('countries' as any)
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; iso_code: string }[];
    },
  });
}

function useStatesList(countryId: string | undefined) {
  return useQuery({
    queryKey: ['states', countryId],
    queryFn: async () => {
      if (!countryId) return [];
      const { data, error } = await supabase
        .from('states' as any)
        .select('*')
        .eq('country_id', countryId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; country_id: string }[];
    },
    enabled: !!countryId,
  });
}

function AddressFields({
  prefix,
  address,
  onChange,
  errors,
  disabled,
}: {
  prefix: string;
  address: AddressData;
  onChange: (field: keyof AddressData, value: string) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const { data: countries = [] } = useCountriesList();
  // country field stores the country id for dependency; find it
  const { data: states = [] } = useStatesList(address.country || undefined);

  const handleCountryChange = (countryId: string) => {
    onChange('country', countryId);
    // Clear state when country changes
    onChange('state', '');
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-2 md:col-span-2">
        <Label>Number / Street / Suite *</Label>
        <Input
          value={address.street}
          onChange={e => onChange('street', e.target.value)}
          placeholder="Enter street address"
          disabled={disabled}
          className={errors[`${prefix}.street`] ? 'border-destructive' : ''}
        />
        {errors[`${prefix}.street`] && <p className="text-sm text-destructive">{errors[`${prefix}.street`]}</p>}
      </div>
      <div className="space-y-2">
        <Label>City / Town *</Label>
        <Input
          value={address.city}
          onChange={e => onChange('city', e.target.value)}
          placeholder="Enter city"
          disabled={disabled}
          className={errors[`${prefix}.city`] ? 'border-destructive' : ''}
        />
        {errors[`${prefix}.city`] && <p className="text-sm text-destructive">{errors[`${prefix}.city`]}</p>}
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Country *</Label>
        <Select value={address.country} onValueChange={handleCountryChange} disabled={disabled}>
          <SelectTrigger className={errors[`${prefix}.country`] ? 'border-destructive' : ''}>
            <SelectValue placeholder="Select country..." />
          </SelectTrigger>
          <SelectContent>
            {countries.length === 0 && (
              <SelectItem value="__empty" disabled>No countries available</SelectItem>
            )}
            {countries.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors[`${prefix}.country`] && <p className="text-sm text-destructive">{errors[`${prefix}.country`]}</p>}
      </div>
      <div className="space-y-2">
        <Label>State / Province / Region *</Label>
        {states.length > 0 ? (
          <Select value={address.state} onValueChange={v => onChange('state', v)} disabled={disabled || !address.country}>
            <SelectTrigger className={errors[`${prefix}.state`] ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select state..." />
            </SelectTrigger>
            <SelectContent>
              {states.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={address.state}
            onChange={e => onChange('state', e.target.value)}
            placeholder={address.country ? "Enter state or province" : "Select country first"}
            disabled={disabled || !address.country}
            className={errors[`${prefix}.state`] ? 'border-destructive' : ''}
          />
        )}
        {errors[`${prefix}.state`] && <p className="text-sm text-destructive">{errors[`${prefix}.state`]}</p>}
      </div>
    </div>
  );
}

export function AddressSection({
  mailingAddress,
  physicalAddress,
  sameAsMailing,
  onMailingChange,
  onPhysicalChange,
  onSameAsMailingChange,
  errors,
}: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Address Information</h3>
      <p className="text-sm text-muted-foreground">Principal point of contact address details.</p>

      <div className="space-y-6 pt-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Mailing Address</h4>
          <AddressFields prefix="mailing" address={mailingAddress} onChange={onMailingChange} errors={errors} />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Physical Address</h4>
          <div className="flex items-center space-x-2 mb-4">
            <Checkbox
              id="sameAsMailing"
              checked={sameAsMailing}
              onCheckedChange={(checked) => onSameAsMailingChange(checked === true)}
            />
            <Label htmlFor="sameAsMailing" className="text-sm font-normal cursor-pointer">
              Same as Mailing Address
            </Label>
          </div>
          <AddressFields
            prefix="physical"
            address={sameAsMailing ? mailingAddress : physicalAddress}
            onChange={onPhysicalChange}
            errors={errors}
            disabled={sameAsMailing}
          />
        </div>
      </div>
    </div>
  );
}
