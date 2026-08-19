# Registration stepper forward navigation + Review edit icons

Two issues in the public pre-licensee registration flow.

## 1. Cannot click forward to steps already completed

Today the stepper only marks a step "completed" when the user presses Next on it. When someone goes back from the last step (Review & Submit), that final step was never marked, so its pill is not clickable — the user can only move forward with the Next button.

Fix: track the furthest step the user has reached and let the stepper treat every step up to that point as navigable.

- Keep `completedSteps` for the check-mark visuals.
- Add a `maxVisitedStep` value in `PreLicenseeRegistration.tsx`, updated whenever `currentStep` advances, and reset with the rest of the form state.
- Pass it to `DynamicRegistrationStepper` so a pill is clickable when its index is at or below the furthest reached step (and it is not the current step).
- Clicking forward jumps directly, exactly like the Previous/Next buttons already do; no extra validation gate is added, and forward jumps beyond the furthest reached step stay blocked.

## 2. Review & Submit shows no Edit button

`ReviewAcknowledgement` only renders the "Edit Section" button when its `mode` prop is `editable`. The registration page passes the admin review-mode setting, which defaults to `readonly`, so applicants never see it — even though the page already implements the `onEdit` jump handler.

Fix: on the public registration review step, always render in editable mode (the applicant is still pre-submission), and present the control as an edit icon button per section that jumps to that section's step for editing.

- Pass `mode="editable"` for the registration review step in `PreLicenseeRegistration.tsx`.
- In `ReviewAcknowledgement.tsx`, keep the existing behaviour but render the per-section control as a compact pencil/edit icon button with an accessible label ("Edit <section title>") so it reads as an icon action.
- The existing `onEdit` mapping (review section index -> live step index) is reused unchanged, so clicking the icon lands the user on the right step with their data intact.

## Technical notes

Files touched:
- `src/pages/registration/PreLicenseeRegistration.tsx` — furthest-step tracking, stepper click rule, `mode="editable"` for the review step.
- `src/components/registration/DynamicRegistrationStepper.tsx` — accept the furthest-reached index and use it for clickability (desktop pills).
- `src/components/applications/ReviewAcknowledgement.tsx` — icon-style edit control with `aria-label`.

No database, RLS, or edge-function changes. Admin review-mode settings elsewhere (application review) keep their current behaviour.
