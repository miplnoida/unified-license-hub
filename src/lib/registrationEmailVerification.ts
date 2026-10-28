import type { RegFormSchema } from '@/types/registrationForm';
import { isPrimaryEmailField } from '@/lib/primaryEmailValidation';

/**
 * Reserved placement token preserving the legacy behaviour where email OTP
 * verification is shown in the final (Declarations / pre-submission) stage.
 */
export const BEFORE_SUBMISSION_PLACEMENT = 'before_submission';

export interface PlacementStep {
  id: string;
  /** 'static' | 'dynamic' | 'documents' | 'declarations' | 'review' */
  type: string;
  label?: string;
}

/**
 * Normalises a stored placement value against the actual step list.
 * NULL, empty, unknown or dangling step ids all fall back to the legacy
 * pre-submission placement so no config can end up in a broken state.
 */
export function resolveEmailVerificationPlacement(
  storedStepId: string | null | undefined,
  steps: PlacementStep[],
): string {
  const value = (storedStepId || '').trim();
  if (!value || value === BEFORE_SUBMISSION_PLACEMENT) return BEFORE_SUBMISSION_PLACEMENT;
  const match = steps.find(s => s.id === value && s.type !== 'review');
  return match ? match.id : BEFORE_SUBMISSION_PLACEMENT;
}

export interface ShouldRenderArgs {
  /** Id of the step currently being rendered. */
  stepId: string;
  /** Type of the step currently being rendered. */
  stepType?: string;
  /** Already-resolved placement (see resolveEmailVerificationPlacement). */
  placement: string;
  requireOtp: boolean;
  updateMode?: boolean;
  /**
   * Builder preview only. The preview does not insert the generated
   * verification stage, so it shows the block on the configured placement step
   * itself. The applicant runtime must never do this — that would render OTP
   * twice (placement step + dedicated stage).
   */
  previewMode?: boolean;
}

/**
 * Single source of truth for "does the email verification block belong on this
 * step?". Used by the applicant runtime, the Declarations step and the builder
 * preview so the three can never drift.
 */
export function shouldRenderEmailVerification({
  stepId,
  stepType,
  placement,
  requireOtp,
  updateMode = false,
  previewMode = false,
}: ShouldRenderArgs): boolean {
  if (!requireOtp || updateMode) return false;
  if (placement === BEFORE_SUBMISSION_PLACEMENT) {
    // Legacy placement lives in the final declarations stage.
    return stepType === 'declarations' || stepId === 'declarations';
  }
  // Verification gets its own generated stage right after the configured step,
  // so the applicant enters the email first and verifies it after pressing Next.
  if (stepId === verificationStageId(placement)) return true;
  // Preview has no generated stage, so it renders on the placement step.
  return previewMode && stepId === placement;
}


/** Suffix marking the generated verification stage that follows a step. */
export const VERIFICATION_STAGE_SUFFIX = '::email-verification';

/** Id of the generated verification stage that follows `placement`. */
export function verificationStageId(placement: string): string {
  return `${placement}${VERIFICATION_STAGE_SUFFIX}`;
}

export function isVerificationStageId(stepId: string): boolean {
  return stepId.endsWith(VERIFICATION_STAGE_SUFFIX);
}

/**
 * Returns a copy of `steps` with a dedicated "Email Verification" stage
 * inserted immediately after the configured placement step. Legacy
 * (`before_submission`) placement, update mode and a hidden/disabled OTP
 * control all return the list untouched.
 */
export function withVerificationStage<T extends PlacementStep>(
  steps: T[],
  placement: string,
  opts: { requireOtp: boolean; updateMode?: boolean; label?: string },
): (T | PlacementStep)[] {
  if (!opts.requireOtp || opts.updateMode) return steps;
  if (!placement || placement === BEFORE_SUBMISSION_PLACEMENT) return steps;
  const idx = steps.findIndex(s => s.id === placement);
  if (idx < 0) return steps;
  const stage: PlacementStep = {
    id: verificationStageId(placement),
    type: 'verification',
    label: opts.label || 'Email Verification',
  };
  return [...steps.slice(0, idx + 1), stage, ...steps.slice(idx + 1)];
}

/**
 * Index of the schema step that collects the effective primary email address.
 * Returns -1 when the schema has no recognisable primary email field.
 */
export function findPrimaryEmailStepIndex(schema?: RegFormSchema | null): number {
  if (!schema || schema.length === 0) return -1;
  return schema.findIndex(step =>
    step.rows.some(row => row.columns.some(col => isPrimaryEmailField(col.field))),
  );
}

export const UPLOAD_VERIFICATION_STAGE = 'upload::email-verification';
/** Separate from submission OTP: updates and disabled submission OTP still need upload ownership. */
export function withUploadVerificationStage<T extends PlacementStep & { stepData?: RegFormSchema[number] }>(steps: T[]) {
  const uploadIndex = steps.findIndex(s => s.type === 'documents' || s.stepData?.rows.some(r => r.columns.some(c =>
    c.field && (['file', 'signature'].includes(c.field.type) || /signature/i.test(c.field.fieldName)),
  )));
  if (uploadIndex < 0) return steps;
  const emailIndex = steps.findIndex(s => s.stepData?.rows.some(r => r.columns.some(c => isPrimaryEmailField(c.field))));
  // If the email and upload share a section, that section renders an inline recovery block.
  if (emailIndex < 0 || emailIndex >= uploadIndex) return steps;
  return [...steps.slice(0, uploadIndex), { id: UPLOAD_VERIFICATION_STAGE, type: 'verification', label: 'Email Verification' }, ...steps.slice(uploadIndex)];
}

export interface PlacementValidationResult {
  ok: boolean;
  message?: string;
}

export const EMAIL_VERIFICATION_TOO_EARLY_MESSAGE =
  'Email verification cannot occur before the primary email address is collected. Select the email step or a later step.';

/**
 * Blocks configurations where verification would be requested before the
 * applicant has had a chance to enter their email address. Placement on the
 * same step as the email field is valid.
 */
export function validateEmailVerificationPlacement(
  placement: string | null | undefined,
  schema?: RegFormSchema | null,
): PlacementValidationResult {
  const value = (placement || '').trim();
  if (!value || value === BEFORE_SUBMISSION_PLACEMENT) return { ok: true };

  const emailStepIndex = findPrimaryEmailStepIndex(schema);
  if (emailStepIndex < 0) return { ok: true };

  const selectedIndex = (schema || []).findIndex(step => step.id === value);
  // Placement on a post-schema stage (documents / declarations) is always after
  // the schema steps, so it is valid.
  if (selectedIndex < 0) return { ok: true };

  if (selectedIndex < emailStepIndex) {
    return { ok: false, message: EMAIL_VERIFICATION_TOO_EARLY_MESSAGE };
  }
  return { ok: true };
}
