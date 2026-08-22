# Email Field Configuration + Section Visibility Convergence

Two related changes across the shared form engine and the registration builder, delivered without altering stored data, workflows or existing field behaviour.

## Scope decisions (from your answers)

- Uniqueness is checked against user/account emails (existing registrations, profiles, login accounts) — reusing the current primary-email check.
- Email verification reuses the existing registration OTP send/verify functions for every builder, distinguished by a purpose tag. No second verification architecture.
- Visibility stays at section/step level only. No new per-field visibility toggle.
- On internal (regulator-facing) forms the visibility flag governs applicant-facing rendering only; internal staff continue to see everything.

## 1. Email field settings in every builder

Add two independent settings, shown only when Field Type = Email, in both the shared Form Builder field properties (used by pre-licensee, post-licensee, returns and internal forms) and the Registration Form Builder field editor:

- **Email Verification Required** — Yes / No switch. Default No.
- **Uniqueness Check** — Yes / No switch. Default No.

Both are optional flags stored on the field's existing validation object, so forms saved before this change carry neither flag and behave exactly as today — no form suddenly starts demanding verification or uniqueness.

Runtime behaviour when Verification = Yes and the field is applicable:

- A **Verify Email** button appears next to the field once the entered address is a valid email.
- States surfaced inline: Verify Email, code sent, code entry, Verified, failed/expired, Resend.
- Submission is blocked while the field is unverified.
- Changing the email after verification resets the verified state and requires verification again.

When Verification = No, no button, no OTP call, no submission block.

Runtime behaviour when Uniqueness = Yes: debounced check as the user types plus a re-check at submit, with a plain-language message when the address is already in use, and submission blocked. Edit/update mode excludes the record's own current email so it is never flagged against itself. When No, no check runs.

All four Yes/No combinations are handled independently; the two settings never gate each other.

## 2. "Visible to Applicant" standardisation and fixes

- Registration Form Builder step visibility currently uses a plain checkbox — replaced with the same switch/toggle used in Required Document Types.
- The shared Form Builder section manager already uses a switch; its label and placement are aligned so both builders read identically.
- Confirmed gap: the Registration Form Builder **preview** renders every step including hidden ones, while the live applicant form filters them. The preview will use the same filtering helper as the runtime, so preview and applicant behaviour match.
- Hidden steps/sections are excluded from render, the stepper/progress, validation, review and the submitted-application view — no empty containers, stray headings, "Not provided" rows or orphaned errors.
- Admins keep full access to hidden steps/sections in the builder.

## 3. Hidden content must not enforce mandatory rules

Effective, runtime-only rule — the admin's configured Required value is never rewritten:

```text
Effective Required = Section/Step Visible AND Conditionally Visible AND Configured Required
```

- Fields inside a hidden section are skipped by required validation, carry no runtime required attribute and show no asterisk.
- Hidden required fields cannot block Next/Continue, Save Draft, Review, Submit, Edit/Resubmit, returns submission or internal form submission.
- Turning a section back to Visible immediately restores every configured mandatory rule and validation with no admin rework.
- Conditionally hidden fields follow the same rule: not required while inapplicable, required again the moment they become visible.
- A hidden email field with Verification = Yes or Uniqueness = Yes triggers neither check; both resume when the section becomes visible again.
- Review/Acknowledgement excludes hidden sections and their fields entirely.

Server-side: submission validation is extended to apply the same effective-required rule using the stored section visibility flag, so a hidden mandatory field can never be rejected at the backend either.

## Technical notes

- Shared engine: `src/lib/sectionVisibility.ts` gains the effective-required helper; `FormRenderer` uses it for validation, asterisks and required attributes. `src/lib/registrationItemVisibility.ts` already carries the equivalent item-level rule and is reused rather than duplicated.
- Registration: `RegStep.isVisible` and `FormSection.isVisible` remain the storage; `section_is_visible` on `form_fields` continues to carry it for normalised forms. No schema/data migration for visibility.
- Email settings live on `RegFieldValidation` / `ValidationRules` as optional booleans, persisted in the existing field payloads (normalised columns plus JSONB fallback), so nothing existing is rewritten.
- Verification reuses `send-registration-otp` / `verify-registration-otp` and the existing verified-email persistence helpers, so a refresh or re-login keeps a verified address verified. Uniqueness reuses the existing `check_primary_user_email_exists` RPC (server-enforced) via the current hook.
- Builder edits are additive to `FieldProperties.tsx`, `FieldEditor.tsx`, `SectionManager.tsx`, `StepEditor.tsx` and the registration preview; no field type, layout, versioning, upload or workflow code changes.

## Verification before reporting completion

Automated tests for the effective-required matrix (section visible/hidden x configured required, conditional visibility, hidden email with verification/uniqueness on), plus the existing visibility and primary-email suites kept green.

Browser passes: registration builder configure/save/reload/preview; applicant registration with each of the four email combinations, verify success, wrong code, resend, email changed after verification, duplicate email, edit mode with own email; section hidden and re-shown with mandatory fields; draft save and resume; review page; final submit; and a pre-licensee, post-licensee, returns and internal form each rendered through the shared engine with a hidden mandatory section.

I will report exactly which combinations and which builders were exercised through the UI, and name anything left unverified plus its regression risk — no blanket "completed" claim.
