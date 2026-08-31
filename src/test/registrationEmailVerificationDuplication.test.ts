import { describe, it, expect } from 'vitest';
import {
  BEFORE_SUBMISSION_PLACEMENT,
  resolveEmailVerificationPlacement,
  shouldRenderEmailVerification,
  verificationStageId,
  withVerificationStage,
} from '@/lib/registrationEmailVerification';
import { resolveEmailFieldSettings } from '@/lib/emailFieldConfig';

const steps = [
  { id: 'step-ppoc', type: 'dynamic' },
  { id: 'step-address', type: 'dynamic' },
  { id: 'documents', type: 'documents' },
  { id: 'declarations', type: 'declarations' },
];

/** Mirrors RegistrationStepRenderer's suppression rule. */
function runtimeEmailSettings(
  validation: { requireEmailVerification?: boolean; uniqueEmail?: boolean } | null,
  suppressEmailVerification: boolean,
) {
  const configured = resolveEmailFieldSettings({ type: 'email', validation });
  return suppressEmailVerification
    ? { ...configured, requireVerification: false }
    : configured;
}

describe('registration email verification — no duplicate OTP', () => {
  it('configured placement step does not itself render OTP (Scenario A/B)', () => {
    const placement = resolveEmailVerificationPlacement('step-ppoc', steps);
    expect(placement).toBe('step-ppoc');
    expect(shouldRenderEmailVerification({
      stepId: 'step-ppoc', stepType: 'dynamic', placement, requireOtp: true,
    })).toBe(false);
  });

  it('generated verification stage renders OTP exactly once', () => {
    const placement = 'step-ppoc';
    const generated = withVerificationStage(steps, placement, { requireOtp: true });
    const rendering = generated.filter(s => shouldRenderEmailVerification({
      stepId: s.id, stepType: s.type, placement, requireOtp: true,
    }));
    expect(generated.map(s => s.id)).toContain(verificationStageId(placement));
    expect(rendering).toHaveLength(1);
    expect(rendering[0].id).toBe(verificationStageId(placement));
  });

  it('legacy before_submission renders exactly once, with no extra stage (Scenario C)', () => {
    const placement = resolveEmailVerificationPlacement(null, steps);
    expect(placement).toBe(BEFORE_SUBMISSION_PLACEMENT);
    const generated = withVerificationStage(steps, placement, { requireOtp: true });
    expect(generated).toHaveLength(steps.length);
    const rendering = generated.filter(s => shouldRenderEmailVerification({
      stepId: s.id, stepType: s.type, placement, requireOtp: true,
    }));
    expect(rendering.map(s => s.id)).toEqual(['declarations']);
  });

  it('form-level OTP suppresses field-level verification but keeps uniqueness (Scenario E)', () => {
    const s = runtimeEmailSettings({ requireEmailVerification: true, uniqueEmail: true }, true);
    expect(s.requireVerification).toBe(false);
    expect(s.requireUniqueness).toBe(true);
  });

  it('field-level verification still works when form-level OTP is off (Scenario D)', () => {
    const s = runtimeEmailSettings({ requireEmailVerification: true, uniqueEmail: false }, false);
    expect(s.requireVerification).toBe(true);
    expect(shouldRenderEmailVerification({
      stepId: 'step-ppoc', stepType: 'dynamic', placement: 'step-ppoc', requireOtp: false,
    })).toBe(false);
  });

  it('update mode adds no verification stage and renders no OTP (Scenario G)', () => {
    expect(withVerificationStage(steps, 'step-ppoc', { requireOtp: true, updateMode: true }))
      .toHaveLength(steps.length);
    expect(shouldRenderEmailVerification({
      stepId: verificationStageId('step-ppoc'), placement: 'step-ppoc', requireOtp: true, updateMode: true,
    })).toBe(false);
  });

  it('hidden/disabled OTP adds no stage and no enforcement (Scenario F)', () => {
    expect(withVerificationStage(steps, 'step-ppoc', { requireOtp: false })).toHaveLength(steps.length);
    expect(shouldRenderEmailVerification({
      stepId: verificationStageId('step-ppoc'), placement: 'step-ppoc', requireOtp: false,
    })).toBe(false);
  });

  it('builder preview keeps rendering on the placement step (preview-only semantics)', () => {
    expect(shouldRenderEmailVerification({
      stepId: 'step-ppoc', stepType: 'dynamic', placement: 'step-ppoc', requireOtp: true, previewMode: true,
    })).toBe(true);
    // Preview semantics must never leak into the applicant runtime.
    expect(shouldRenderEmailVerification({
      stepId: 'step-ppoc', stepType: 'dynamic', placement: 'step-ppoc', requireOtp: true,
    })).toBe(false);
  });

  it('truth table: exactly one owner per configuration', () => {
    const cases: Array<[string, string, boolean, boolean]> = [
      // stepId, placement, requireOtp, expected
      ['step-ppoc', 'step-ppoc', true, false],
      [verificationStageId('step-ppoc'), 'step-ppoc', true, true],
      ['step-address', 'step-ppoc', true, false],
      ['declarations', 'step-ppoc', true, false],
      ['declarations', BEFORE_SUBMISSION_PLACEMENT, true, true],
      ['step-ppoc', BEFORE_SUBMISSION_PLACEMENT, true, false],
      [verificationStageId('step-ppoc'), 'step-ppoc', false, false],
    ];
    for (const [stepId, placement, requireOtp, expected] of cases) {
      expect(shouldRenderEmailVerification({
        stepId, stepType: stepId === 'declarations' ? 'declarations' : 'dynamic', placement, requireOtp,
      })).toBe(expected);
    }
  });
});
