import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { registrationUploadCapabilityForSubmit, setRegistrationJourneyEmail } from '@/lib/registrationFileAccess';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import { useRegistrationConfig } from '@/hooks/useRegistrationConfig';
import { SectorSelectionSection } from '@/components/registration/SectorSelectionSection';
import { DocumentsStep } from '@/components/registration/DocumentsStep';
import { SecurityScanningNotice } from '@/components/registration/SecurityScanningNotice';
import { DeclarationsStep } from '@/components/registration/DeclarationsStep';
import { EmailVerificationSection } from '@/components/registration/EmailVerificationSection';
import { useEmailVerificationStatus } from '@/hooks/useEmailVerificationStatus';
import {
  BEFORE_SUBMISSION_PLACEMENT,
  resolveEmailVerificationPlacement,
  shouldRenderEmailVerification,
  withVerificationStage,
  isVerificationStageId,
} from '@/lib/registrationEmailVerification';
import { visibleRegSteps } from '@/lib/sectionVisibility';
import { validateEmailFieldSettings } from '@/lib/emailFieldValidation';
import {
  isItemVisible,
  isEffectiveRequired,
  effectiveDocumentTypes as visibleDocTypesFor,
  effectiveDeclarations as visibleDeclarationsFor,
  isDocumentsStepVisible,
  isDeclarationsStepVisible,
} from '@/lib/registrationItemVisibility';

import { DynamicRegistrationStepper } from '@/components/registration/DynamicRegistrationStepper';
import { RegistrationStepRenderer } from '@/components/registration/RegistrationStepRenderer';
import { ArrowRight, ArrowLeft, FileText, Send, Loader2 } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { toast } from 'sonner';
import type { RegStep, RegField } from '@/types/registrationForm';
import {
  getRegistrationCredentialSchemaFields,
  isRegistrationConfirmPasswordField,
  isRegistrationEmailField,
  isRegistrationPasswordField,
  resolveRegistrationEmail,
  resolveRegistrationLoginEmail,
  resolveRegistrationPassword,
  resolveRegistrationFirstName,
  resolveRegistrationLastName,
  resolveRegistrationApplicantName,
  findRegistrationFirstNameField,
  findRegistrationLastNameField,
  findRegistrationApplicantNameField,
} from '@/lib/registrationEmail';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import { isAttachmentValue } from '@/components/registration/AttachmentDisplay';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { useReviewValueResolver } from '@/components/registration/useReviewValueResolver';
import { useApplicantNameUniqueness } from '@/components/registration/useApplicantNameUniqueness';
import { neutraliseRegistrationSubmitError } from '@/lib/registrationDuplicateMessage';
import { usePrimaryUserEmailUniqueness } from '@/components/registration/usePrimaryUserEmailUniqueness';
import { isDisplayOnlyField, resolveDisplayKind, resolveDisplayOnlyFieldText } from '@/lib/registrationDisplayTypes';
import { isPrimaryEmailField, isValidEmail, normalizeEmailValue } from '@/lib/primaryEmailValidation';
import { AlertCircle } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { useCaptchaRuntime } from '@/hooks/useCaptchaConfig';
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
  } catch { /* intentionally ignored */ }
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
    form, errors, lastErrorsRef, setField,
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

  // CAPTCHA is only required when the form asks for it AND it is globally enabled.
  // When enabled-but-unconfigured the widget blocks submission (no checkbox fallback).
  // An admin-hidden control is never shown nor enforced on the applicant side.
  const { data: captchaRuntime } = useCaptchaRuntime();
  const captchaVisible = config?.captchaVisible !== false;
  const otpVisible = config?.otpVisible !== false;

  const effectiveRequireCaptcha =
    (config?.requireCaptcha ?? true) && captchaVisible && (captchaRuntime?.globallyEnabled ?? false);


  // Steps the admin marked hidden never reach the applicant: they are excluded
  // from navigation, validation, progress and the review summary. Any data
  // already captured for them is preserved untouched.
  const visibleSchema = useMemo(
    () => visibleRegSteps(config?.formSchema),
    [config?.formSchema],
  );



  const [currentStep, setCurrentStep] = useState<number>(() => {
    const saved = sessionStorage.getItem(STEP_KEY);
    const parsed = saved ? Number(saved) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  /** Furthest step the user has reached — every step up to it stays navigable. */
  const [maxVisitedStep, setMaxVisitedStep] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [dynamicFormData, setDynamicFormData] = useState<Record<string, unknown>>(loadDynamicData);
  const [dynamicErrors, setDynamicErrors] = useState<Record<string, string>>({});
  const [updateContext, setUpdateContext] = useState<ResolvedRegistrationUpdate | null>(null);
  const [updateLoading, setUpdateLoading] = useState(isUpdateMode);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [documentsTouched, setDocumentsTouched] = useState(false);
  const [pendingPrimaryEmailChecks, setPendingPrimaryEmailChecks] = useState<Record<string, boolean>>({});
  const latestPrimaryEmailCheckRef = useRef<Record<string, number>>({});
  const dynamicFormDataRef = useRef<Record<string, unknown>>(dynamicFormData);
  /** Snapshot of the record's own values in update mode — an unchanged email is
   *  never treated as a duplicate and never needs re-verification. */
  const initialDynamicDataRef = useRef<Record<string, unknown>>(dynamicFormData);
  // Captures the last dynamic-step validation result so handleNext/handleSubmit
  // can show a summary toast naming the offending fields with their labels.
  const lastDynamicErrorsRef = useRef<{ errs: Record<string, string>; step: RegStep | null }>({ errs: {}, step: null });

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
        const existingDynamic = deepMergeRegistrationData(
          (resolved.registration.entity_specific_data as Record<string, unknown>) || {},
          (resolved.submission?.form_data as Record<string, unknown>) || {},
        );
        initialDynamicDataRef.current = existingDynamic;
        setDynamicFormData(existingDynamic);

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
    } catch { /* intentionally ignored */ }
  }, []);

  const resetRegistrationFlow = useCallback(() => {
    clearPersistedStep();
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setMaxVisitedStep(0);
    setDynamicFormData({});
    setDynamicErrors({});
    reset();
  }, [clearPersistedStep, reset]);

  // Persist current step across page refreshes (cleared on submit/reset).
  // With no applicant-visible step the stored index is dropped so a later
  // config change never restores a stale position.
  useEffect(() => {
    if (isUpdateMode) return;
    if (visibleSchema.length === 0) {
      sessionStorage.removeItem(STEP_KEY);
      return;
    }
    sessionStorage.setItem(STEP_KEY, String(currentStep));
  }, [currentStep, isUpdateMode, visibleSchema.length]);


  // Remember the furthest step reached so the stepper allows forward jumps back
  // to steps the user already visited (e.g. after going back from Review).
  useEffect(() => {
    setMaxVisitedStep(prev => (currentStep > prev ? currentStep : prev));
  }, [currentStep]);

  // Persist dynamic step data so going back to previous steps preserves entries
  useEffect(() => {
    dynamicFormDataRef.current = dynamicFormData;
    if (isUpdateMode) return;
    try {
      sessionStorage.setItem(DYNAMIC_DATA_KEY, JSON.stringify(dynamicFormData));
    } catch { /* intentionally ignored */ }
  }, [dynamicFormData, isUpdateMode]);

  // Resolve the effective verification email across static + dynamic schemas.
  // Single source of truth used by DeclarationsStep / OTP verification UI.
  const effectiveEmail = useMemo(
    () => resolveRegistrationLoginEmail(form.email, dynamicFormData, visibleSchema),
    [form.email, dynamicFormData, visibleSchema],
  );

  // Dynamic Applicant Name uniqueness (resolved from form schema metadata)
  const applicantNameCheck = useApplicantNameUniqueness(visibleSchema, dynamicFormData);

  // Surface uniqueness errors inline on the resolved fields (applicant name + primary email)
  const emailUniquenessPreview = usePrimaryUserEmailUniqueness(effectiveEmail, visibleSchema);
  const primaryEmailFieldName = emailUniquenessPreview.fieldName;
  const dynamicErrorsWithUniqueness = useMemo(() => {
    const next = { ...dynamicErrors };
    if (!isUpdateMode && emailUniquenessPreview.status === 'taken' && emailUniquenessPreview.fieldName) {
      next[emailUniquenessPreview.fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
    }
    return next;
  }, [dynamicErrors, emailUniquenessPreview.status, emailUniquenessPreview.fieldName, isUpdateMode]);

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
        console.warn('[registration] primary email uniqueness RPC failed', error);
        // Soft-fail: do not block the user. Server-side validation will catch duplicates at submit.
        setDynamicErrors(prev => {
          const next = { ...prev };
          if (next[fieldName] === DUPLICATE_PRIMARY_EMAIL_ERROR) delete next[fieldName];
          return next;
        });
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
  const baseSteps = useMemo(() => {
    const result: { id: string; label: string; type: 'static' | 'dynamic' | 'documents' | 'declarations' | 'review' | 'verification'; stepData?: RegStep }[] = [];

    // Only configured, applicant-visible sections become steps. An empty result
    // is NOT permission to substitute the legacy Entity Details / Primary User
    // form — the page renders an "unavailable" state instead (see below).
    visibleSchema.forEach((regStep) => {
      result.push({ id: regStep.id, label: regStep.title, type: 'dynamic', stepData: regStep });
    });


    // A hidden section (or a section whose every item is hidden) is skipped entirely.
    if (isDocumentsStepVisible({
      requireDocuments: config ? config.requireDocuments : true,
      documentsSectionVisible: config?.documentsSectionVisible !== false,
      documentTypes: config?.documentTypes ?? null,
    })) {
      result.push({ id: 'documents', label: 'Supporting Documents', type: 'documents' });
    }

    // OTP only keeps the Declarations step alive when the configured placement
    // actually resolves to that stage (legacy / unknown / deleted step id).
    const storedPlacement = (config?.emailVerificationStepId || '').trim();
    const otpLandsOnDeclarations =
      !storedPlacement
      || storedPlacement === BEFORE_SUBMISSION_PLACEMENT
      || storedPlacement === 'declarations'
      || !result.some(s => s.id === storedPlacement);

    if (isDeclarationsStepVisible({
      declarationsSectionVisible: config?.declarationsSectionVisible !== false,
      declarations: config?.declarations && config.declarations.length > 0 ? config.declarations : null,
      otpOnDeclarations: (config?.requireOtp ?? true) && otpVisible && otpLandsOnDeclarations,
      captchaOnDeclarations: effectiveRequireCaptcha,
    })) {
      result.push({ id: 'declarations', label: 'Declarations', type: 'declarations' });
    }


    if (reviewEnabled) {
      result.push({ id: 'review', label: 'Review & Submit', type: 'review' as any });
    }

    return result;
  }, [config, reviewEnabled, visibleSchema, otpVisible, effectiveRequireCaptcha]);

  // Where email OTP verification belongs, resolved once from the admin config.
  // NULL / unknown / deleted step ids fall back to the legacy pre-submission stage.
  const emailVerificationPlacement = useMemo(
    () => resolveEmailVerificationPlacement(config?.emailVerificationStepId, baseSteps),
    [config?.emailVerificationStepId, baseSteps],
  );
  // A hidden OTP control is neither rendered nor enforced.
  const requireOtp = (config?.requireOtp ?? true) && otpVisible;

  // Keep the verified flag alive on every step (and across refreshes) for the
  // resolved login email, so a later step never demands re-verification.
  const setEmailVerified = useCallback(
    (value: boolean) => setField('emailVerified', value),
    [setField],
  );
  const { hydrating: emailVerificationHydrating } = useEmailVerificationStatus({
    email: effectiveEmail,
    verified: form.emailVerified,
    setVerified: setEmailVerified,
    enabled: requireOtp && !isUpdateMode,
  });
  // SEC-CRIT-01B: secure uploads are bound to the verified registration journey.
  useEffect(() => {
    setRegistrationJourneyEmail(form.emailVerified && effectiveEmail ? String(effectiveEmail) : null);
  }, [form.emailVerified, effectiveEmail]);


  // Verification gets its own stage right after the configured step, so the
  // applicant types the email, presses Next, and then verifies it.
  const steps = useMemo(
    () => withVerificationStage(baseSteps, emailVerificationPlacement, {
      requireOtp,
      updateMode: isUpdateMode,
    }) as typeof baseSteps,
    [baseSteps, emailVerificationPlacement, requireOtp, isUpdateMode],
  );

  const STEP_COUNT = steps.length;
  const isLastStep = currentStep === STEP_COUNT - 1;

  // A stale persisted step index (or a config change that drops a step) must
  // never leave the applicant on a step that no longer exists.
  useEffect(() => {
    if (STEP_COUNT === 0) return;
    if (currentStep > STEP_COUNT - 1) setCurrentStep(STEP_COUNT - 1);
  }, [STEP_COUNT, currentStep]);



  /** True when the OTP block belongs on the step at `index`. */
  const isEmailVerificationStep = useCallback((index: number) => {
    const step = steps[index];
    if (!step) return false;
    return shouldRenderEmailVerification({
      stepId: step.id,
      stepType: step.type,
      placement: emailVerificationPlacement,
      requireOtp,
      updateMode: isUpdateMode,
    });
  }, [steps, emailVerificationPlacement, requireOtp, isUpdateMode]);

  // Clamp currentStep when steps array shrinks (e.g. saved index from older config)
  useEffect(() => {
    if (STEP_COUNT > 0 && currentStep > STEP_COUNT - 1) {
      setCurrentStep(STEP_COUNT - 1);
    }
  }, [STEP_COUNT, currentStep]);

  // Validate a dynamic step's required fields
  const validateDynamicStep = useCallback((stepData: RegStep): boolean => {
    const errs: Record<string, string> = {};

    const isRequiredValueMissing = (field: RegField, value: unknown): boolean => {
      if (value === undefined || value === null) return true;
      if (field.type === 'checkbox') return value !== true && value !== 'true';
      if (field.type === 'multi_select') return !Array.isArray(value) || value.length === 0;
      if (field.type === 'file' || field.type === 'signature') {
        if (isAttachmentValue(value)) return false;
        if (typeof value === 'object') {
          const v = value as Record<string, unknown>;
          if (v.path || v.url || v.name || v.id) return false;
        }
        return true;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' || trimmed === '__empty';
      }
      if (Array.isArray(value)) return value.length === 0;
      return false;
    };

    // Determine how many repeatable entries to validate (matches renderer heuristic):
    // any saved key matching `<base>__<n>` raises the count to n+1.
    const baseNames = stepData.rows.flatMap(r => r.columns.map(c => c.field?.fieldName).filter(Boolean) as string[]);
    let entryCount = 1;
    if (stepData.isRepeatable) {
      for (const k of Object.keys(dynamicFormData || {})) {
        const m = k.match(/^(.+)__(\d+)$/);
        if (!m || !baseNames.includes(m[1])) continue;
        const n = parseInt(m[2], 10);
        if (!isNaN(n) && n + 1 > entryCount) entryCount = n + 1;
      }
    }

    const validateOneEntry = (entryIndex: number) => {
      for (const row of stepData.rows) {
        for (const col of row.columns) {
          const field = col.field;
          if (!field) continue;
          if (isDisplayOnlyField(field)) continue;
          const effectiveName = entryIndex === 0
            ? field.fieldName
            : `${field.fieldName}__${entryIndex}`;
          const val = dynamicFormData[effectiveName];

          if (field.required && isRequiredValueMissing(field, val)) {
            errs[effectiveName] = `${field.label} is required`;
            continue;
          }

          if (val && typeof val !== 'object' && field.validation) {
            const v = field.validation;
            const strVal = String(val);
            if (v.minLength && strVal.length < v.minLength) errs[effectiveName] = `Minimum ${v.minLength} characters`;
            if (v.maxLength && strVal.length > v.maxLength) errs[effectiveName] = `Maximum ${v.maxLength} characters`;
            if (v.min !== undefined && Number(val) < v.min) errs[effectiveName] = `Minimum value is ${v.min}`;
            if (v.max !== undefined && Number(val) > v.max) errs[effectiveName] = `Maximum value is ${v.max}`;
            if (v.pattern) {
              try {
                if (!new RegExp(v.pattern).test(strVal)) {
                  errs[effectiveName] = v.patternMessage || 'Invalid format';
                }
              } catch { /* intentionally ignored */ }
            }
          }
          if (isRegistrationEmailField(field) && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
            errs[effectiveName] = 'Invalid email address';
          }
          if (isRegistrationEmailField(field) && val) {
            // Form-level OTP owns verification (dedicated stage), so the
            // field-level verification gate must not block this step. Uniqueness
            // and every other field rule stay fully enforced.
            const fieldValidation = { ...(field.validation as any) };
            if (requireOtp && !isUpdateMode) fieldValidation.requireEmailVerification = false;
            const emailIssue = validateEmailFieldSettings({
              field: { type: 'email', validation: fieldValidation },
              fieldKey: effectiveName,
              value: val,
              ownEmail: isUpdateMode ? (initialDynamicDataRef.current?.[effectiveName] as string | undefined) ?? null : null,
            });
            if (emailIssue) errs[effectiveName] = emailIssue;
          }


          if (field.type === 'phone' && val && !/^[+]?[\d\s\-()]{7,20}$/.test(String(val))) {
            errs[effectiveName] = 'Invalid phone number';
          }
          // Confirm password: must match the referenced password field within same entry
          if (isRegistrationConfirmPasswordField(field) && val) {
            const baseMatch = field.matchField
              || stepData.rows.flatMap(r => r.columns.map(c => c.field)).find(f => isRegistrationPasswordField(f))?.fieldName;
            const matchName = baseMatch
              ? (entryIndex === 0 ? baseMatch : `${baseMatch}__${entryIndex}`)
              : undefined;
            const target = matchName ? dynamicFormData[matchName] : undefined;
            if (String(val) !== String(target ?? '')) {
              errs[effectiveName] = 'Passwords do not match';
            }
          }
        }
      }
    };

    for (let i = 0; i < entryCount; i++) validateOneEntry(i);
    // F3-B2: applicant-name duplication is decided server-side at submission
    // (the pre-auth existence probe was retired); no client-side step block.
    // Primary email uniqueness — block step until check resolves to 'available'
    if (!isUpdateMode && emailUniquenessPreview.fieldName) {
      const stepHasField = stepData.rows.some(r =>
        r.columns.some(c => c.field?.fieldName === emailUniquenessPreview.fieldName)
      );
      if (stepHasField && emailUniquenessPreview.status === 'taken') {
        errs[emailUniquenessPreview.fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
      }
    }
    const primaryEmailBlockers = getPrimaryEmailBlockers(stepData);
    if (primaryEmailBlockers.hasDuplicate) {
      for (const field of getPrimaryEmailFieldsForStep(stepData)) {
        if (dynamicErrors[field.fieldName] === DUPLICATE_PRIMARY_EMAIL_ERROR) {
          errs[field.fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
        }
      }
    }
    setDynamicErrors(errs);
    lastDynamicErrorsRef.current = { errs, step: stepData };
    return Object.keys(errs).length === 0;
  }, [dynamicFormData, applicantNameCheck.fieldName, emailUniquenessPreview.status, emailUniquenessPreview.fieldName, getPrimaryEmailBlockers, getPrimaryEmailFieldsForStep, pendingPrimaryEmailChecks, dynamicErrors, isUpdateMode, requireOtp]);

  // Build declaration keys for validation
  const effectiveDeclarations = useMemo(() => {
    if (config?.declarations && config.declarations.length > 0) {
      // Hidden declarations (row-level or whole section) never reach the
      // applicant, so they can never be required.
      if (config.declarationsSectionVisible === false) return [];
      return config.declarations
        .map((d, idx) => ({
          fieldKey: declFieldKey(d.label, idx),
          label: d.label,
          required: isEffectiveRequired(d),
          visible: isItemVisible(d),
        }))
        .filter(d => d.visible);
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

    // While the verified state is still being restored (marker / server lookup)
    // never claim the email is unverified — that was the confusing error.
    if (requireOtp && !form.emailVerified && emailVerificationHydrating) {
      toast.info('Checking your email verification status…');
      return false;
    }

    // Verification gate: when OTP is configured for this step, the applicant
    // cannot advance until the resolved email is verified. The declarations
    // stage keeps its own check inside validateDeclarations.
    if (step.type !== 'declarations' && isVerificationStageId(step.id) && isEmailVerificationStep(currentStep) && !form.emailVerified) {
      toast.error('Please verify your email address before continuing.');
      return false;
    }


    switch (step.type) {

      case 'dynamic':
        return step.stepData ? validateDynamicStep(step.stepData) : true;
      case 'declarations': {
        // A hidden declarations section makes every declaration non-mandatory;
        // only the verification controls still gate the step.
        if (config?.declarationsSectionVisible === false) {
          return validateDeclarations([], requireOtp, effectiveRequireCaptcha);
        }
        const useDynamic = config?.declarations && config.declarations.length > 0;
        if (useDynamic) {
          return validateDeclarations(
            effectiveDeclarations,
            requireOtp,
            effectiveRequireCaptcha,
          );
        }
        return validateStep(3);
      }
      case 'documents':
        // Validate required document types
        if (config?.documentTypes) {
          const requiredTypes = config.documentsSectionVisible === false
            ? []
            : config.documentTypes.filter(isEffectiveRequired);
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
  }, [currentStep, steps, validateStep, validateDynamicStep, validateDeclarations, effectiveDeclarations, config, form.documents, form.emailVerified, emailVerificationHydrating, isEmailVerificationStep, effectiveRequireCaptcha, requireOtp]);

  const validateScope = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    // Accept either the hardcoded form state (legacy configs) or the dynamic
    // schema values (new backend-configured forms where sector/sub_sector/
    // category are dynamic fields).
    const dynSector = String(dynamicFormData.sector || '');
    const dynSubSector = String(dynamicFormData.sub_sector || '');
    const dynCategory = String(dynamicFormData.category || '');
    // If the dynamic schema owns sector selection, don't block "Next" on
    // earlier steps — validateDynamicStep will enforce required-ness on the
    // Sector step itself.
    const dynamicOwnsSector = (visibleSchema || []).some(st =>
      st.rows.some(r => r.columns.some(c => c.field?.dataSource === 'sector'))
    );
    if (dynamicOwnsSector) return true;
    if (!form.sectorId && !dynSector) errs.sectorId = 'Sector is required';
    if (!form.subSectorId && !dynSubSector) errs.subSectorId = 'Sub-sector is required';
    if (!form.categoryId && !dynCategory) errs.categoryId = 'Category is required';
    if (Object.keys(errs).length > 0) {
      setDynamicErrors(prev => ({ ...prev, ...errs }));
      toast.error('Please select sector, sub-sector and category to continue.');
      return false;
    }
    return true;
  }, [form.sectorId, form.subSectorId, form.categoryId, dynamicFormData, visibleSchema]);


  const emailUniqueness = emailUniquenessPreview;

  // Human-readable labels for static (hook-driven) step fields, used by the
  // summary toast when validateStep/validateDeclarations fails.
  const STATIC_FIELD_LABELS: Record<string, string> = {
    sectorId: 'Sector',
    subSectorId: 'Sub-sector',
    categoryId: 'Category',
    applicantName: 'Applicant Name',
    'mailing.street': 'Mailing Street',
    'mailing.city': 'Mailing City',
    'mailing.state': 'Mailing State',
    'mailing.country': 'Mailing Country',
    'physical.street': 'Physical Street',
    'physical.city': 'Physical City',
    'physical.state': 'Physical State',
    'physical.country': 'Physical Country',
    firstName: 'First Name',
    lastName: 'Last Name',
    telephone: 'Telephone',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    termsAccepted: 'Terms & Conditions',
    privacyAccepted: 'Privacy Policy',
    dataProtectionAccepted: 'Data Protection Notice',
    captcha: 'Captcha',
    emailVerified: 'Email Verification',
  };

  const reportValidationFailure = () => {
    // Gather entries from whichever validator just ran.
    const stepType = steps[currentStep]?.type;
    const entries: Array<{ fieldName: string; label: string; message: string }> = [];

    if (stepType === 'dynamic') {
      const { errs, step } = lastDynamicErrorsRef.current;
      const labelByName: Record<string, string> = {};
      step?.rows.forEach(r => r.columns.forEach(c => {
        if (c.field?.fieldName) labelByName[c.field.fieldName] = c.field.label || c.field.fieldName;
      }));
      Object.entries(errs).forEach(([fn, msg]) => {
        entries.push({ fieldName: fn, label: labelByName[fn] || fn, message: msg });
      });
    } else if (stepType === 'static' || stepType === 'declarations') {
      const errs = lastErrorsRef.current || {};
      Object.entries(errs).forEach(([fn, msg]) => {
        entries.push({ fieldName: fn, label: STATIC_FIELD_LABELS[fn] || fn, message: msg });
      });
    }

    if (entries.length === 0) return; // documents path already toasts itself
    const names = entries.slice(0, 3).map(e => e.label).join(', ');
    const more = entries.length > 3 ? ` …and ${entries.length - 3} more` : '';
    toast.error(
      `Please fix ${entries.length} field${entries.length > 1 ? 's' : ''}: ${names}${more}`,
      { description: entries[0]?.message }
    );
  };


  // Resolve any in-flight primary-email uniqueness checks for the current step
  // by issuing direct RPCs (bypasses the 500ms debounce in usePrimaryUserEmailUniqueness).
  // Returns {duplicate} so the caller can short-circuit with a single toast.
  const ensurePrimaryEmailResolved = useCallback(async (
    stepData?: RegStep,
  ): Promise<{ duplicate: boolean }> => {
    if (isUpdateMode) return { duplicate: false };

    const candidates = new Map<string, string>(); // email -> fieldName (for error mapping)
    const fields = stepData ? getPrimaryEmailFieldsForStep(stepData) : [];
    for (const field of fields) {
      const raw = dynamicFormData[field.fieldName];
      const email = normalizeEmailValue(raw);
      if (email && isValidEmail(email) && !candidates.has(email)) {
        candidates.set(email, field.fieldName);
      }
    }
    // Also cover static-step email or schema-resolved primary email field
    const fallbackEmail = normalizeEmailValue(effectiveEmail);
    if (fallbackEmail && isValidEmail(fallbackEmail) && !candidates.has(fallbackEmail)) {
      candidates.set(fallbackEmail, primaryEmailFieldName || 'email');
    }

    if (candidates.size === 0) return { duplicate: false };

    let duplicate = false;
    const errs: Record<string, string> = {};
    for (const [email, fieldName] of candidates) {
      try {
        const { data, error } = await supabase.rpc(
          'check_primary_user_email_exists' as any,
          { p_email: email },
        );
        if (error) continue; // soft-fail; let server-side validation catch it
        if (data === true) {
          duplicate = true;
          errs[fieldName] = DUPLICATE_PRIMARY_EMAIL_ERROR;
        }
      } catch {
        // network error — don't block, let server-side handle it
      }
    }
    if (Object.keys(errs).length > 0) {
      setDynamicErrors(prev => ({ ...prev, ...errs }));
    }
    return { duplicate };
  }, [isUpdateMode, getPrimaryEmailFieldsForStep, dynamicFormData, effectiveEmail, primaryEmailFieldName]);

  const handleNext = async () => {
    if (isAdvancing) return;
    const currentDynamicStep = steps[currentStep]?.type === 'dynamic' ? steps[currentStep]?.stepData : undefined;
    if (!validateScope()) return;
    if (!validateCurrentStep()) {
      reportValidationFailure();
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setIsAdvancing(true);
    try {
      const { duplicate } = await ensurePrimaryEmailResolved(currentDynamicStep);
      if (duplicate) {
        toast.error(DUPLICATE_PRIMARY_EMAIL_SUBMIT_ERROR);
        return;
      }
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      setCurrentStep(prev => Math.min(prev + 1, STEP_COUNT - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsAdvancing(false);
    }
  };


  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDynamicFieldChange = useCallback((fieldName: string, value: unknown) => {
    setDynamicFormData(prev => {
      const next = { ...prev, [fieldName]: value };
      dynamicFormDataRef.current = next;
      return next;
    });
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

      // F3 authority boundary: applicants never write `registrations` directly.
      // The governed RPC enforces ownership, whitelisted fields, allowed
      // lifecycle states, writes history and resumes the approval workflow.
      let mergedFormData: Record<string, unknown> | null = null;
      const resolvedSubmission = updateContext.submission || await resolveRegistrationSubmission({
        userId: session.user.id,
        registrationId: existingRegistration.id,
        formId: updateContext.formId,
      });
      if (resolvedSubmission) {
        const existingFormData = (resolvedSubmission.form_data as Record<string, unknown>) || {};
        guardAgainstBlankOverwrite(existingFormData, dynamicFormData, 'registration form data');
        mergedFormData = deepMergeRegistrationData(existingFormData, dynamicFormData);
      }

      const { error: regError } = await supabase.rpc('registration_applicant_resubmit' as any, {
        _registration_id: existingRegistration.id,
        _payload: {
          sector_id: form.sectorId,
          sub_sector_id: form.subSectorId,
          category_id: form.categoryId,
          applicant_name: form.applicantName,
          applicant_name_alt: form.applicantNameAlt || null,
          registration_number: form.registrationNumber || null,
          mailing_address: form.mailingAddress,
          physical_address: form.sameAsMailing ? form.mailingAddress : form.physicalAddress,
          same_as_mailing: form.sameAsMailing,
          first_name: form.firstName,
          last_name: form.lastName,
          telephone: form.telephone,
          username: form.username || null,
          entity_specific_data: mergedEntityData,
          documents_metadata: mergedDocuments,
          terms_accepted: true,
        } as any,
        _form_data: (mergedFormData ?? null) as any,
        _form_id: resolvedSubmission?.form_id ?? updateContext.formId ?? null,
      } as any);
      if (regError) throw regError;


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
    if (!validateScope()) return;
    if (!validateCurrentStep()) {
      reportValidationFailure();
      const firstError = document.querySelector('.border-destructive, .text-destructive');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const { duplicate } = await ensurePrimaryEmailResolved(currentDynamicStep);
    if (duplicate) {
      toast.error(DUPLICATE_PRIMARY_EMAIL_SUBMIT_ERROR);
      return;
    }


    if (isUpdateMode) {
      await saveRegistrationUpdate();
      return;
    }

    setSubmitting(true);
    try {
      const latestDynamicFormData = dynamicFormDataRef.current;
      const emailVal = resolveRegistrationEmail(form.email, latestDynamicFormData, visibleSchema);
      const passwordVal = resolveRegistrationPassword(form.password, latestDynamicFormData, visibleSchema);
      const firstNameVal = resolveRegistrationFirstName(form.firstName, latestDynamicFormData, visibleSchema);
      const lastNameVal = resolveRegistrationLastName(form.lastName, latestDynamicFormData, visibleSchema);
      const applicantNameVal = resolveRegistrationApplicantName(
        form.applicantName,
        latestDynamicFormData,
        visibleSchema,
        applicantNameCheck.fieldName,
      );

      if (!emailVal || !passwordVal) {
        const credentialErrors: Record<string, string> = {};
        let targetStepIndex = -1;

        if (!emailVal) {
          const emailField = visibleSchema
            ?.flatMap((step, stepIndex) => step.rows.flatMap(row => row.columns.map(col => ({ field: col.field, stepIndex }))))
            .find(({ field }) => isRegistrationEmailField(field));
          if (emailField?.field?.fieldName) {
            credentialErrors[emailField.field.fieldName] = `${emailField.field.label || 'Email'} is required`;
            targetStepIndex = emailField.stepIndex;
          }
        }

        if (!passwordVal) {
          const passwordField = visibleSchema
            ?.flatMap((step, stepIndex) => step.rows.flatMap(row => row.columns.map(col => ({ field: col.field, stepIndex }))))
            .find(({ field }) => isRegistrationPasswordField(field));
          if (passwordField?.field?.fieldName) {
            credentialErrors[passwordField.field.fieldName] = `${passwordField.field.label || 'Password'} is required`;
            if (targetStepIndex < 0) targetStepIndex = passwordField.stepIndex;
          }
        }

        if (Object.keys(credentialErrors).length > 0) {
          setDynamicErrors(prev => ({ ...prev, ...credentialErrors }));
          if (targetStepIndex >= 0) setCurrentStep(targetStepIndex);
        }
        toast.error('Email and password are required to complete registration.');
        setSubmitting(false);
        return;
      }

      if (!firstNameVal || !lastNameVal || !applicantNameVal) {
        const identityErrors: Record<string, string> = {};
        let targetStepIndex = -1;
        const missingLabels: string[] = [];

        if (!firstNameVal) {
          const match = findRegistrationFirstNameField(visibleSchema);
          if (match?.field?.fieldName) {
            identityErrors[match.field.fieldName] = `${match.field.label || 'First name'} is required`;
            if (targetStepIndex < 0) targetStepIndex = match.stepIndex;
          }
          missingLabels.push('first name');
        }
        if (!lastNameVal) {
          const match = findRegistrationLastNameField(visibleSchema);
          if (match?.field?.fieldName) {
            identityErrors[match.field.fieldName] = `${match.field.label || 'Last name'} is required`;
            if (targetStepIndex < 0) targetStepIndex = match.stepIndex;
          }
          missingLabels.push('last name');
        }
        if (!applicantNameVal) {
          const match = findRegistrationApplicantNameField(visibleSchema);
          const fieldName = match?.field?.fieldName || applicantNameCheck.fieldName;
          if (fieldName) {
            identityErrors[fieldName] = `${match?.field?.label || 'Applicant name'} is required`;
            if (targetStepIndex < 0 && match) targetStepIndex = match.stepIndex;
          }
          missingLabels.push('applicant name');
        }

        if (Object.keys(identityErrors).length > 0) {
          setDynamicErrors(prev => ({ ...prev, ...identityErrors }));
          if (targetStepIndex >= 0) setCurrentStep(targetStepIndex);
        }
        toast.error(`Missing required fields: ${missingLabels.join(', ')}.`);
        setSubmitting(false);
        return;
      }

      // Derive addresses from dynamic form data when the schema owns them
      // (backend-configured form). Falls back to hardcoded form state for
      // legacy configs.
      const d = latestDynamicFormData as Record<string, unknown>;
      const dynamicMailing = {
        street: String(d.mailing_street || ''),
        city: String(d.mailing_city || ''),
        state: String(d.mailing_state || ''),
        country: String(d.mailing_country || ''),
        postCode: String(d.mailing_postcode || ''),
      };
      const dynamicPhysical = {
        street: String(d.physical_street || ''),
        city: String(d.physical_city || ''),
        state: String(d.physical_state || ''),
        country: String(d.physical_country || ''),
        postCode: String(d.physical_postcode || ''),
      };
      const dynSameAsMailing = d.same_as_mailing === true || d.same_as_mailing === 'true';
      const hasDynamicMailing = !!(dynamicMailing.street || dynamicMailing.city || dynamicMailing.country);
      const effectiveMailing = hasDynamicMailing ? dynamicMailing : form.mailingAddress;
      const effectiveSameAsMailing = hasDynamicMailing ? dynSameAsMailing : form.sameAsMailing;
      const effectivePhysical = effectiveSameAsMailing
        ? effectiveMailing
        : (hasDynamicMailing ? dynamicPhysical : form.physicalAddress);

      const { data, error } = await supabase.functions.invoke('register-pre-licensee', {
        body: {
          email: emailVal,
          password: passwordVal,
          first_name: firstNameVal,
          last_name: lastNameVal,
          applicant_name: applicantNameVal,
          applicant_name_alt: form.applicantNameAlt || String(latestDynamicFormData.applicant_name_alt || ''),
          sector_id: form.sectorId || String(latestDynamicFormData.sector || ''),
          sub_sector_id: form.subSectorId || String(latestDynamicFormData.sub_sector || ''),
          category_id: form.categoryId || String(latestDynamicFormData.category || ''),
          mailing_address: effectiveMailing,
          physical_address: effectivePhysical,
          same_as_mailing: effectiveSameAsMailing,
          telephone: form.telephone || String(latestDynamicFormData.telephone || ''),
          username: form.username || String(latestDynamicFormData.username || '') || null,
          registration_number: form.registrationNumber || String(latestDynamicFormData.registration_number || '') || null,
          entity_specific_data: { ...form.entitySpecificData, ...latestDynamicFormData },
          documents_metadata: form.documents,
          captcha_verification_id: form.captchaVerificationId ?? null,
          terms_accepted: true, // validated before reaching submit
          upload_capability: registrationUploadCapabilityForSubmit(),
        },
      });


      if (error) {
        const errMsg = typeof error === 'object' && error.message ? error.message : String(error);
        // The verification id is single-use server-side: force a fresh challenge.
        setField('captchaVerificationId', null);
        toast.error(neutraliseRegistrationSubmitError(errMsg));
        setSubmitting(false);
        return;
      }

      if (data?.error) {
        setField('captchaVerificationId', null);
        toast.error(neutraliseRegistrationSubmitError(data.error));
        setSubmitting(false);
        return;
      }


      if (data?.warning) toast.warning(data.warning);

      // Do NOT sign the applicant in: the registration still needs approval,
      // so a session would only park them behind the approval gate (and show a
      // confusing second "sign out" screen). Clear any stale session instead.
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore — nothing to sign out of */
      }

      const registrationRef = data?.registration_reference || '';
      resetRegistrationFlow();
      toast.success('Registration submitted successfully!');
      navigate('/registration/success', {
        state: { registrationReference: registrationRef, submittedAt: new Date().toISOString() },
        replace: true,
      });

    } catch (err) {
      console.error('Registration error:', err);
      setField('captchaVerificationId', null);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    const inner = renderStepContent();
    const step = steps[currentStep];
    // Declarations renders the block itself (legacy placement); every other step
    // gets it appended after its own content.
    const showVerification =
      !!step && step.type !== 'declarations' && isVerificationStageId(step.id)
      && isEmailVerificationStep(currentStep);
    if (!showVerification) return inner;
    return (
      <div className="space-y-6">
        {inner}
        <EmailVerificationSection
          form={form}
          errors={errors}
          setField={setField}
          verificationEmail={effectiveEmail}
        />
      </div>
    );
  };

  const renderStepContent = () => {
    const step = steps[currentStep];
    if (!step) return null;

    switch (step.type) {


      case 'dynamic':
        if (step.stepData) {
          return (
            <RegistrationStepRenderer
              step={step.stepData}
              data={dynamicFormData}
              errors={dynamicErrorsWithUniqueness}
              onChange={handleDynamicFieldChange}
              onBlur={handleDynamicFieldBlur}
              userId={session?.user?.id ?? null}
              entityType="registration"
              entityId={updateContext?.registration?.id ?? null}
              formId={config?.id ?? null}
              /* Form-level OTP owns verification: suppress field-level OTP only. */
              suppressEmailVerification={requireOtp && !isUpdateMode}
            />
          );
        }
        return <p className="text-muted-foreground">No form section configured for this step.</p>;

      case 'documents':
        return (
          <div className="space-y-4">
            <SecurityScanningNotice />
            <DocumentsStep
              documents={form.documents}
              onAddDocument={handleAddDocument}
              onRemoveDocument={handleRemoveDocument}
              errors={errors}
              documentTypes={visibleDocTypesFor(config?.documentTypes, config?.documentsSectionVisible !== false)}
            />
          </div>
        );

      case 'declarations':
        return (
          <DeclarationsStep
            form={form} errors={errors} setField={setField}
            verificationEmail={effectiveEmail}
            declarations={visibleDeclarationsFor(config?.declarations, config?.declarationsSectionVisible !== false)}
            sectionVisible={config?.declarationsSectionVisible !== false}
            termsUrl={config?.termsUrl}
            privacyUrl={config?.privacyUrl}
            dataProtectionUrl={config?.dataProtectionUrl}
            requireOtp={requireOtp}
            requireCaptcha={effectiveRequireCaptcha}
            otpVisible={otpVisible}
            captchaVisible={captchaVisible}
            updateMode={isUpdateMode}
            emailVerificationPlacement={emailVerificationPlacement}
          />
        );

      case 'review':
        return (
          <ReviewAcknowledgement
            /* Applicants are still pre-submission here, so sections stay editable. */
            mode="editable"
            showCompletionSummary={false}
            sections={buildReviewSections()}
            onAcknowledge={handleSubmit}
            onEdit={(idx) => {
              // Review sections follow baseSteps order; map back to the live
              // step list so the generated verification stage cannot shift it.
              const base = baseSteps[idx];
              const target = base ? steps.findIndex(s => s.id === base.id) : -1;
              setCurrentStep(Math.min(target >= 0 ? target : idx, steps.length - 2));
            }}
            loading={submitting}
            title="Review Your Registration"
            description="Please review all information before final submission."
          />
        );

      default:
        return null;
    }
  };

  const resolveReviewValue = useReviewValueResolver(visibleSchema, dynamicFormData as Record<string, unknown>);

  function buildReviewSections() {
    type RF = { label: string; value: any; type?: 'attachment' | 'display'; displayKind?: 'heading' | 'info' | 'divider'; headingLevel?: 1 | 2 | 3 | 4 | 5 | 6; placeholder?: string; defaultValue?: string; helpText?: string };
    const sections: { title: string; fields: RF[] }[] = [];

    if (visibleSchema.length > 0) {
      visibleSchema.forEach((s) => {
        const fields: RF[] = [];
        s.rows.forEach(r => r.columns.forEach(c => {
          if (!c.field) return;
          const f = c.field;
          // Hide credential fields from the review summary
          if (isRegistrationPasswordField(f) || isRegistrationConfirmPasswordField(f)) return;
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
          if (f.type === 'file' || f.type === 'signature' || isAttachmentValue(raw)) {
            fields.push({ label: f.label, value: raw ?? null, type: 'attachment' });
            return;
          }
          const resolved = resolveReviewValue(f, raw);
          fields.push({ label: f.label, value: formatReviewValue(resolved) });
        }));
        sections.push({ title: s.title, fields });
      });
    }


    const documentsSectionShown = isDocumentsStepVisible({
      requireDocuments: config ? config.requireDocuments : true,
      documentsSectionVisible: config?.documentsSectionVisible !== false,
      documentTypes: config?.documentTypes ?? null,
    });
    if (form.documents.length > 0 || documentsSectionShown) {
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

  // Two distinct states, one applicant-facing message:
  //  - no active registration configuration exists at all, or
  //  - a configuration exists but the admin hid every section.
  // Neither may fall back to the legacy Entity Details / Primary User form.
  if (!config || visibleSchema.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Registration Form Not Available</h2>
          <p className="text-sm text-muted-foreground mb-6">
            The registration form is currently not available. Please try again later or contact the
            administrator for assistance.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => navigate('/')}>Back to Home</Button>
            <Button variant="outline" onClick={() => reloadConfig()}>Refresh</Button>
          </div>
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
          maxVisitedStep={maxVisitedStep}
          onStepClick={(idx) => {
            // Allow jumping to any step the user has already reached
            if (idx <= Math.max(maxVisitedStep, currentStep)) {
              setCurrentStep(idx);
            }
          }}
        />
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {/* Licensee Type Scope — only on first step, and only when the dynamic
            schema does not itself supply sector fields (avoids duplicating
            sector selection). */}
        {currentStep === 0
          && !(visibleSchema || []).some(st => st.rows.some(r => r.columns.some(c => c.field?.dataSource === 'sector'))) && (
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
            <Button onClick={handleNext} disabled={isAdvancing} className="sm:ml-auto">
              {isAdvancing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</>
              ) : (
                <>Next<ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          ) : steps[currentStep]?.type === 'review' ? null : (
            <Button data-rbac="registration_management.create" onClick={handleSubmit} disabled={submitting} size="lg" className="sm:ml-auto">
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
