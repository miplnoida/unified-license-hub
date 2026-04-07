import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SectorSelectionSection } from '@/components/registration/SectorSelectionSection';
import { ApplicantInfoSection } from '@/components/registration/ApplicantInfoSection';
import { AddressSection } from '@/components/registration/AddressSection';
import { ContactInfoSection } from '@/components/registration/ContactInfoSection';
import { PasswordSection } from '@/components/registration/PasswordSection';
import { CaptchaSection } from '@/components/registration/CaptchaSection';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import { ArrowRight, FileText } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { toast } from 'sonner';

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
      const firstError = document.querySelector('.border-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);

    try {
      // Use edge function to create user + registration atomically (bypasses RLS issues)
      const { data, error } = await supabase.functions.invoke('register-pre-licensee', {
        body: {
          email: form.email,
          password: form.password,
          first_name: form.firstName,
          last_name: form.lastName,
          applicant_name: form.applicantName,
          applicant_name_alt: form.applicantNameAlt,
          sector_id: form.sectorId,
          sub_sector_id: form.subSectorId,
          category_id: form.categoryId,
          mailing_address: form.mailingAddress,
          physical_address: form.sameAsMailing ? form.mailingAddress : form.physicalAddress,
          same_as_mailing: form.sameAsMailing,
          telephone: form.telephone,
        },
      });

      if (error) {
        toast.error(error.message || 'Registration failed. Please try again.');
        setSubmitting(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setSubmitting(false);
        return;
      }

      if (data?.warning) {
        toast.warning(data.warning);
      }

      // Sign in the newly created user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      if (signInError) {
        toast.error('Account created but sign-in failed. Please log in manually.');
        reset();
        navigate('/');
        return;
      }

      // Clear form and navigate to portal
      reset();
      toast.success('Registration successful! You can now fill your application forms.');
      navigate('/registration/portal');
    } catch (err) {
      console.error('Registration error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
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

        <PasswordSection
          password={form.password}
          confirmPassword={form.confirmPassword}
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
            {submitting ? 'Creating Account...' : 'Register & Continue'}
            {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>

        {/* Login link */}
        <div className="text-center border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Already registered?{' '}
            <button
              onClick={() => navigate('/')}
              className="font-medium text-primary hover:underline"
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
