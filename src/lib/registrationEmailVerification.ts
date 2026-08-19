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
}: ShouldRenderArgs): boolean {
  if (!requireOtp || updateMode) return false;
  if (placement === BEFORE_SUBMISSION_PLACEMENT) {
    // Legacy placement lives in the final declarations stage.
    return stepType === 'declarations' || stepId === 'declarations';
  }
  return stepId === placement;
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
