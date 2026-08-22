# Zero Visible Sections Must Not Fall Back to the Legacy Form

Today the applicant registration page decides which steps to show from the number of *visible* sections. When an admin hides every section, that count reaches zero and the page pushes the two hard-coded legacy steps (Entity Details, Primary User) — the same branch that exists for "no form configured". Those two states must be told apart.

## New behaviour

- Registration form configured and at least one section visible: unchanged — only visible sections render, in their configured order, with their configured validation, email verification, uniqueness checks, documents, declarations, CAPTCHA and review behaviour.
- Registration form configured but every section hidden: no form is rendered. The applicant sees a plain, non-technical unavailable screen:
  - Heading: "Registration Form Not Available"
  - Message: "The registration form is currently not available. Please try again later or contact the administrator for assistance."
  - Actions: "Back to Home" plus the existing "Refresh".
- No active registration configuration at all: the same unavailable screen (replacing today's "Registration is currently unavailable" wording so both states read identically to applicants).
- The update / resubmit flow behaves the same way — no legacy Entity Details / Primary User substitution there either.
- The Registration Form Builder preview mirrors the applicant view and shows the same unavailable state when all sections are hidden.
- Making a section visible again restores it and its configured mandatory rules automatically, because visibility filtering stays a pure read of the saved schema (nothing is rewritten on save).

## Technical approach

**`src/pages/registration/PreLicenseeRegistration.tsx`**
- Add `hasConfiguredSchema = (config?.formSchema?.length ?? 0) > 0`, derived from the raw saved schema, separate from `visibleSchema` (which stays purely the visibility filter).
- In `baseSteps`, drop the `else` branch that pushes the `entity` / `user` static steps. Dynamic steps come only from `visibleSchema`.
- Add a render guard before the form body: when `!config`, or when there are no visible sections and no other applicant-facing step (documents / declarations / verification), render the shared unavailable screen instead of the stepper and step content. Reuse the existing `LandingNav` layout.
- Clean up the now-dead static-step branches (`validateStep` mapping for `entity` / `user`, the `step.id === 'entity'` render arm, the `steps.some(s => s.type === 'static')` guard around `SectorSelectionSection`, and the static "Primary User" review section) without touching the dynamic paths.
- Clamp `currentStep` to the derived step list so a shrinking list can never leave the index out of range, and clear the persisted `sessionStorage` step when the derived list is empty — this is what makes hard refresh, re-login and a fresh session all land on the unavailable screen rather than a stale step.

**Legacy components kept**
- `src/components/registration/EntityDetailsStep.tsx` and `src/pages/registration/UserAccountStep.tsx` are not deleted or rewritten. `UserAccountStep` remains in use by the Route A / Route B public journeys; `EntityDetailsStep` simply loses its reference from this page. Nothing else in the repo imports the removed branch.

**Builder preview**
- `src/components/registration-builder/FullRegistrationPreview.tsx` and `FormPreview.tsx` already filter with `visibleRegSteps`; add the same unavailable state when the filtered list is empty so preview and runtime agree.

**Freshness**
- `useRegistrationConfig` already re-reads the active config on mount and on taxonomy change, and holds no cross-session cache, so an admin visibility change is picked up on the applicant's next load. No caching change needed.

**Hidden-field semantics (already in place, preserved)**
- `visibleRegSteps` / `isEffectiveRequired` keep hidden content out of validation, review, OTP and uniqueness checks. Stored `required` flags are never modified.

## Verification

Typecheck, lint and the registration visibility test suite, then a browser pass on the real applicant flow driving the admin builder for each state: 3 visible, 2 visible + 1 hidden, 1 visible, then all hidden (confirming no Entity Details and no Primary User appear and the unavailable screen shows), then re-enabling Section 1 and confirming it returns with its original mandatory fields while Section 2 stays hidden — each checked after a hard refresh with a clean console. Completion will be reported only after the zero-visible-section case is reproduced in the frontend; anything that cannot be exercised will be called out explicitly.
