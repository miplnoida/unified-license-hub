# Fix the blank Declarations step when CAPTCHA is off

## What is actually happening (verified)

The active config "Standard Registration (v2)" has:

- `require_captcha = false` (you turned it off), `declarations_section_visible = false`, `require_otp = true`, `email_verification_step_id = 'step-ppoc'`.

The registration runtime decides whether to show the Declarations step with:

```text
otpOnDeclarations = require_otp && otp_visible
```

That flag ignores **where** the OTP actually lives. Because OTP is required (but placed on the PPOC step, and rendered in its own "Email Verification" stage), the Declarations step is still forced into the stepper even though:

- the declarations section is hidden,
- CAPTCHA is off, so the CAPTCHA block renders nothing,
- OTP is not on that step.

Result: Step 4 of 5 with nothing but Previous/Next — exactly the screenshot. The page refresh isn't the cause; the stored step index just drops you back on that same empty step.

## The fix

1. Make the Declarations-step decision placement-aware: OTP only keeps the step alive when the resolved placement is that step (legacy `before_submission` / unknown or deleted step id), not merely because OTP is required elsewhere.
2. Keep the existing rule that a live, globally enabled, visible CAPTCHA on that step keeps it alive.
3. With both false and the section hidden, the Declarations step is dropped: the stepper becomes 4 steps (Applicant & Address, Principal Point of Contact, Email Verification, Review & Submit) and numbering renumbers correctly.
4. Safety net so a stale saved step index can never leave the applicant on a non-existent step: clamp the persisted step to the derived step count.
5. Additional guard in the Declarations step itself: if it has no visible declarations and no verification control to render, it renders nothing — so no future config combination can produce an empty page body.

## Technical notes

- `src/lib/registrationItemVisibility.ts` — `isDeclarationsStepVisible` keeps its signature; callers stop passing a placement-blind `otpOnDeclarations`.
- `src/pages/registration/PreLicenseeRegistration.tsx` — compute `otpOnDeclarations` from `config.emailVerificationStepId`: true only when it is null, `before_submission`, `declarations`, or an id that no longer exists in the visible schema. Clamp `currentStep` to `steps.length - 1` when the derived list shrinks.
- `src/components/registration-builder/FullRegistrationPreview.tsx` — mirror the same computation so the admin preview matches runtime (`RegistrationFormPreviewPage` just passes data through).
- `src/test/registrationSectionVisibility.test.ts` — add cases: hidden declarations + CAPTCHA off + OTP placed on another step ⇒ step dropped; OTP placement `before_submission` ⇒ step kept; CAPTCHA globally enabled and visible ⇒ step kept.

No database, edge function, or admin-save changes.

## Verification

Typecheck, the visibility test suite, then a live `/register` pass: confirm the stepper shows 4 steps with no blank Declarations step, refresh mid-flow keeps you on a valid step with the email still verified, then re-enable CAPTCHA and confirm the Declarations step returns with the CAPTCHA block.
