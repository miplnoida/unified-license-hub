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
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { useReviewValueResolver } from '@/components/registration/useReviewValueResolver';
import { useApplicantNameUniqueness } from '@/components/registration/useApplicantNameUniqueness';

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

  const { data: reviewSettings } = useReviewSettings();
  const reviewEnabled = reviewSettings?.registration_review_enabled ?? true;

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
    const result: { id: string; label: string; type: 'static' | 'dynamic' | 'documents' | 'declarations' | 'review'; stepData?: RegStep }[] = [];

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

    if (reviewEnabled) {
      result.push({ id: 'review', label: 'Review & Submit', type: 'review' as any });
    }

    return result;
  }, [config, reviewEnabled]);

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
        // Confirm password: must match the referenced password field
        if (field.type === 'confirm_password' && val) {
          const matchName = field.matchField
            || stepData.rows.flatMap(r => r.columns.map(c => c.field)).find(f => f?.type === 'password')?.fieldName;
          const target = matchName ? dynamicFormData[matchName] : undefined;
          if (String(val) !== String(target ?? '')) {
            errs[field.fieldName] = 'Passwords do not match';
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

  const validateScope = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!form.sectorId) errs.sectorId = 'Sector is required';
    if (!form.subSectorId) errs.subSectorId = 'Sub-sector is required';
    if (!form.categoryId) errs.categoryId = 'Category is required';
    if (Object.keys(errs).length > 0) {
      setDynamicErrors(prev => ({ ...prev, ...errs }));
      toast.error('Please select sector, sub-sector and category to continue.');
      return false;
    }
    return true;
  }, [form.sectorId, form.subSectorId, form.categoryId]);

  const handleNext = () => {
    if (!validateScope()) return;
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
    if (!validateScope()) return;
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

      case 'review':
        return (
          <ReviewAcknowledgement
            mode={reviewSettings?.review_mode || 'readonly'}
            sections={buildReviewSections()}
            onAcknowledge={handleSubmit}
            onEdit={(idx) => setCurrentStep(Math.min(idx, steps.length - 2))}
            loading={submitting}
            title="Review Your Registration"
            description="Please review all information before final submission."
          />
        );

      default:
        return null;
    }
  };

  const resolveReviewValue = useReviewValueResolver(config?.formSchema);

  function buildReviewSections() {
    const sections: { title: string; fields: { label: string; value: any }[] }[] = [];

    if (config?.formSchema && config.formSchema.length > 0) {
      config.formSchema.forEach((s) => {
        const fields: { label: string; value: any }[] = [];
        s.rows.forEach(r => r.columns.forEach(c => {
          if (!c.field) return;
          const raw = dynamicFormData[c.field.fieldName];
          const resolved = resolveReviewValue(c.field, raw);
          fields.push({ label: c.field.label, value: formatReviewValue(resolved) });
        }));
        sections.push({ title: s.title, fields });
      });
    } else {
      sections.push({
        title: 'Entity Details',
        fields: [
          { label: 'Applicant Name', value: form.applicantName },
          { label: 'Alt Name', value: form.applicantNameAlt },
          { label: 'Registration Number', value: form.registrationNumber },
          { label: 'Mailing Address', value: [form.mailingAddress.street, form.mailingAddress.city, form.mailingAddress.state, form.mailingAddress.country].filter(Boolean).join(', ') },
          { label: 'Physical Address', value: form.sameAsMailing ? 'Same as mailing' : [form.physicalAddress.street, form.physicalAddress.city, form.physicalAddress.state, form.physicalAddress.country].filter(Boolean).join(', ') },
        ],
      });
      sections.push({
        title: 'Primary User',
        fields: [
          { label: 'First Name', value: form.firstName },
          { label: 'Last Name', value: form.lastName },
          { label: 'Email', value: form.email },
          { label: 'Telephone', value: form.telephone },
          { label: 'Username', value: form.username },
        ],
      });
    }

    if (form.documents.length > 0 || (config?.requireDocuments ?? true)) {
      sections.push({
        title: 'Supporting Documents',
        fields: form.documents.length > 0
          ? form.documents.map(d => ({ label: d.label || d.name, value: d }))
          : [{ label: 'Documents', value: 'None uploaded' }],
      });
    }

    return sections;
  }

  function formatReviewValue(v: any): any {
    if (v == null || v === '') return null;
    if (typeof v === 'object') {
      // Preserve file/attachment objects so AttachmentDisplay can render view/download actions
      const f = v as Record<string, any>;
      if (f.path || f.file_path || f.url || f.fileUrl || f.fileName || f.file_name ||
          ((f.name || f.originalName) && (f.size != null || f.type))) {
        return v;
      }
      if ('name' in f) return f.name;
      return JSON.stringify(v);
    }
    return v;
  }

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
        {/* Licensee Type Scope — only on first step, when not already rendered by EntityDetailsStep */}
        {currentStep === 0 && !steps.some(s => s.type === 'static' && s.id === 'entity') && (
          <div className="mb-6">
            <SectorSelectionSection
              sectorId={form.sectorId}
              subSectorId={form.subSectorId}
              categoryId={form.categoryId}
              onSectorChange={setSectorId}
              onSubSectorChange={setSubSectorId}
              onCategoryChange={(v) => setField('categoryId', v)}
              errors={{
                sectorId: dynamicErrors.sectorId || errors.sectorId || '',
                subSectorId: dynamicErrors.subSectorId || errors.subSectorId || '',
                categoryId: dynamicErrors.categoryId || errors.categoryId || '',
              }}
            />
          </div>
        )}

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
          ) : steps[currentStep]?.type === 'review' ? null : (
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
