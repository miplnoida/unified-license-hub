# Item-Level "Visible to Applicant" for Security, Documents & Declarations

Extends the section-visibility model already in place to three Registration Form Builder areas: Security & Verification, Required Document Types, Declaration Checkboxes. Same backward-compatible rule everywhere: `visible === undefined` or `true` means visible, only `false` hides.

## What admins get

**Security & Verification card** — each verification control gets its own pair of switches instead of a single toggle:

```text
Email OTP Verification    Required [ON]   Visible to applicant [ON]   Verify at [Primary User]
CAPTCHA Validation        Required [ON]   Visible to applicant [ON]
Document Upload Step      Enabled  [ON]
```

Save is blocked with an inline message when a verification is required but hidden:
- "Email verification is required for registration and cannot be hidden from applicants. Disable the requirement first or make it visible."
- "CAPTCHA is required and cannot be hidden from applicants. Disable CAPTCHA first or make it visible."

**Required Document Types** — every document row gains a `Visible to applicant` switch and a `Hidden` badge when off. Hidden rows stay fully editable in the builder; their `required` flag is preserved, never rewritten.

**Declaration Checkboxes** — same: per-declaration `Visible to applicant` switch plus `Hidden` badge, `required` preserved.

## What applicants get

- Hidden document types: no upload control, no required marker, no validation, excluded from review and from progress counts (3 required with 1 hidden and 2 uploaded reads as complete, not "2 of 3").
- Hidden declarations: not rendered, links not rendered, not validated, excluded from review.
- Hidden verification controls: not rendered and not gating navigation (only possible when not required, since the builder blocks required+hidden).
- Empty steps disappear: if every document type is hidden the Documents step is dropped from the stepper and numbering closes up. If every declaration is hidden **and** no CAPTCHA or OTP is placed on that step, the Declarations step is dropped too; if CAPTCHA or OTP remain, the step stays and shows only those.
- Already-uploaded files for a document type that later becomes hidden are not deleted, and previously stored declaration values are not overwritten with blanks.

## Technical approach

**Types** (`src/types/registrationForm.ts`, `src/hooks/useRegistrationConfig.ts`)
- `RegistrationDocType` and `RegistrationDeclaration` gain optional `visible?: boolean`.
- Security config gains explicit fields on `registration_form_configs`: `otp_visible_to_applicant`, `captcha_visible_to_applicant` (boolean, default `true`) via a migration — nullable/defaulted so existing rows keep working with no data migration.

**Shared helpers** (`src/lib/registrationItemVisibility.ts`, new)
- `isItemVisible(item)`, `visibleDocumentTypes(list)`, `visibleDeclarations(list)`, `isEffectiveRequired(item)` (`visible !== false && required === true`).
- `validateSecurityVisibility(config)` returns the builder-blocking messages above; used by both the builder save path and the edge function.
- Consumed by builder, runtime, preview, review, validation — no duplicated logic.

**Builder** (`src/pages/admin/RegistrationFormBuilder.tsx`)
- Add the visible switches, `Hidden` badges, and pre-save validation through `validateSecurityVisibility`. OTP placement selector stays as-is and is unaffected.

**Runtime** (`src/pages/registration/PreLicenseeRegistration.tsx`, `DocumentsStep.tsx`, `DeclarationsStep.tsx`, `CaptchaSection.tsx`, `EmailVerificationSection.tsx`)
- Derive `visibleDocs` / `visibleDecls` memos next to the existing `visibleSchema`.
- Step list builder: include `documents` only when `requireDocuments && visibleDocs.length > 0`; include `declarations` only when there is at least one visible declaration, a visible CAPTCHA, or OTP placed there.
- `validateCurrentStep`: documents and declarations checks iterate the effective-required lists only.
- Review section and progress/completion counters use the same filtered lists; hidden items never render "Not provided".

**Preview** (`FullRegistrationPreview.tsx`, `RegistrationFormPreviewPage.tsx`)
- Mirror applicant filtering, including omitting steps that become empty, while the builder/editor keeps showing hidden items with badges.

**Server-side** (`supabase/functions/register-pre-licensee/index.ts`)
- Load the matched `registration_form_configs` row and validate using the same effective rules: required documents are checked only when visible, `terms_accepted` / declaration enforcement respects visibility, and the OTP check runs only when OTP is required (today it is enforced unconditionally, which would reject a config with OTP disabled). CAPTCHA verification stays exactly as it is — visibility never bypasses server verification.

**Tests** (`src/lib/__tests__/registrationItemVisibility.test.ts`, plus runtime step-derivation tests)
- visible+required → shown/required; hidden+required → hidden/not required/not blocking.
- Same matrix for declarations.
- OTP required + hidden → validation error; CAPTCHA required + hidden → validation error.
- All documents hidden → Documents step omitted; all declarations hidden with no CAPTCHA/OTP → Declarations step omitted.

## Verification before reporting done

Typecheck, lint, and the test suite, then a live pass through `/register` in the browser covering: visible+hidden document mix, visible+hidden declaration mix, all-documents-hidden, all-declarations-hidden, OTP placement still landing on its configured step, CAPTCHA still rendering and verifying, and no console errors. Anything not verifiable will be reported explicitly as such.
