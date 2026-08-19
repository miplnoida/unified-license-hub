import { describe, it, expect } from 'vitest';
import { resolveRegistrationLoginEmail } from '@/lib/registrationEmail';
import {
  BEFORE_SUBMISSION_PLACEMENT,
  resolveEmailVerificationPlacement,
  shouldRenderEmailVerification,
  withVerificationStage,
  verificationStageId,
  isVerificationStageId,
} from '@/lib/registrationEmailVerification';
import type { RegFormSchema } from '@/types/registrationForm';

const field = (id: string, fieldName: string, type: string, label: string) =>
  ({ id, fieldName, type, label, required: false }) as any;

const schema: RegFormSchema = [
  {
    id: 'step-applicant',
    title: 'Applicant & Address',
    rows: [{ id: 'r1', columns: [{ span: 12, field: field('f1', 'applicant_email', 'email', 'Applicant Email (if available)') }] }],
  },
  {
    id: 'step-ppoc',
    title: 'Principal Point of Contact',
    rows: [
      { id: 'r2', columns: [{ span: 6, field: field('f2', 'email', 'email', 'Email Address') }] },
      { id: 'r3', columns: [{ span: 6, field: field('f3', 'password', 'password', 'Password') }] },
    ],
  },
] as any;

describe('resolveRegistrationLoginEmail', () => {
  it('prefers the email paired with the password over an earlier applicant email', () => {
    const value = resolveRegistrationLoginEmail('', {
      applicant_email: 'Applicant@Example.com',
      email: 'Login@Example.com',
    }, schema);
    expect(value).toBe('login@example.com');
  });

  it('does not fall back to an unrelated email when the login email is still empty', () => {
    const value = resolveRegistrationLoginEmail('', { applicant_email: 'applicant@example.com' }, schema);
    expect(value).toBe('');
  });

  it('falls back to legacy resolution when no credentials pair exists', () => {
    const legacy: RegFormSchema = [{
      id: 's1',
      title: 'Contact',
      rows: [{ id: 'r', columns: [{ span: 12, field: field('f', 'contact_email', 'email', 'Contact Email') }] }],
    }] as any;
    expect(resolveRegistrationLoginEmail('', { contact_email: 'a@b.com' }, legacy)).toBe('a@b.com');
    expect(resolveRegistrationLoginEmail('static@b.com', {}, null)).toBe('static@b.com');
  });
});

describe('withVerificationStage', () => {
  const steps = [
    { id: 'step-applicant', type: 'dynamic' },
    { id: 'step-ppoc', type: 'dynamic' },
    { id: 'declarations', type: 'declarations' },
  ];

  it('inserts the stage directly after the configured step', () => {
    const out = withVerificationStage(steps, 'step-ppoc', { requireOtp: true });
    expect(out.map(s => s.id)).toEqual([
      'step-applicant',
      'step-ppoc',
      verificationStageId('step-ppoc'),
      'declarations',
    ]);
    expect(isVerificationStageId(out[2].id)).toBe(true);
  });

  it('leaves the list untouched for legacy placement, disabled OTP or update mode', () => {
    expect(withVerificationStage(steps, BEFORE_SUBMISSION_PLACEMENT, { requireOtp: true })).toEqual(steps);
    expect(withVerificationStage(steps, 'step-ppoc', { requireOtp: false })).toEqual(steps);
    expect(withVerificationStage(steps, 'step-ppoc', { requireOtp: true, updateMode: true })).toEqual(steps);
  });

  it('resolves an unknown placement back to before-submission', () => {
    expect(resolveEmailVerificationPlacement('deleted-step', steps)).toBe(BEFORE_SUBMISSION_PLACEMENT);
  });

  it('renders verification on the generated stage, not on the email step itself', () => {
    const placement = resolveEmailVerificationPlacement('step-ppoc', steps);
    expect(shouldRenderEmailVerification({
      stepId: verificationStageId('step-ppoc'), stepType: 'verification', placement, requireOtp: true,
    })).toBe(true);
    expect(shouldRenderEmailVerification({
      stepId: 'declarations', stepType: 'declarations', placement, requireOtp: true,
    })).toBe(false);
  });
});
