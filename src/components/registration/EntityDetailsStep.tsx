import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectorSelectionSection } from './SectorSelectionSection';
import { ApplicantInfoSection } from './ApplicantInfoSection';
import { AddressSection, type AddressData } from './AddressSection';
import { useCategories } from '@/hooks/useMasterConfig';
import type { RegistrationFormData } from '@/hooks/useRegistrationForm';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Props {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
  setEntityField: (field: string, value: string) => void;
  setMailingField: (field: keyof AddressData, value: string) => void;
  setPhysicalField: (field: keyof AddressData, value: string) => void;
  setSectorId: (value: string) => void;
  setSubSectorId: (value: string) => void;
}

// Conditional fields based on category type
function getConditionalFields(categoryId: string, categoryName: string): { key: string; label: string; required: boolean }[] {
  const lower = categoryName.toLowerCase();
  if (lower.includes('insurer') || lower.includes('reinsurer')) {
    return [
      { key: 'capital_requirements', label: 'Minimum Capital Requirements', required: false },
      { key: 'regulatory_license_number', label: 'Existing Regulatory License Number', required: false },
      { key: 'incorporation_date', label: 'Date of Incorporation', required: true },
      { key: 'country_of_incorporation', label: 'Country of Incorporation', required: true },
    ];
  }
  if (lower.includes('broker') || lower.includes('adjuster') || lower.includes('agent')) {
    return [
      { key: 'business_registration_number', label: 'Business Registration Number', required: false },
      { key: 'professional_indemnity', label: 'Professional Indemnity Insurance Details', required: false },
      { key: 'years_in_operation', label: 'Years in Operation', required: false },
    ];
  }
  if (lower.includes('bank')) {
    return [
      { key: 'charter_number', label: 'Charter/License Number', required: false },
      { key: 'incorporation_date', label: 'Date of Incorporation', required: true },
      { key: 'paid_up_capital', label: 'Paid-Up Capital', required: false },
    ];
  }
  return [];
}

export function EntityDetailsStep({
  form, errors, setField, setEntityField, setMailingField, setPhysicalField, setSectorId, setSubSectorId,
}: Props) {
  const { data: allCategories = [] } = useCategories();
  const selectedCategory = allCategories.find(c => c.id === form.categoryId);
  const conditionalFields = selectedCategory ? getConditionalFields(form.categoryId, selectedCategory.name) : [];

  const [regNumStatus, setRegNumStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [applicantNameStatus, setApplicantNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Check applicant name uniqueness
  useEffect(() => {
    if (!form.applicantName.trim()) {
      setApplicantNameStatus('idle');
      return;
    }
    const timer = setTimeout(async () => {
      setApplicantNameStatus('checking');
      try {
        const { data, error } = await supabase.rpc('check_applicant_name_exists' as any, {
          p_name: form.applicantName.trim(),
        });
        if (error) { setApplicantNameStatus('idle'); return; }
        setApplicantNameStatus(data === true ? 'taken' : 'available');
      } catch {
        setApplicantNameStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.applicantName]);

  // Check registration number uniqueness
  useEffect(() => {
    if (!form.registrationNumber.trim()) {
      setRegNumStatus('idle');
      return;
    }
    const timer = setTimeout(async () => {
      setRegNumStatus('checking');
      try {
        const { data } = await supabase
          .from('registrations' as any)
          .select('id')
          .eq('registration_number', form.registrationNumber.trim())
          .limit(1);
        setRegNumStatus(data && data.length > 0 ? 'taken' : 'available');
      } catch {
        setRegNumStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.registrationNumber]);

  return (
    <div className="space-y-6">
      <SectorSelectionSection
        sectorId={form.sectorId}
        subSectorId={form.subSectorId}
        categoryId={form.categoryId}
        onSectorChange={setSectorId}
        onSubSectorChange={setSubSectorId}
        onCategoryChange={(v) => setField('categoryId', v)}
        errors={errors}
      />

      <ApplicantInfoSection
        applicantName={form.applicantName}
        applicantNameAlt={form.applicantNameAlt}
        onChange={setField}
        errors={errors}
        applicantNameStatus={applicantNameStatus}
      />

      {/* Registration Number with uniqueness check */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Business Registration</h3>
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="registrationNumber">Business Registration Number</Label>
            <div className="relative">
              <Input
                id="registrationNumber"
                value={form.registrationNumber}
                onChange={e => setField('registrationNumber', e.target.value)}
                placeholder="Enter registration number"
                className={errors.registrationNumber ? 'border-destructive pr-10' : 'pr-10'}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {regNumStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {regNumStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {regNumStatus === 'taken' && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
            </div>
            {regNumStatus === 'taken' && (
              <p className="text-sm text-destructive">This registration number is already registered</p>
            )}
          </div>
        </div>
      </div>

      {/* Conditional fields based on category */}
      {conditionalFields.length > 0 && (
        <div className="form-section">
          <h3 className="text-lg font-semibold text-foreground">
            Additional Details — {selectedCategory?.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            Fields specific to your selected license category.
          </p>
          <div className="grid md:grid-cols-2 gap-6 pt-2">
            {conditionalFields.map(cf => (
              <div key={cf.key} className="space-y-2">
                <Label htmlFor={cf.key}>
                  {cf.label} {cf.required && '*'}
                </Label>
                <Input
                  id={cf.key}
                  type={cf.key.includes('date') ? 'date' : 'text'}
                  value={form.entitySpecificData[cf.key] || ''}
                  onChange={e => setEntityField(cf.key, e.target.value)}
                  placeholder={`Enter ${cf.label.toLowerCase()}`}
                  className={errors[`entity.${cf.key}`] ? 'border-destructive' : ''}
                />
                {errors[`entity.${cf.key}`] && (
                  <p className="text-sm text-destructive">{errors[`entity.${cf.key}`]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AddressSection
        mailingAddress={form.mailingAddress}
        physicalAddress={form.physicalAddress}
        sameAsMailing={form.sameAsMailing}
        onMailingChange={setMailingField}
        onPhysicalChange={setPhysicalField}
        onSameAsMailingChange={(v) => setField('sameAsMailing', v)}
        errors={errors}
      />
    </div>
  );
}
