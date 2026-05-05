import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import { useRegistrationConfig } from '@/hooks/useRegistrationConfig';
import { EntityDetailsStep } from '@/components/registration/EntityDetailsStep';
import { SectorSelectionSection } from '@/components/registration/SectorSelectionSection';
import { PrimaryUserStep } from '@/components/registration/PrimaryUserStep';
import { DocumentsStep } from '@/components/registration/DocumentsStep';
import { DeclarationsStep } from '@/components/registration/DeclarationsStep';
import { DynamicRegistrationStepper } from '@/components/registration/DynamicRegistrationStepper';
import { RegistrationStepRenderer } from '@/components/registration/RegistrationStepRenderer';
import { ArrowRight, ArrowLeft, FileText, Send, Loader2 } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { toast } from 'sonner';
import type { RegStep } from '@/types/registrationForm';
import { resolveRegistrationEmail } from '@/lib/registrationEmail';

/** Converts a declaration label into a stable field key (same logic as DeclarationsStep) */
function declFieldKey(label: string, idx: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return slug || `declaration_${idx}`;
}

export default function PreLicenseeRegistration() {
  const navigate = useNavigate();
  const {
    form, errors, setField, setEntityField, setMailingField, setPhysicalField,
    setSectorId, setSubSectorId, addDocument, removeDocument, validateStep,
    validateDeclarations, reset,
  } = useRegistrationForm();

  const { config, loading: configLoading, error: configError, reload: reloadConfig } = useRegistrationConfig(
    form.sectorId || undefined,
    form.subSectorId || undefined,
    form.categoryId || undefined,
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [dynamicFormData, setDynamicFormData] = useState<Record<string, unknown>>({});
  const [dynamicErrors, setDynamicErrors] = useState<Record<string, string>>({});

  // Resolve the effective verification email across static + dynamic schemas.
  // Single source of truth used by DeclarationsStep / OTP verification UI.
  const effectiveEmail = useMemo(
    () => resolveRegistrationEmail(form.email, dynamicFormData, config?.formSchema),
    [form.email, dynamicFormData, config?.formSchema],
  );

  // Build steps list dynamically based on config
  const steps = useMemo(() => {
    const result: { id: string; label: string; type: 'static' | 'dynamic' | 'documents' | 'declarations'; stepData?: RegStep }[] = [];

    if (config?.formSchema && config.formSchema.length > 0) {
      config.formSchema.forEach((regStep) => {
        result.push({ id: regStep.id, label: regStep.title, type: 'dynamic', stepData: regStep });
      });
    } else {
      result.push({ id: 'entity', label: 'Entity Details', type: 'static' });
      result.push({ id: 'user', label: 'Primary User', type: 'static' });
    }

    if (!config || config.requireDocuments) {
      result.push({ id: 'documents', label: 'Supporting Documents', type: 'documents' });
    }

    result.push({ id: 'declarations', label: 'Declarations', type: 'declarations' });

    return result;
  }, [config]);

  const STEP_COUNT = steps.length;
  const isLastStep = currentStep === STEP_COUNT - 1;

  // Validate a dynamic step's required fields
  const validateDynamicStep = useCallback((stepData: RegStep): boolean => {
    const errs: Record<string, string> = {};
    for (const row of stepData.rows) {
      for (const col of row.columns) {
        const field = col.field;
        if (!field) continue;
        const val = dynamicFormData[field.fieldName];

        if (field.required && (val === undefined || val === null || val === '')) {
          errs[field.fieldName] = `${field.label} is required`;
          continue;
        }
        if (val && field.validation) {
          const v = field.validation;
          const strVal = String(val);
          if (v.minLength && strVal.length < v.minLength) errs[field.fieldName] = `Minimum ${v.minLength} characters`;
          if (v.maxLength && strVal.length > v.maxLength) errs[field.fieldName] = `Maximum ${v.maxLength} characters`;
          if (v.min !== undefined && Number(val) < v.min) errs[field.fieldName] = `Minimum value is ${v.min}`;
          if (v.max !== undefined && Number(val) > v.max) errs[field.fieldName] = `Maximum value is ${v.max}`;
          if (v.pattern) {
            try {
              if (!new RegExp(v.pattern).test(strVal)) {
                errs[field.fieldName] = v.patternMessage || 'Invalid format';
              }
            } catch {}
          }
        }
        if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
          errs[field.fieldName] = 'Invalid email address';
        }
        if (field.type === 'phone' && val && !/^[+]?[\d\s\-()]{7,20}$/.test(String(val))) {
          errs[field.fieldName] = 'Invalid phone number';
        }
        // File field: must be an uploaded object, not just a filename string
        if (field.type === 'file' && field.required) {
          if (!val || typeof val !== 'object' || !('path' in (val as Record<string, unknown>))) {
            errs[field.fieldName] = `${field.label} is required`;
          }
        }
      }
    }
    setDynamicErrors(errs);
    return Object.keys(errs).length === 0;
  }, [dynamicFormData]);

  // Build declaration keys for validation
  const effectiveDeclarations = useMemo(() => {
    if (config?.declarations && config.declarations.length > 0) {
      return config.declarations.map((d, idx) => ({
        fieldKey: declFieldKey(d.label, idx),
        label: d.label,
        required: d.required,
      }));
    }
    // Hardcoded fallback
    return [
      { fieldKey: 'termsAccepted', label: 'Terms & Conditions', required: true },
      { fieldKey: 'privacyAccepted', label: 'Privacy Policy', required: true },
      { fieldKey: 'dataProtectionAccepted', label: 'Data Protection Notice', required: true },
    ];
  }, [config]);

  const validateCurrentStep = useCallback((): boolean => {
    const step = steps[currentStep];
    if (!step) return true;

    switch (step.type) {
      case 'static':
        return validateStep(step.id === 'entity' ? 0 : 1);
      case 'dynamic':
        return step.stepData ? validateDynamicStep(step.stepData) : true;
      case 'declarations': {
        const useDynamic = config?.declarations && config.declarations.length > 0;
        if (useDynamic) {
          return validateDeclarations(
            effectiveDeclarations,
            config?.requireOtp ?? true,
            config?.requireCaptcha ?? true,
          );
        }
        return validateStep(3);
      }
      case 'documents':
        // Validate required document types
        if (config?.documentTypes) {
          const requiredTypes = config.documentTypes.filter(dt => dt.required);
          const missingDocs = requiredTypes.filter(
            rt => !form.documents.some(d => d.label === rt.label)
          );
          if (missingDocs.length > 0) {
            toast.error(`Required documents missing: ${missingDocs.map(d => d.label).join(', ')}`);
            return false;
          }
        }
        return true;
      default:
        return true;
    }
  }, [currentStep, steps, validateStep, validateDynamicStep, validateDeclarations, effectiveDeclarations, config, form.documents]);

  const handleNext = () => {
    if (!validateCurrentStep()) {
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

  const handleDynamicFieldChange = useCallback((fieldName: string, value: unknown) => {
    setDynamicFormData(prev => ({ ...prev, [fieldName]: value }));
    setDynamicErrors(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (!validateCurrentStep()) {
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const emailVal = (effectiveEmail || form.email || String(dynamicFormData.email || '')).trim().toLowerCase();
      const passwordVal = form.password || String(dynamicFormData.password || '');

      if (!emailVal || !passwordVal) {
        toast.error('Email and password are required to complete registration.');
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('register-pre-licensee', {
        body: {
          email: emailVal,
          password: passwordVal,
          first_name: form.firstName || String(dynamicFormData.first_name || ''),
          last_name: form.lastName || String(dynamicFormData.last_name || ''),
          applicant_name: form.applicantName || String(dynamicFormData.applicant_name || ''),
          applicant_name_alt: form.applicantNameAlt || String(dynamicFormData.applicant_name_alt || ''),
          sector_id: form.sectorId || String(dynamicFormData.sector || ''),
          sub_sector_id: form.subSectorId || String(dynamicFormData.sub_sector || ''),
          category_id: form.categoryId || String(dynamicFormData.category || ''),
          mailing_address: form.mailingAddress,
          physical_address: form.sameAsMailing ? form.mailingAddress : form.physicalAddress,
          same_as_mailing: form.sameAsMailing,
          telephone: form.telephone || String(dynamicFormData.telephone || ''),
          username: form.username || String(dynamicFormData.username || '') || null,
          registration_number: form.registrationNumber || String(dynamicFormData.registration_number || '') || null,
          entity_specific_data: { ...form.entitySpecificData, ...dynamicFormData },
          documents_metadata: form.documents,
          terms_accepted: true, // validated before reaching submit
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

      if (emailVal && passwordVal) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailVal,
          password: passwordVal,
        });
        if (signInError) {
          toast.error('Account created but sign-in failed. Please log in manually.');
          reset();
          navigate('/');
          return;
        }
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
        if (step.stepData) {
          return (
            <RegistrationStepRenderer
              step={step.stepData}
              data={dynamicFormData}
              errors={dynamicErrors}
              onChange={handleDynamicFieldChange}
            />
          );
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
            verificationEmail={effectiveEmail}
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

  if (configError) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to load registration form</h2>
          <p className="text-sm text-muted-foreground mb-6">{configError}</p>
          <Button onClick={() => reloadConfig()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Registration is currently unavailable</h2>
          <p className="text-sm text-muted-foreground mb-6">
            No active registration form has been configured. Please check back soon or contact the administrator.
          </p>
          <Button variant="outline" onClick={() => reloadConfig()}>Refresh</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />

      {/* Header Banner */}
      <div className="hero-gradient text-primary-foreground py-6 sm:py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-6 w-6 sm:h-8 sm:w-8" />
            <h1 className="text-xl sm:text-2xl font-bold">Pre-Licensee Registration</h1>
          </div>
          <p className="text-sm sm:text-base text-primary-foreground/80">
            Complete the registration form below. All fields marked with * are required.
          </p>
        </div>
      </div>

      {/* Dynamic Stepper */}
      <div className="max-w-4xl mx-auto px-4 pt-6 sm:pt-8 pb-4">
        <DynamicRegistrationStepper
          steps={steps.map(s => s.label)}
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={(idx) => {
            // Allow jumping back to any previously completed/visited step
            if (idx < currentStep || completedSteps.has(idx)) {
              setCurrentStep(idx);
            }
          }}
        />
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <div className="transition-all duration-300 ease-in-out">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-6 sm:pt-8 border-t border-border mt-6 sm:mt-8">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={currentStep === 0 ? 'invisible' : ''}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {!isLastStep ? (
            <Button onClick={handleNext} className="sm:ml-auto">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} size="lg" className="sm:ml-auto">
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
              ) : (
                <>Submit Registration<Send className="h-4 w-4 ml-2" /></>
              )}
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
