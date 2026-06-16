import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import type { RegStep, RegField } from '@/types/registrationForm';
import { resolveRegistrationEmail } from '@/lib/registrationEmail';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import { isAttachmentValue } from '@/components/registration/AttachmentDisplay';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { useReviewValueResolver } from '@/components/registration/useReviewValueResolver';
import { useApplicantNameUniqueness } from '@/components/registration/useApplicantNameUniqueness';
import { usePrimaryUserEmailUniqueness } from '@/components/registration/usePrimaryUserEmailUniqueness';
import { isDisplayOnlyField, resolveDisplayKind, resolveDisplayOnlyFieldText } from '@/lib/registrationDisplayTypes';
import { isPrimaryEmailField, isValidEmail, normalizeEmailValue } from '@/lib/primaryEmailValidation';
import { AlertCircle } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildUpdateRegistrationUrl,
  deepMergeRegistrationData,
  guardAgainstBlankOverwrite,
  isEffectivelyEmpty,
  registrationToFormData,
  resolveCurrentRegistrationForUser,
  resolveRegistrationSubmission,
  type ResolvedRegistrationUpdate,
} from '@/lib/registrationUpdateFlow';

const STEP_KEY = 'preLicenseRegistrationCurrentStep';
const DYNAMIC_DATA_KEY = 'preLicenseRegistrationDynamicData';
const DUPLICATE_PRIMARY_EMAIL_ERROR = 'This email is already registered';
const DUPLICATE_PRIMARY_EMAIL_SUBMIT_ERROR = 'This email is already registered. Please use a different email.';

function loadDynamicData(): Record<string, unknown> {
  try {
    const saved = sessionStorage.getItem(DYNAMIC_DATA_KEY);
    if (saved) return JSON.parse(saved) as Record<string, unknown>;
  } catch {}
  return {};
}

/** Converts a declaration label into a stable field key (same logic as DeclarationsStep) */
function declFieldKey(label: string, idx: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return slug || `declaration_${idx}`;
}

interface PreLicenseeRegistrationProps {
  mode?: 'new' | 'update';
}

export default function PreLicenseeRegistration({ mode = 'new' }: PreLicenseeRegistrationProps) {
  const navigate = useNavigate();
  const { registrationId: routeRegistrationId } = useParams<{ registrationId?: string }>();
  const [searchParams] = useSearchParams();
  const isUpdateMode = mode === 'update';
  const updateRegistrationParam = routeRegistrationId || searchParams.get('registration');
  const updateSubmissionParam = searchParams.get('submission');
  const {
    form, errors, setField, setEntityField, setMailingField, setPhysicalField,
    setSectorId, setSubSectorId, addDocument, removeDocument, validateStep,
    validateDeclarations, hydrate, reset,
  } = useRegistrationForm({ updateMode: isUpdateMode });
  const { session, loading: authLoading } = useAuth();

  const { data: reviewSettings } = useReviewSettings();
  const reviewEnabled = reviewSettings?.registration_review_enabled ?? true;

  const { config, loading: configLoading, error: configError, reload: reloadConfig } = useRegistrationConfig(
    form.sectorId || undefined,
    form.subSectorId || undefined,
    form.categoryId || undefined,
    !isUpdateMode || !!form.sectorId,
  );

  const [currentStep, setCurrentStep] = useState<number>(() => {
    const saved = sessionStorage.getItem(STEP_KEY);
    const parsed = saved ? Number(saved) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [dynamicFormData, setDynamicFormData] = useState<Record<string, unknown>>(loadDynamicData);
  const [dynamicErrors, setDynamicErrors] = useState<Record<string, string>>({});
  const [updateContext, setUpdateContext] = useState<ResolvedRegistrationUpdate | null>(null);
  const [updateLoading, setUpdateLoading] = useState(isUpdateMode);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [documentsTouched, setDocumentsTouched] = useState(false);
  const [pendingPrimaryEmailChecks, setPendingPrimaryEmailChecks] = useState<Record<string, boolean>>({});
  const latestPrimaryEmailCheckRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isUpdateMode) return;
    if (authLoading) return;
    if (!session) {
      const intended = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      navigate(`/login?redirect=${encodeURIComponent(intended)}`, { replace: true });
      return;
    }

    let cancelled = false;
    async function loadUpdateContext() {
      setUpdateLoading(true);
      setUpdateError(null);
      try {
        const resolved = await resolveCurrentRegistrationForUser(session!.user.id, {
          registrationId: updateRegistrationParam,
          submissionId: updateSubmissionParam,
        });
        if (cancelled) return;
        if (!resolved) {
          setUpdateError('We could not find a registration owned by this account.');
          return;
        }
        const staticData = registrationToFormData(resolved.registration);
        hydrate(staticData);
        setDynamicFormData(deepMergeRegistrationData(
          (resolved.registration.entity_specific_data as Record<string, unknown>) || {},
          (resolved.submission?.form_data as Record<string, unknown>) || {},
        ));
        setUpdateContext(resolved);
      } catch (err) {
        console.error('[registration] Failed to load update context', err);
        setUpdateError('Unable to load your existing registration data. Please refresh and try again.');
      } finally {
        if (!cancelled) setUpdateLoading(false);
      }
    }
    void loadUpdateContext();
    return () => { cancelled = true; };
  }, [isUpdateMode, authLoading, session, updateRegistrationParam, updateSubmissionParam, hydrate, navigate]);

  const clearPersistedStep = useCallback(() => {
    try {
      sessionStorage.removeItem(STEP_KEY);
      sessionStorage.removeItem(DYNAMIC_DATA_KEY);
    } catch {}
  }, []);

  const resetRegistrationFlow = useCallback(() => {
    clearPersistedStep();
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setDynamicFormData({});
    setDynamicErrors({});
    reset();
  }, [clearPersistedStep, reset]);

  // Persist current step across page refreshes (cleared on submit/reset)
  useEffect(() => {
    if (isUpdateMode) return;
    sessionStorage.setItem(STEP_KEY, String(currentStep));
  }, [currentStep, isUpdateMode]);

  // Persist dynamic step data so going back to previous steps preserves entries
  useEffect(() => {
    if (isUpdateMode) return;
    try {
      sessionStorage.setItem(DYNAMIC_DATA_KEY, JSON.stringify(dynamicFormData));
    } catch {}
  }, [dynamicFormData, isUpdateMode]);

  // Resolve the effective verification email across static + dynamic schemas.
  // Single source of truth used by DeclarationsStep / OTP verification UI.
  const effectiveEmail = useMemo(
    () => resolveRegistrationEmail(form.email, dynamicFormData, config?.formSchema),
    [form.email, dynamicFormData, config?.formSchema],
  );

  // Dynamic Applicant Name uniqueness (resolved from form schema metadata)
  const applicantNameCheck = useApplicantNameUniqueness(config?.formSchema, dynamicFormData);

  // Surface uniqueness errors inline on the resolved fields (applicant name + primary email)
  const emailUniquenessPreview = usePrimaryUserEmailUniqueness(effectiveEmail, config?.formSchema);
  const primaryEmailFieldName = emailUniquenessPreview.fieldName;
  const dynamicErrorsWithUniqueness = useMemo(() => {
    const next = { ...dynamicErrors };
    if (!isUpdateMode && applicantNameCheck.status === 'taken' && applicantNameCheck.fieldName) {
      next[applicantNameCheck.fieldName] = 'This applicant name is already registered';
    }
    if (!isUpdateMode && emailUniquenessPreview.status === 'taken' && emailUniquenessPreview.fieldName) {
      next[emailUniquenessPreview.fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
    }
    return next;
  }, [dynamicErrors, applicantNameCheck.status, applicantNameCheck.fieldName, emailUniquenessPreview.status, emailUniquenessPreview.fieldName, isUpdateMode]);

  const getPrimaryEmailFieldsForStep = useCallback((stepData: RegStep) => {
    return stepData.rows.flatMap(row =>
      row.columns
        .map(col => col.field)
        .filter((field): field is RegField => !!field && isPrimaryEmailField(field))
    );
  }, []);

  const getPrimaryEmailBlockers = useCallback((stepData?: RegStep) => {
    if (!stepData) return { hasPending: false, hasDuplicate: false, hasTakenStatus: false };
    const fields = getPrimaryEmailFieldsForStep(stepData);
    const fieldNames = fields.map(field => field.fieldName);
    const hasPending = fieldNames.some(fieldName => pendingPrimaryEmailChecks[fieldName]);
    const hasDuplicate = fieldNames.some(fieldName => dynamicErrors[fieldName] === DUPLICATE_PRIMARY_EMAIL_ERROR);
    const hasTakenStatus = fieldNames.some(fieldName => fieldName === primaryEmailFieldName) && emailUniquenessPreview.status === 'taken';
    return { hasPending, hasDuplicate, hasTakenStatus };
  }, [dynamicErrors, emailUniquenessPreview.status, getPrimaryEmailFieldsForStep, pendingPrimaryEmailChecks, primaryEmailFieldName]);

  const handleDynamicFieldBlur = useCallback(async (fieldName: string, value: unknown, field: RegField) => {
    if (!isPrimaryEmailField(field)) return;

    const normalizedEmail = normalizeEmailValue(value);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) return;

    setDynamicErrors(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });

    const requestId = (latestPrimaryEmailCheckRef.current[fieldName] || 0) + 1;
    latestPrimaryEmailCheckRef.current[fieldName] = requestId;
    setPendingPrimaryEmailChecks(prev => ({ ...prev, [fieldName]: true }));

    try {
      const { data, error } = await supabase.rpc('check_primary_user_email_exists' as any, {
        p_email: normalizedEmail,
      });

      if (latestPrimaryEmailCheckRef.current[fieldName] !== requestId) return;
      if (error) {
        setDynamicErrors(prev => ({
          ...prev,
          [fieldName]: 'Unable to validate email right now. Please try again.',
        }));
        return;
      }

      setDynamicErrors(prev => {
        const next = { ...prev };
        if (data === true) next[fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
        else delete next[fieldName];
        return next;
      });
    } finally {
      if (latestPrimaryEmailCheckRef.current[fieldName] === requestId) {
        setPendingPrimaryEmailChecks(prev => ({ ...prev, [fieldName]: false }));
      }
    }
  }, []);

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

  // Clamp currentStep when steps array shrinks (e.g. saved index from older config)
  useEffect(() => {
    if (STEP_COUNT > 0 && currentStep > STEP_COUNT - 1) {
      setCurrentStep(STEP_COUNT - 1);
    }
  }, [STEP_COUNT, currentStep]);

  // Validate a dynamic step's required fields
  const validateDynamicStep = useCallback((stepData: RegStep): boolean => {
    const errs: Record<string, string> = {};
    for (const row of stepData.rows) {
      for (const col of row.columns) {
        const field = col.field;
        if (!field) continue;
        // Display-only field types have no input/value — skip validation entirely
        if (isDisplayOnlyField(field)) continue;
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
    // Applicant Name uniqueness — block step until check resolves to 'available'
    if (!isUpdateMode && applicantNameCheck.fieldName) {
      const stepHasField = stepData.rows.some(r =>
        r.columns.some(c => c.field?.fieldName === applicantNameCheck.fieldName)
      );
      if (stepHasField) {
        if (applicantNameCheck.status === 'taken') {
          errs[applicantNameCheck.fieldName] = 'This applicant name is already registered';
        } else if (applicantNameCheck.status === 'checking') {
          errs[applicantNameCheck.fieldName] = 'Checking applicant name availability…';
        }
      }
    }
    // Primary email uniqueness — block step until check resolves to 'available'
    if (!isUpdateMode && emailUniquenessPreview.fieldName) {
      const stepHasField = stepData.rows.some(r =>
        r.columns.some(c => c.field?.fieldName === emailUniquenessPreview.fieldName)
      );
      if (stepHasField) {
        if (emailUniquenessPreview.status === 'taken') {
          errs[emailUniquenessPreview.fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
        } else if (emailUniquenessPreview.status === 'checking') {
          errs[emailUniquenessPreview.fieldName] = 'Checking email availability…';
        }
      }
    }
    const primaryEmailBlockers = getPrimaryEmailBlockers(stepData);
    if (primaryEmailBlockers.hasPending) {
      for (const field of getPrimaryEmailFieldsForStep(stepData)) {
        if (pendingPrimaryEmailChecks[field.fieldName]) {
          errs[field.fieldName] = 'Checking email availability…';
        }
      }
    }
    if (primaryEmailBlockers.hasDuplicate) {
      for (const field of getPrimaryEmailFieldsForStep(stepData)) {
        if (dynamicErrors[field.fieldName] === DUPLICATE_PRIMARY_EMAIL_ERROR) {
          errs[field.fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
        }
      }
    }
    setDynamicErrors(errs);
    return Object.keys(errs).length === 0;
  }, [dynamicFormData, applicantNameCheck.status, applicantNameCheck.fieldName, emailUniquenessPreview.status, emailUniquenessPreview.fieldName, getPrimaryEmailBlockers, getPrimaryEmailFieldsForStep, pendingPrimaryEmailChecks, dynamicErrors, isUpdateMode]);

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

  const emailUniqueness = emailUniquenessPreview;

  const handleNext = () => {
    const currentDynamicStep = steps[currentStep]?.type === 'dynamic' ? steps[currentStep]?.stepData : undefined;
    const primaryEmailBlockers = getPrimaryEmailBlockers(currentDynamicStep);
    if (!isUpdateMode && (primaryEmailBlockers.hasPending || emailUniqueness.status === 'checking')) {
      toast.error('Please wait — verifying email availability…');
      return;
    }
    if (!validateScope()) return;
    if (!validateCurrentStep()) {
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!isUpdateMode && (primaryEmailBlockers.hasDuplicate || primaryEmailBlockers.hasTakenStatus || emailUniqueness.status === 'taken')) {
      toast.error(DUPLICATE_PRIMARY_EMAIL_SUBMIT_ERROR);
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
    setPendingPrimaryEmailChecks(prev => {
      if (!(fieldName in prev)) return prev;
      return { ...prev, [fieldName]: false };
    });
    latestPrimaryEmailCheckRef.current[fieldName] = (latestPrimaryEmailCheckRef.current[fieldName] || 0) + 1;
  }, []);

  const handleAddDocument = useCallback((doc: Parameters<typeof addDocument>[0]) => {
    setDocumentsTouched(true);
    addDocument(doc);
  }, [addDocument]);

  const handleRemoveDocument = useCallback((docId: string) => {
    setDocumentsTouched(true);
    removeDocument(docId);
  }, [removeDocument]);

  const saveRegistrationUpdate = async () => {
    if (!updateContext || !session) {
      toast.error('Existing registration could not be resolved. Please refresh and try again.');
      return;
    }

    const existingRegistration = updateContext.registration;
    const existingDocuments = (existingRegistration.documents_metadata as unknown[]) || [];
    try {
      guardAgainstBlankOverwrite(existingRegistration.applicant_name, form.applicantName, 'registration applicant name');
      guardAgainstBlankOverwrite(existingRegistration.entity_specific_data, { ...form.entitySpecificData, ...dynamicFormData }, 'registration dynamic data');
      if (existingDocuments.length > 0 && form.documents.length === 0 && !documentsTouched) {
        console.warn('[registration] Refusing to remove all existing documents from update payload', { existingDocuments });
        toast.error('Existing documents were not loaded. Refresh before changing documents.');
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refusing to save blank registration data.');
      return;
    }

    setSubmitting(true);
    try {
      const mergedEntityData = deepMergeRegistrationData(
        (existingRegistration.entity_specific_data as Record<string, unknown>) || {},
        { ...form.entitySpecificData, ...dynamicFormData },
      );
      const mergedDocuments = documentsTouched || form.documents.length > 0 ? form.documents : (existingRegistration.documents_metadata as Json);

      const { error: regError } = await supabase
        .from('registrations')
        .update({
          sector_id: form.sectorId,
          sub_sector_id: form.subSectorId,
          category_id: form.categoryId,
          applicant_name: form.applicantName,
          applicant_name_alt: form.applicantNameAlt || null,
          registration_number: form.registrationNumber || null,
          mailing_address: form.mailingAddress as unknown as Json,
          physical_address: (form.sameAsMailing ? form.mailingAddress : form.physicalAddress) as unknown as Json,
          same_as_mailing: form.sameAsMailing,
          first_name: form.firstName,
          last_name: form.lastName,
          telephone: form.telephone,
          email: form.email,
          username: form.username || null,
          entity_specific_data: mergedEntityData as Json,
          documents_metadata: mergedDocuments as Json,
          terms_accepted: true,
          status: 'pending_review',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRegistration.id)
        .eq('user_id', session.user.id);
      if (regError) throw regError;

      const resolvedSubmission = updateContext.submission || await resolveRegistrationSubmission({
        userId: session.user.id,
        registrationId: existingRegistration.id,
        formId: updateContext.formId,
      });
      if (resolvedSubmission) {
        const existingFormData = (resolvedSubmission.form_data as Record<string, unknown>) || {};
        guardAgainstBlankOverwrite(existingFormData, dynamicFormData, 'registration form data');
        const mergedFormData = deepMergeRegistrationData(existingFormData, dynamicFormData);
        const { error: subError } = await supabase
          .from('registration_form_submissions')
          .update({
            form_data: mergedFormData as Json,
            status: 'submitted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolvedSubmission.id)
          .eq('user_id', session.user.id);
        if (subError) throw subError;
      }

      await supabase.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'registration.resubmitted',
          entity_type: 'registration',
          entity_id: existingRegistration.id,
          payload: {
            registration_id: existingRegistration.id,
            applicant_id: session.user.id,
            applicant_name: form.applicantName,
            applicant_email: form.email,
            registration_reference: existingRegistration.registration_reference,
            registration_number: existingRegistration.registration_reference,
            portal_url: window.location.origin,
          },
        },
      });

      clearPersistedStep();
      toast.success('Registration updated and resubmitted.');
      navigate('/registration-status', { replace: true });
    } catch (err) {
      console.error('[registration] Update submit failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to resubmit registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const currentDynamicStep = steps[currentStep]?.type === 'dynamic' ? steps[currentStep]?.stepData : undefined;
    const primaryEmailBlockers = getPrimaryEmailBlockers(currentDynamicStep);
    if (!isUpdateMode && (primaryEmailBlockers.hasPending || emailUniqueness.status === 'checking')) {
      toast.error('Please wait — verifying email availability…');
      return;
    }
    if (!validateScope()) return;
    if (!validateCurrentStep()) {
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!isUpdateMode && (primaryEmailBlockers.hasDuplicate || primaryEmailBlockers.hasTakenStatus || emailUniqueness.status === 'taken')) {
      toast.error(DUPLICATE_PRIMARY_EMAIL_SUBMIT_ERROR);
      return;
    }

    if (isUpdateMode) {
      await saveRegistrationUpdate();
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
          applicant_name: form.applicantName
            || (applicantNameCheck.fieldName ? String(dynamicFormData[applicantNameCheck.fieldName] || '') : '')
            || String(dynamicFormData.applicant_name || ''),
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
          resetRegistrationFlow();
          navigate('/');
          return;
        }
      }

      const registrationRef = data?.registration_reference || '';
      resetRegistrationFlow();
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
              updateMode={isUpdateMode}
            />
          );
        }
        return <PrimaryUserStep form={form} errors={errors} setField={setField} updateMode={isUpdateMode} />;

      case 'dynamic':
        if (step.stepData) {
          return (
            <RegistrationStepRenderer
              step={step.stepData}
              data={dynamicFormData}
              errors={dynamicErrorsWithUniqueness}
              onChange={handleDynamicFieldChange}
              onBlur={handleDynamicFieldBlur}
            />
          );
        }
        return <p className="text-muted-foreground">No form section configured for this step.</p>;

      case 'documents':
        return (
          <DocumentsStep
            documents={form.documents}
            onAddDocument={handleAddDocument}
            onRemoveDocument={handleRemoveDocument}
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
            updateMode={isUpdateMode}
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
    type RF = { label: string; value: any; type?: 'attachment' | 'display'; displayKind?: 'heading' | 'info' | 'divider'; headingLevel?: 1 | 2 | 3 | 4 | 5 | 6; placeholder?: string; defaultValue?: string; helpText?: string };
    const sections: { title: string; fields: RF[] }[] = [];

    if (config?.formSchema && config.formSchema.length > 0) {
      config.formSchema.forEach((s) => {
        const fields: RF[] = [];
        s.rows.forEach(r => r.columns.forEach(c => {
          if (!c.field) return;
          const f = c.field;
          // Render display-only fields inline (heading/info/divider), no value
          if (isDisplayOnlyField(f)) {
            const kind = resolveDisplayKind(f.type);
            fields.push({
              label: f.label || '',
              value: resolveDisplayOnlyFieldText(f),
              type: 'display',
              displayKind: kind,
              headingLevel: (f as any).headingLevel,
              placeholder: (f as any).placeholder,
              defaultValue: (f as any).defaultValue,
              helpText: (f as any).helpText,
            });
            return;
          }
          const raw = dynamicFormData[f.fieldName];
          // File fields are always rendered as attachments (driven by field
          // type, not value-shape guessing) so View/Download icons display
          // even for legacy or partial value shapes.
          if (f.type === 'file' || isAttachmentValue(raw)) {
            fields.push({ label: f.label, value: raw ?? null, type: 'attachment' });
            return;
          }
          const resolved = resolveReviewValue(f, raw);
          fields.push({ label: f.label, value: formatReviewValue(resolved) });
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
          ? form.documents.map(d => ({ label: d.label || d.name, value: d, type: 'attachment' as const }))
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

  if (isUpdateMode && (authLoading || updateLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-4xl mx-auto px-4 py-16">
          <Skeleton className="h-8 w-72 mb-6" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full mb-4" />)}
        </div>
      </div>
    );
  }

  if (isUpdateMode && updateError) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to load registration update</h2>
          <p className="text-sm text-muted-foreground mb-6">{updateError}</p>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </div>
      </div>
    );
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
            <h1 className="text-xl sm:text-2xl font-bold">{isUpdateMode ? 'Update & Resubmit Registration' : 'Pre-Licensee Registration'}</h1>
          </div>
          <p className="text-sm sm:text-base text-primary-foreground/80">
            {isUpdateMode ? 'Review the requested changes, update your existing information, and resubmit.' : 'Complete the registration form below. All fields marked with * are required.'}
          </p>
        </div>
      </div>

      {isUpdateMode && updateContext && (
        <div className="max-w-4xl mx-auto px-4 pt-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Changes Requested</p>
                <p className="text-muted-foreground">
                  Reference: <span className="font-mono text-foreground">{updateContext.registration.registration_reference || updateContext.registration.id}</span>
                  {' '}• Last submitted: {updateContext.registration.updated_at ? new Date(updateContext.registration.updated_at).toLocaleString() : '—'}
                </p>
                {updateContext.remarks && (
                  <div className="mt-2 rounded-md border bg-background p-3 whitespace-pre-wrap text-foreground">
                    {updateContext.remarks}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                <>{isUpdateMode ? 'Update & Resubmit Registration' : 'Submit Registration'}<Send className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          )}
        </div>

        {!isUpdateMode && <div className="text-center border-t border-border pt-6 mt-6">
          <p className="text-sm text-muted-foreground">
            Already registered?{' '}
            <button onClick={() => navigate('/')} className="font-medium text-primary hover:underline">
              Sign in here
            </button>
          </p>
        </div>}
      </div>
    </div>
  );
}
