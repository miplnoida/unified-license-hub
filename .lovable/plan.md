## Goal

Fix the only registration stepper issue still present in the codebase: the desktop `DynamicRegistrationStepper` crowds and wraps badly when the registration form has many sections (e.g. the new 14-step Pre-Licensee schema). Keep everything else untouched.

## Investigation findings (so the scope stays small)

Most "bugs" in the brief are no longer present in the code:

- The public `/register` flow (`src/pages/registration/PreLicenseeRegistration.tsx`) already renders the registration schema directly with `RegistrationStepRenderer` step-by-step. It does NOT pipe registration steps through the generic `FormRenderer` — so row/column spans, `dataSource`, `dependsOn`, repeatables, display-only types, and master-data config are all preserved.
- Both the admin preview (`FullRegistrationPreview` → `FormPreview`) and the frontend already use the same `DynamicRegistrationStepper` + `RegistrationStepRenderer` pair, so they stay consistent automatically.
- `RegistrationFormFill.tsx` + `schemaToSections` in `useRegistrationConfig.ts` exist but are only used for legacy `form_templates` / `forms` rows reached from `/registration/portal`, not for `registration_form_configs`. They do not run on `/register`, so they are not corrupting the registration schema.
- Save draft, submit, review acknowledgement, OTP, CAPTCHA, declarations, document uploads, applicant-name / primary-email uniqueness, sector→sub-sector→category cascading, `sessionStorage` step persistence, and update-mode hydration are all already wired correctly in `PreLicenseeRegistration.tsx`.

That leaves one real, visible issue: the desktop stepper.

## The actual fix

File: `src/components/registration/DynamicRegistrationStepper.tsx`

Replace the current `flex justify-between` desktop layout (which stretches every step across the full width and wraps awkwardly past ~6 labels) with a compact, horizontally scrollable rail:

- Desktop (`md+`):
  - One horizontally scrollable row (`overflow-x-auto`, hidden scrollbar) inside a bordered container.
  - Each step renders as a fixed-width pill (`min-w-[140px] max-w-[180px]`) containing the numbered/checked circle and a single-line truncated label with a native `title` tooltip.
  - Thin connector line between pills, colored based on completion.
  - Active step gets ring + primary background, completed steps get filled check, future steps stay muted.
  - Completed steps and steps before `currentStep` remain clickable when `onStepClick` is provided (unchanged behavior).
  - On step change, scroll the active pill into view (`scrollIntoView({ inline: 'center', block: 'nearest' })`) so users always see context around the current step.
  - Add a small "Step X of Y" summary above the rail so users know the total even when scrolling.

- Mobile (`<md`): keep the existing compact "Step X of Y" + progress-bar layout exactly as-is.

No prop changes — same `steps`, `currentStep`, `completedSteps`, `onStepClick` signature, so all current callers (`PreLicenseeRegistration`, `FormPreview`, `FullRegistrationPreview`) get the improvement for free with zero call-site edits.

## Out of scope (explicitly not touching)

- `RegistrationStepRenderer.tsx`, `PreLicenseeRegistration.tsx`, `useRegistrationConfig.ts`, `RegistrationFormFill.tsx`, `FormRenderer.tsx`, `ReviewAcknowledgement`, registration types, registration builder editor, database schema, edge functions, validation, save-draft / submit / resubmit flows, OTP/CAPTCHA, document uploads, declarations, application/return/workflow forms.

## Verification

- `tsgo` typecheck passes.
- `/register` with the 14-section schema shows a single-line scrollable stepper; active pill auto-scrolls into view; completed pills are clickable and jump back; required validation still blocks Next/Submit; Save Draft still merges without wiping; Submit still opens Review Acknowledgement and only finalizes after acknowledgement.
- `/admin/registration-forms/preview` shows the same stepper styling.
- Mobile viewport still shows the existing "Step X of Y" progress bar.
- Existing generic forms (applications, returns, workflows) are unaffected because none of them import `DynamicRegistrationStepper`.
