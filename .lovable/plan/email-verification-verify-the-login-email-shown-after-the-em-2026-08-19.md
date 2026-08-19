# Email verification: verify the login email, shown after the email step

## Current state (verified)

Active config "Standard Registration (v2)":

- Step 1 `step-applicant-address` collects `applicant_email` — "Applicant Email (if available)", optional.
- Step 2 `step-ppoc` collects `email` — "Email Address", required, next to `password` / `confirm_password`. This is the account login email.
- `email_verification_step_id = 'step-ppoc'`, `require_otp = true`.

Runtime behaviour today:

- `resolveEmailVerificationPlacement` maps the config to step 2, and `PreLicenseeRegistration` appends the OTP block *inside* step 2, underneath the PPOC fields. So the "Send code" box is on screen before the applicant has typed their email — at that moment it shows "(no email provided)" and can be triggered against a half-typed or previously entered value.
- The email that gets verified comes from `resolveRegistrationEmail`, which picks candidates by a fixed key list (`email`, `contact_email`, `applicant_email`, …) rather than by which field is the login email. With this schema it happens to land on the PPOC `email`, but on any schema where step 1 uses a key earlier in that list, it would verify the wrong address — which is the behaviour reported.

## What will change

### 1. Resolve the login email explicitly

Introduce a login-email resolver used by the OTP block and by the submit payload:

1. The email field on the same step as the password field (the account credentials pair).
2. Otherwise the field flagged as primary email by the existing `isPrimaryEmailField` rules.
3. Otherwise today's `resolveRegistrationEmail` fallback (so older/static schemas keep working).

This guarantees the OTP is always sent to, and checked against, the email that becomes the login — never an incidental "Applicant Email" on an earlier step.

### 2. Show verification after Next, not alongside the email field

Keep the admin-configured placement (`email_verification_step_id`) as the source of truth — no hardcoding to step 2.

- The configured step keeps its own fields only.
- A verification stage is inserted into the step list immediately **after** the configured step, labelled "Email Verification" in the stepper.
- Pressing Next on the configured step validates that step (including the email field and its uniqueness check) and then lands the applicant on the verification stage with the resolved login email pre-filled and the code send button enabled.
- Next on the verification stage is blocked until the code is verified, with the existing message.
- If the applicant goes Back and edits the email, `emailVerified` resets exactly as today and the code must be requested again for the new address.
- Legacy placement (`before_submission` / NULL) is unchanged: the block stays inside the Declarations step.
- Update mode and a hidden OTP control continue to skip the stage entirely, so no empty step appears.

### 3. Keep server enforcement aligned

`register-pre-licensee` already requires a verified `otp_verifications` row for the submitted email. Because the submitted login email and the verified email now come from the same resolver, they cannot diverge. No edge function logic change beyond that guarantee.

## Technical notes

- `src/lib/registrationEmail.ts` — add `resolveRegistrationLoginEmail(staticEmail, dynamicData, schema)` implementing the credential-pair → primary-email → legacy priority.
- `src/lib/registrationEmailVerification.ts` — extend the step resolver so a placement on a non-declarations step yields a distinct `verification` stage id positioned after that step; `shouldRenderEmailVerification` matches that stage.
- `src/pages/registration/PreLicenseeRegistration.tsx` — build the extra stage in the `steps` memo, render `EmailVerificationSection` as the stage content, gate Next on `emailVerified`, and feed `verificationEmail` from the new login-email resolver (also used for the submit payload).
- `src/components/registration/EmailVerificationSection.tsx` — unchanged logic; it already keys OTP state by resolved email.
- Preview surfaces (`FullRegistrationPreview`, `RegistrationFormPreviewPage`) use the same resolver so the admin preview matches runtime.
- Tests: extend `src/test/` coverage for login-email resolution (credentials pair wins over an earlier `applicant_email`) and for stage placement (after the configured step, legacy fallback, OTP hidden/update mode → no stage).

## Verification

Build + typecheck, the registration test suites, and a live walk of `/register`: step 1 → step 2 (no OTP box visible) → Next → Email Verification stage showing the PPOC email → blocked Next until verified → back-edit the email resets verification → submit succeeds. Also re-check the legacy `before_submission` placement and OTP disabled.
