import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import { useRegistrationConfig } from '@/hooks/useRegistrationConfig';
import { EntityDetailsStep } from '@/components/registration/EntityDetailsStep';
import { PrimaryUserStep } from '@/components/registration/PrimaryUserStep';
import { DocumentsStep } from '@/components/registration/DocumentsStep';
import { DeclarationsStep } from '@/components/registration/DeclarationsStep';
import { DynamicRegistrationStepper } from '@/components/registration/DynamicRegistrationStepper';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { ArrowRight, ArrowLeft, FileText, Send, Settings2 } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { toast } from 'sonner';

export default function PreLicenseeRegistration() {
  const navigate = useNavigate();
  const {
    form, errors, setField, setEntityField, setMailingField, setPhysicalField,
    setSectorId, setSubSectorId, addDocument, removeDocument, validateStep, reset,
  } = useRegistrationForm();

  const { config, loading: configLoading } = useRegistrationConfig(
    form.sectorId || undefined,
    form.subSectorId || undefined,
    form.categoryId || undefined,
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [dynamicFormData, setDynamicFormData] = useState<Record<string, any>>({});

  // Build steps list dynamically based on config
  const steps = useMemo(() => {
    const result: { id: string; label: string; type: 'static' | 'dynamic' | 'documents' | 'declarations'; sectionIndex?: number }[] = [];

    if (config?.sections && config.sections.length > 0) {
      // Dynamic sections from form template become steps
      config.sections.forEach((section, idx) => {
        result.push({ id: `dynamic-${idx}`, label: section.title, type: 'dynamic', sectionIndex: idx });
      });
    } else {
      // Fallback to static steps
      result.push({ id: 'entity', label: 'Entity Details', type: 'static' });
      result.push({ id: 'user', label: 'Primary User', type: 'static' });
    }

    // Always add documents step if enabled
    if (!config || config.requireDocuments) {
      result.push({ id: 'documents', label: 'Supporting Documents', type: 'documents' });
    }

    // Always add declarations step
    result.push({ id: 'declarations', label: 'Declarations', type: 'declarations' });

    return result;
  }, [config]);

  const STEP_COUNT = steps.length;

  const handleNext = () => {
    const step = steps[currentStep];

    // Validate static steps
    if (step.type === 'static') {
      const staticStepIdx = step.id === 'entity' ? 0 : 1;
      if (!validateStep(staticStepIdx)) {
        const firstError = document.querySelector('.border-destructive, .text-destructive');
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    if (step.type === 'declarations') {
      if (!validateStep(3)) {
        const firstError = document.querySelector('.border-destructive, .text-destructive');
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
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
    const lastStep = steps[currentStep];
    if (lastStep.type === 'declarations') {
      if (!validateStep(3)) {
        const firstError = document.querySelector('.border-destructive, .text-destructive');
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
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
          entity_specific_data: { ...form.entitySpecificData, ...dynamicFormData },
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

      if (data?.warning) toast.warning(data.warning);

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
    const step = steps[currentStep];
    if (!step) return null;

    switch (step.type) {
      case 'static':
        if (step.id === 'entity') {
          return (
            <EntityDetailsStep
              form={form} errors={errors} setField={setField}
              setEntityField={setEntityField} setMailingField={setMailingField}
              setPhysicalField={setPhysicalField} setSectorId={setSectorId}
              setSubSectorId={setSubSectorId}
            />
          );
        }
        return <PrimaryUserStep form={form} errors={errors} setField={setField} />;

      case 'dynamic':
        if (config?.sections && step.sectionIndex !== undefined) {
          const section = config.sections[step.sectionIndex];
          if (section) {
            return (
              <Card>
                <CardContent className="pt-6">
                  <FormRenderer
                    formName={section.title}
                    sections={[section]}
                    initialData={dynamicFormData}
                    onSaveDraft={(data) => setDynamicFormData(prev => ({ ...prev, ...data }))}
                    onSubmit={(data) => {
                      setDynamicFormData(prev => ({ ...prev, ...data }));
                      handleNext();
                    }}
                    saving={false}
                  />
                </CardContent>
              </Card>
            );
          }
        }
        return <p className="text-muted-foreground">No form section configured for this step.</p>;

      case 'documents':
        return (
          <DocumentsStep
            documents={form.documents}
            onAddDocument={addDocument}
            onRemoveDocument={removeDocument}
            errors={errors}
            documentTypes={config?.documentTypes}
          />
        );

      case 'declarations':
        return (
          <DeclarationsStep
            form={form} errors={errors} setField={setField}
            declarations={config?.declarations}
            termsUrl={config?.termsUrl}
            privacyUrl={config?.privacyUrl}
            dataProtectionUrl={config?.dataProtectionUrl}
            requireOtp={config?.requireOtp ?? true}
            requireCaptcha={config?.requireCaptcha ?? true}
          />
        );

      default:
        return null;
    }
  };

  if (configLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-4xl mx-auto px-4 py-16">
          <Skeleton className="h-8 w-64 mb-6" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full mb-4" />)}
        </div>
      </div>
    );
  }

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

      {/* Dynamic Stepper */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <DynamicRegistrationStepper
          steps={steps.map(s => s.label)}
          currentStep={currentStep}
          completedSteps={completedSteps}
        />
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
            <Button onClick={handleSubmit} disabled={submitting} size="lg">
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
