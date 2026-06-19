## Plan

The URL is loading `src/pages/NewApplication.tsx`, not the standalone form detail page. It uses `FormRenderer`, but draft hydration can land on the selection step if the saved application data has no valid sector/sub-sector/category or no `last_active_form_template_id`, so the previous validation-summary fix may never be reached.

## What I will change

1. **Make application continue URLs resolve the intended form step reliably**
   - In `NewApplication.tsx`, when `step=filling` is requested and no saved `last_active_form_template_id` exists, select the first hydrated/matched form template automatically instead of falling back to the category selection screen.
   - Keep existing guards for invalid drafts and do not change submission/payment rules.

2. **Make validation feedback visible inside the application flow**
   - Pass a stable `stepStorageKey` to `FormRenderer` from `NewApplication.tsx` so long multi-section forms remember the exact internal section while continuing a draft.
   - Ensure the existing `FormRenderer` toast + scroll-to-first-error runs on Continue/Submit for this application flow.

3. **Harden the scroll target**
   - Adjust the field selector escaping in `FormRenderer` so fields with generated/special names are still found reliably.
   - No validation rules or save-draft behavior will be changed.

## Verification

- Open the provided continue URL.
- Confirm it lands on a form-filling view when a form template is available.
- Leave required fields blank and click the form Continue/Submit button.
- Confirm a top-level toast lists missing fields and the page scrolls/focuses the first invalid field.
- Confirm Save Draft remains unchanged.