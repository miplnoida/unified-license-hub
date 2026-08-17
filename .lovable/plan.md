# Applicant Application Fill: Tab Highlighting + Payment After Review

Two UI/flow corrections in the applicant/licensee application fill screens. No changes to validation, submission rules, or payment logic itself.

## 1. Tab highlighting and navigation inside a form

Current behaviour in the form renderer (used for add/edit/view):
- For grouped forms (A Forms / B Forms with sub-forms), the **active** tab is painted amber while **untouched** tabs are painted solid primary — so an unfilled tab looks more "selected" than the one you are on.
- For simple multi-section forms, the active tab uses solid primary, but there is no clear marker distinguishing "current" from "already filled".
- The active section/tab is not remembered when the applicant leaves the form and comes back (the storage key is available in the renderer but is not passed in from the application fill pages).

Changes:
- One consistent tab visual language across both grouped tabs, sub-form buttons, and simple section tabs:
  - Active: solid primary with a visible ring/border so it always reads as "you are here".
  - Filled/completed: soft primary tint + check icon (clickable).
  - Not started: muted neutral (clickable).
- All tabs stay freely clickable, including already-filled ones, so the applicant can jump back to any completed section (this remains true for grouped and non-grouped forms).
- Pass a per-application/per-template step storage key from the applicant fill pages so the last active tab is restored on return, and cleared on submission.

Applies to both the pre-license and post-license applicant fill pages, and to read-only/view mode.

## 2. Payment after review, not before

Current post-license applicant flow:
```text
All forms completed -> Payment panel shown -> Review & Submit button (disabled until paid) -> Review -> Submit
```
Desired flow:
```text
All forms completed -> Review Application -> (review confirmed) -> Payment -> Submit
```

Changes on the applicant application forms screen:
- Move the payment panel out of the forms list step. When all forms are complete, the primary action is **Review Application** (no payment gate on it).
- On the review screen, after the applicant confirms/acknowledges the review, show the payment step (the same payment panel component, unchanged behaviour) followed by the **Submit Application** button.
- Submit stays gated on payment: it is enabled only once the outstanding amount is zero or a successful payment exists. The existing server-side submission check stays untouched.
- Applicants who have already paid (returning to a paid draft) go straight from review to Submit, with the payment step showing as settled.
- Keep the "Back to Forms" escape from review, and keep the direct-submit path used when review is disabled in settings (in that case the payment step is shown before Submit on the forms screen as it is today).

## Technical notes

- `src/components/form-renderer/FormRenderer.tsx`: unify tab/button class logic for the three navigation renderers; keep `setCurrentStep` / `setActiveFormIdx` handlers as-is.
- `src/pages/PostLicenseApplicationForms.tsx`: reorder the render so `LicenseePaymentPanel` appears inside the review block after acknowledgement instead of above the review CTA; introduce a small `reviewAcknowledged` UI state persisted alongside the existing `:review` session key; pass `stepStorageKey` into `ActiveFormFiller` / `FormRenderer`.
- `src/pages/ApplicationForms.tsx`: same tab/step-key wiring (this page has no payment panel, so ordering is unaffected).
- `paymentReady` / `paymentChecking` computation, `verify-and-submit` invocation, and review settings handling are unchanged.
