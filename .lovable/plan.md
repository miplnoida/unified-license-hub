# Configurable Email Verification Placement in Registration

## Current state (verified)

- The OTP UI lives inside `DeclarationsStep` (`OtpVerificationSection`), rendered only when `requireOtp && !updateMode`. Because the Declarations step is always appended second-to-last in the step list built in `PreLicenseeRegistration`, verification always appears near the end.
- Step list is built from `config.formSchema` (each dynamic step keeps its own stable `id`), plus appended `documents`, `declarations`, and optional `review` steps.
- `registration_form_configs` has `require_otp` but no column for placement.
- Server-side enforcement already exists: `register-pre-licensee` checks `otp_verifications` for a verified record for the resolved email — this stays untouched.
- Email resolution already centralized in `resolveRegistrationEmail` / `primaryEmailValidation`.

## What will be built

### 1. Database
- Add nullable `email_verification_step_id text` to `registration_form_configs`. No new table. NULL means legacy behavior (`before_submission`), so deployed configs behave exactly as today.

### 2. Shared placement resolver (new file `src/lib/registrationEmailVerification.ts`)
- `BEFORE_SUBMISSION = 'before_submission'`
- `resolveEmailVerificationPlacement(config, steps)` — normalizes NULL / unknown / dangling step IDs to `before_submission`.
- `shouldRenderEmailVerification({ stepId, stepType, config, updateMode })` — single source of truth used by runtime, declarations step, and builder preview.
- `findPrimaryEmailStepIndex(formSchema)` — uses the existing `isPrimaryEmailField` logic to locate the step collecting the primary email (for admin validation).

### 3. Reusable component
- New `src/components/registration/EmailVerificationSection.tsx`: the existing OTP block moved out of `DeclarationsStep` verbatim (send, 6-digit entry, verify, cooldown, server verification lookup, email-change reset, verified state). No logic rewrite, no duplication.
- `DeclarationsStep` renders it only when the resolver says the placement is `before_submission`; otherwise Declarations shows declarations + CAPTCHA only. CAPTCHA behavior unchanged.

### 4. Runtime (`PreLicenseeRegistration`)
- Render `EmailVerificationSection` under the configured dynamic/static step content when the resolver matches, after the step's fields.
- Extend `validateCurrentStep`: when the current step is the verification step and OTP is required (and not update mode), block `Next` with "Please verify your email address before continuing." Also keep the existing declarations-level check so a later placement can't be skipped, and keep the review/submit path gated.
- Verification state continues to use the existing `emailVerified` form state (session-persisted) plus the server `checkOnly` lookup on mount, so back/forward navigation and refresh restore the verified badge without resending OTP. Changing the email still resets `emailVerified`.
- Update mode continues to skip OTP exactly as today.

### 5. Config hook
- `useRegistrationConfig` maps `email_verification_step_id` → `emailVerificationStepId: string | null` on `RegistrationConfig`.

### 6. Admin builder (`RegistrationFormBuilder`)
- Under the existing "Email OTP Verification" switch, when it is ON show a "Verify Email At" select populated from `form_schema` step titles (value = step id), plus `Supporting Documents`, `Declarations`, and `Before Final Submission`. Stored value is the step ID (or the reserved token).
- Save validation: block with "Email verification cannot occur before the primary email address is collected. Select the email step or a later step." when the chosen step precedes the primary-email step. Same step is allowed.
- Step deletion in `RegistrationFormBuilderEditor`: if the deleted step is the selected verification step, prompt (SweetAlert2, matching project convention) to pick another step or reset placement to Before Final Submission; never silently disable OTP.
- Reorder/rename are unaffected since placement is by ID.
- Persist the new field in the create/update payload and include it in the preview payload so the builder preview shows verification at the configured position using the same resolver.

### 7. Tests
- Unit tests for the resolver: placement at a chosen step, NULL → before-submission, unknown/deleted ID → before-submission, OTP disabled → never render, reorder keeps placement, and the primary-email-step ordering validation.

## Verification I will run
- Build + typecheck + lint, the new/existing vitest suites.
- Live preview walkthrough: verification at an early step (blocked Next until verified, not repeated on Declarations), at Before Final Submission, OTP disabled, email-change reset, plus CAPTCHA/review/documents regression. Anything I cannot verify will be reported explicitly as unverified.
