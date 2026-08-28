import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectorSelectionSection } from './SectorSelectionSection';
import { ApplicantInfoSection } from './ApplicantInfoSection';
import { AddressSection, type AddressData } from './AddressSection';
import { useCategories } from '@/hooks/useMasterConfig';
import type { RegistrationFormData } from '@/hooks/useRegistrationForm';

interface Props {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
  setEntityField: (field: string, value: string) => void;
  setMailingField: (field: keyof AddressData, value: string) => void;
  setPhysicalField: (field: keyof AddressData, value: string) => void;
  setSectorId: (value: string) => void;
  setSubSectorId: (value: string) => void;
  updateMode?: boolean;
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
  updateMode = false,
}: Props) {
  const { data: allCategories = [] } = useCategories();
  const selectedCategory = allCategories.find(c => c.id === form.categoryId);
  const conditionalFields = selectedCategory ? getConditionalFields(form.categoryId, selectedCategory.name) : [];

  // F3-B2: the pre-authentication applicant-name and registration-number
  // existence probes were retired. They ran on an unauthenticated page and are
  // name/reference enumeration oracles (GAP-F3-14); the applicant-name RPC is
  // no longer anon-executable, so the call could only ever fail. Duplicate and
  // entity-resolution authority is server-side (governed intake + `registrations`
  // uniqueness), surfaced as a neutral submission-time message.


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
      />


      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Business Registration</h3>
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="registrationNumber">Business Registration Number</Label>
            <Input
              id="registrationNumber"
              value={form.registrationNumber}
              onChange={e => setField('registrationNumber', e.target.value)}
              placeholder="Enter registration number"
              className={errors.registrationNumber ? 'border-destructive' : ''}
            />
            {errors.registrationNumber && (
              <p className="text-sm text-destructive">{errors.registrationNumber}</p>
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
