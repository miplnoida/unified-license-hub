## Diagnosis
On application `670791b1…` the DB shows:
- `sector_id`, `sub_sector_id`, `category_id` are set.
- `form_template_ids` = 1 template.
- `forms_data` is empty (no keys).

The submit button in `src/pages/applications/ApplicationDetail.tsx` (lines ~1295-1320) is intentionally disabled while `allFormsCompleted` is false, showing the label "Complete all forms (0/1)". Selecting a sector does not fill forms — the applicant still has to complete each form under the **Submitted Forms** tab. So this isn't a bug in the taxonomy logic; it's a UX issue: the label reads like a call-to-action but the button is disabled with no obvious next step.

## Fix (UX only, frontend, minimal)
When forms are incomplete, make the button a **navigator to the Submitted Forms tab** instead of a disabled submit.

Change in `src/pages/applications/ApplicationDetail.tsx`, applicant submit block:

1. Keep `allFormsCompleted` / `canSubmit` as-is.
2. Split the single button into behavior modes based on state:
   - `!allFormsCompleted` **AND** `formTemplateIds.length > 0` → button is **enabled**, label stays `Complete all forms (X/Y)`, icon `Edit`/`FileText`, `onClick` sets `activeTab = 'form'` (the Submitted Forms tab, which already renders when `hasSubmittedForms` is true). Scroll into view so user sees the accordion. No submit.
   - `formTemplateIds.length === 0` → button disabled with label `No forms configured for this selection` (edge case for triples with zero matched templates; prevents silent lock).
   - `licenseGate.isBlocked` → disabled `License Not Active` (unchanged).
   - `!paymentComplete` → disabled `Complete payment to submit` (unchanged).
   - `canSubmit` true → enabled `Review & Submit` opens the existing review dialog (unchanged).
3. Cancel button and processing state remain unchanged.

Nothing else in the file, no backend, no schema, no other tabs touched.

## Manual verification
1. Open the same draft application → button now reads "Complete all forms (0/1)" and is clickable. Clicking switches to the Submitted Forms tab with the pending form open.
2. Fill and save the form → returning to Details tab, button becomes "Review & Submit" (or "Complete payment to submit" if fees are unpaid) as before.
3. Change sector to a triple with matching templates → button label updates to new X/Y count; click still routes to Submitted Forms.
4. Change sector to a triple with no matching templates → button becomes disabled with the "No forms configured…" hint (no silent lock).
5. Internal reviewer and submitted-status flows remain unchanged.
