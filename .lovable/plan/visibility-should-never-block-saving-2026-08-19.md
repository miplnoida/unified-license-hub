# Visibility Should Never Block Saving

The error in the screenshot comes from a save gate that refuses to hide a section when something inside it is marked required. That contradicts the agreed rule: visibility wins, and anything hidden simply becomes non-mandatory.

## New behaviour

- Hiding the Declarations section or the Required Document Types section is always allowed. No error toast, no blocked save.
- Hidden items are treated as non-mandatory everywhere: the step is skipped, nothing inside it is validated, nothing appears in Review or in progress counts.
- If the Declarations section is hidden while a visible OTP or CAPTCHA is placed on that step, the step is still shown to applicants but renders only those verification controls (no declaration checkboxes). Verification itself is never bypassed.
- Hiding the Documents section while "Document Upload Step" is on no longer errors: the section flag wins and the whole step is skipped for applicants.
- The only remaining hard rule stays: a verification control that is required cannot be individually hidden (unreachable through the current UI, kept as a legacy safety net).

## Technical approach

**`src/lib/registrationItemVisibility.ts`**
- Remove the two section-level blocks from `validateSecurityVisibility` (documents-required-but-hidden and declarations-hidden-with-verification) along with their message constants, keeping the OTP/CAPTCHA individual-visibility checks.
- `isDocumentsStepVisible`: section flag `false` already returns `false` — unchanged, and now no longer contradicted by a save gate.
- `isDeclarationsStepVisible`: keeps returning `true` when a visible OTP/CAPTCHA sits on the step, so those controls still render.

**`src/pages/admin/RegistrationFormBuilder.tsx`**
- Keep the `validateSecurityVisibility` call (now only guarding legacy required+hidden verification), so the toast in the screenshot can no longer fire.
- Remove any inline helper text that claims a section cannot be hidden.

**Runtime hardening (no runtime errors)**
- `src/pages/registration/PreLicenseeRegistration.tsx`: guard step derivation and navigation so an empty/dropped step can never leave `currentStep` out of range (clamp the index when the derived step list shrinks), and ensure declaration/document validation iterates only effective-visible items.
- `src/components/registration/DeclarationsStep.tsx`: render only verification controls when no visible declarations remain; render nothing if the step has neither.
- `src/components/registration/DocumentsStep.tsx`: already defensive for an empty type list — verify it returns null rather than an empty control.
- Preview components (`FullRegistrationPreview.tsx`, `RegistrationFormPreviewPage.tsx`) mirror the same derivation.

**Server** (`supabase/functions/register-pre-licensee/index.ts`)
- Required-document and declaration enforcement skips hidden sections/items, so a hidden-but-required item can never reject a submission.

**Tests** (`src/test/registrationSectionVisibility.test.ts`)
- Replace the two "blocks saving" cases with assertions that hiding a required documents section and hiding declarations with a required CAPTCHA both pass validation, and that the resulting step lists behave as described.

## Verification

Typecheck, lint, the visibility test suite, then a browser pass: hide the Declarations section with CAPTCHA on, save (must succeed), hide the Documents section with "Document Upload Step" on, save, then run `/register` end to end confirming skipped steps, correct stepper numbering, successful submission and a clean console.
