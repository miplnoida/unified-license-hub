import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import { EntityDetailsStep } from '@/components/registration/EntityDetailsStep';
import { PrimaryUserStep } from '@/components/registration/PrimaryUserStep';
import { DocumentsStep } from '@/components/registration/DocumentsStep';
import { DeclarationsStep } from '@/components/registration/DeclarationsStep';
import { RegistrationStepper } from '@/components/registration/RegistrationStepper';
import { ArrowRight, ArrowLeft, FileText, Send } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { toast } from 'sonner';

const STEP_COUNT = 4;

export default function PreLicenseeRegistration() {
  const navigate = useNavigate();
  const {
    form, errors, setField, setEntityField, setMailingField, setPhysicalField,
    setSectorId, setSubSectorId, addDocument, removeDocument, validateStep, reset,
  } = useRegistrationForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    setCurrentStep(prev => Math.min(prev + 1, STEP_COUNT - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) {
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
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
          username: form.username || null,
          registration_number: form.registrationNumber || null,
          entity_specific_data: form.entitySpecificData,
          documents_metadata: form.documents,
          terms_accepted: form.termsAccepted && form.privacyAccepted && form.dataProtectionAccepted,
        },
      });

      if (error) {
        const errMsg = typeof error === 'object' && error.message ? error.message : String(error);
        toast.error(errMsg || 'Registration failed. Please try again.');
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

      const registrationRef = data?.registration_reference || '';
      reset();
      toast.success('Registration submitted successfully!');
      navigate('/registration/success', { state: { registrationReference: registrationRef } });
    } catch (err) {
      console.error('Registration error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <EntityDetailsStep
            form={form}
            errors={errors}
            setField={setField}
            setEntityField={setEntityField}
            setMailingField={setMailingField}
            setPhysicalField={setPhysicalField}
            setSectorId={setSectorId}
            setSubSectorId={setSubSectorId}
          />
        );
      case 1:
        return <PrimaryUserStep form={form} errors={errors} setField={setField} />;
      case 2:
        return (
          <DocumentsStep
            documents={form.documents}
            onAddDocument={addDocument}
            onRemoveDocument={removeDocument}
            errors={errors}
          />
        );
      case 3:
        return <DeclarationsStep form={form} errors={errors} setField={setField} />;
      default:
        return null;
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
            Complete the registration form below. All fields marked with * are required.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <RegistrationStepper currentStep={currentStep} completedSteps={completedSteps} />
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <div className="transition-all duration-300 ease-in-out">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-8 border-t border-border mt-8">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={currentStep === 0 ? 'invisible' : ''}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {currentStep < STEP_COUNT - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              size="lg"
            >
              {submitting ? 'Submitting...' : 'Submit Registration'}
              {!submitting && <Send className="h-4 w-4 ml-2" />}
            </Button>
          )}
        </div>

        {/* Login link */}
        <div className="text-center border-t border-border pt-6 mt-6">
          <p className="text-sm text-muted-foreground">
            Already registered?{' '}
            <button onClick={() => navigate('/')} className="font-medium text-primary hover:underline">
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
