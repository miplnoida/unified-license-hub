import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SectorSelectionSection } from '@/components/registration/SectorSelectionSection';
import { ApplicantInfoSection } from '@/components/registration/ApplicantInfoSection';
import { AddressSection } from '@/components/registration/AddressSection';
import { ContactInfoSection } from '@/components/registration/ContactInfoSection';
import { CaptchaSection } from '@/components/registration/CaptchaSection';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import { ArrowRight, FileText } from 'lucide-react';

export default function PreLicenseeRegistration() {
  const navigate = useNavigate();
  const {
    form,
    errors,
    setField,
    setMailingField,
    setPhysicalField,
    setSectorId,
    setSubSectorId,
    validate,
    reset,
  } = useRegistrationForm();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!validate()) {
      // Scroll to first error
      const firstError = document.querySelector('.border-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);

    // Mock: simulate saving registration with PENDING_VERIFICATION status
    await new Promise(res => setTimeout(res, 1200));

    // Clear persisted form
    reset();

    // Navigate to verification pending page with email context
    navigate('/registration/verification-pending', {
      state: { email: form.email },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Banner */}
      <div className="hero-gradient text-primary-foreground py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Pre-Licensee Registration</h1>
          </div>
          <p className="text-primary-foreground/80">
            Complete the form below to register as a new pre-licensee applicant. All fields marked with * are required.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
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

        <AddressSection
          mailingAddress={form.mailingAddress}
          physicalAddress={form.physicalAddress}
          sameAsMailing={form.sameAsMailing}
          onMailingChange={setMailingField}
          onPhysicalChange={setPhysicalField}
          onSameAsMailingChange={(v) => setField('sameAsMailing', v)}
          errors={errors}
        />

        <ContactInfoSection
          firstName={form.firstName}
          lastName={form.lastName}
          telephone={form.telephone}
          email={form.email}
          onChange={setField}
          errors={errors}
        />

        <CaptchaSection
          checked={form.captchaChecked}
          onCheckedChange={(v) => setField('captchaChecked', v)}
          error={errors.captcha}
        />

        {/* Actions */}
        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Register'}
            {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
