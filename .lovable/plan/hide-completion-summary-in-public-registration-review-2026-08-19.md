# Hide completion summary in public registration review

## Goal
Remove the "COMPLETION 100%" progress block and the per-section "X / Y complete" counters from the applicant-facing registration review page, while keeping them visible in other review contexts (e.g. license applications).

## Current state
- `src/components/applications/ReviewAcknowledgement.tsx` always renders:
  1. A header progress block with `Completion {completion}%`, a progress bar, and `{sections.length} sections / {totalFilled} of {totalFields} fields captured`.
  2. A per-section badge showing `{filled}/{total} complete` or `{filled}/{total} completed`.
- This component is reused in `PreLicenseeRegistration.tsx` (public pre-licensee registration) and `RegistrationFormFill.tsx` (registration form review), which are the contexts the user wants cleaned up.

## Changes
1. **Add an optional prop to `ReviewAcknowledgement.tsx`**
   - `showCompletionSummary?: boolean` (default `true`).
   - When `false`, hide:
     - The entire header `Completion` block (percentage, progress bar, sections/fields counts).
     - The per-section `{filled}/{total} complete` badge inside each `AccordionTrigger`.
   - Keep all other UI: section numbering, edit icon, field grid, declaration checkbox, and submit button.

2. **Opt out in registration public pages**
   - In `src/pages/registration/PreLicenseeRegistration.tsx`, pass `showCompletionSummary={false}` to the review-step `ReviewAcknowledgement`.
   - In `src/pages/registration/RegistrationFormFill.tsx`, pass `showCompletionSummary={false}` to its `ReviewAcknowledgement`.

3. **Leave other consumers unchanged**
   - `ApplicationReviewBuilder.tsx` and any other callers keep the default `true`, so license-application review still shows the completion summary.

4. **Verify**
   - Run the existing `reviewAcknowledgementDisplayOnly` tests and registration tests to ensure no regressions.
   - Optionally add a small test asserting the completion block is absent when `showCompletionSummary={false}`.

## Technical details
- File edits:
  - `src/components/applications/ReviewAcknowledgement.tsx`
  - `src/pages/registration/PreLicenseeRegistration.tsx`
  - `src/pages/registration/RegistrationFormFill.tsx`
- No backend, schema, or workflow changes required.
