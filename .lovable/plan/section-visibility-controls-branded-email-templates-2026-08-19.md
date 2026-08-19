# Section Visibility Controls + Branded Email Templates

Two independent workstreams. Nothing in existing business logic (recipients, triggers, statuses, fees, OTP/CAPTCHA rules) changes.

## Part A — Section / Step Visibility

### Data model (backward compatible)
- `FormSection.isVisible?: boolean` (main builder) and `RegStep.isVisible?: boolean` (registration builder).
- Semantics everywhere: `isVisible !== false` means visible. No migration needed — schemas are stored as JSON, so all existing forms stay visible.
- Field `required` flags are never rewritten. Visibility is applied at runtime only.

### Shared resolver
New `src/lib/sectionVisibility.ts`:
- `isSectionConfiguredVisible(section)` → `section.isVisible !== false`
- `isSectionEffectivelyVisible(section, formData, allFields)` → configured visible **and** existing conditional-logic result.
- Registration equivalent for `RegStep`.

### Main form builder
- `SectionManager` / `FormBuilder`: add a "Visible to applicant" switch in section settings with helper text. Hidden sections stay editable in the builder but get a muted card, `Hidden` badge and eye-off icon.
- `FormRenderer`: `visibleSections` already filters on conditional logic — the configured flag is folded into that single memo, so tabs, step navigation, grouped forms, subforms and progress all follow automatically.
- Validation: the existing per-section validation loop is switched to iterate effective-visible sections only, so required/min/max/pattern/file/table rules of hidden sections are skipped.
- Completion / progress / "all forms completed" / submit gating: computed from effective-visible sections.
- `ApplicationReviewBuilder`: hidden sections are omitted (no empty block, no Edit action). Stored answers are never cleared.

### Registration builder + runtime
- `StepEditor`: "Show this step to applicant" switch; hidden steps get a `Hidden` badge in the step list and stay editable.
- `PreLicenseeRegistration`: hidden schema steps are filtered out where the step list is built, so the stepper renumbers with no gaps and hidden steps are unreachable. Dynamic step validation, email-uniqueness, password/confirm and file checks never run for hidden steps.
- Guards in the builder (save-time validation, mirroring the existing email-verification placement validation):
  - Hiding the step configured for email verification prompts a confirmation and, if accepted, resets `email_verification_step_id` to `before_submission`. OTP is never silently disabled.
  - Hiding a step containing primary email / password / confirm-password is blocked with a clear message unless another visible step supplies them.
- System stages (CAPTCHA, Documents, Declarations, Review) keep their existing dedicated toggles; no duplicate visibility mechanism is added for them.

### Server side
- Submission validation in `verify-and-submit` (and the registration submission path) reads the same `isVisible !== false` semantics from the pinned schema version so a hidden section's blank required field can never reject a submission.
- Version pinning is untouched: visibility travels inside the versioned schema, so applications pinned to an older version keep that version's behaviour.

### Preview
Both builders' applicant previews omit hidden sections/steps; the builder canvas keeps them with the `Hidden` badge.

## Part B — Professional Branded Emails

### Inventory first
Every email-producing path is catalogued before edits (DB templates, notification dispatch, and the Edge Functions that build HTML directly — e.g. `send-registration-otp`, `send-notification`, `dispatch-notification-event`, `application-acknowledgement`, `perform-*-workflow-action`, `approve-pre-licensee`, `create-web-user`, `dispatch-license-certificate`, `license-expiry-reminders`, `send-correspondence`, payment/invoice paths, retry/digest workers). The final report lists each with: template/event, function, uses shared layout, updated, verified.

### Shared layout
`supabase/functions/_shared/email-layout.ts` is extended rather than replaced:
- 600px table-based, inline-CSS, Outlook-safe shell.
- Branding resolved from existing site settings (app/regulator name, `logo_url`, primary colour, support email, portal URL, footer text). Absolute HTTPS logo only; otherwise a text word-mark fallback — never a broken image.
- New building blocks: professional header, detail table ("Application Number / Type / Applicant / Status / Submitted On"), text+colour status badge card, "What happens next" block, CTA button with explicit labels, consistent footer with support line and copyright.
- A plain-text renderer is produced alongside HTML where the sender accepts both; where the provider is HTML-only this is documented instead of forced.
- All dynamic values stay HTML-escaped; unresolved `{{token}}` stripping keeps working but logs when it fires.

### Content upgrades
Rewritten copy for: OTP (why, code, expiry, do-not-share), registration submitted, account created/approved, application submitted, returned for correction, approved, rejected, payment due/paid/offline submitted/approved/rejected, invoice, licence/certificate issuance, renewal/expiry with real dates, and internal officer notifications (distinct, operational tone with stage and SLA). Only variables that exist in each sending context are used.

### Admin template management
The template editor keeps Subject / Heading / Body / CTA / variables and previews the branded final email; the shared header/footer is not exposed as editable raw HTML. Any default-template migration is written so admin-customised records are not overwritten.

## Tests & verification
- Vitest: visibility resolver truth table (undefined/true/false, static vs conditional interaction, re-enable restores required), renderer omits hidden sections, validation skips them, completion succeeds with a blank hidden required section, review excludes hidden sections, registration stepper filtering, critical-step/OTP-step guard behaviour.
- Vitest: shared email rendering — logo present vs text fallback, header/footer/CTA/support email, escaping, unresolved-token handling, 600px structure.
- Build + typecheck + lint + existing suite run before reporting; browser run of the builder→applicant hide/unhide loop and rendered samples of the representative emails. Anything not verifiable is disclosed explicitly as **Implemented but not fully verified**.

## Technical notes
- New files: `src/lib/sectionVisibility.ts`, email block helpers in `_shared/`, test files.
- Edited: `src/types/formBuilder.ts`, `src/types/registrationForm.ts`, `SectionManager.tsx`, `FormBuilder.tsx`, `FormRenderer.tsx`, `ApplicationReviewBuilder.tsx`, `StepEditor.tsx`, `RegistrationFormBuilder.tsx`, `RegistrationStepRenderer.tsx`, `PreLicenseeRegistration.tsx`, `FullRegistrationPreview.tsx`, `_shared/email-layout.ts` plus the email-sending Edge Functions.
- Migrations: none required for visibility. Email default-template refresh only if needed, guarded against overwriting customised rows.
