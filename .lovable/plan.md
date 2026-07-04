## Diagnosis (from the screenshots + code)

Two bugs, both in `src/pages/applications/ApplicationDetail.tsx`:

1. **Old forms leak after sector change.** `persistTaxonomy` only recomputes `form_template_ids` when the *new* triple is fully filled AND changed. When the user changes only the Sector (screenshot 2 shows Commercial Bank selected, Sub-Sector blank, Category disabled), the sub-sector/category get cleared but `form_template_ids` / `forms_data` keep the old Building Society template — so the Submitted Forms tab keeps showing the previous form.
2. **"Complete all forms" button ignores incomplete taxonomy.** The button's disabled logic only checks templates/payment/license. With an incomplete triple but stale `form_template_ids`, the button navigates to Submitted Forms and lets the user proceed against the wrong form.

## Fix (frontend only, same file)

### A. Clear stale templates whenever the triple is broken
In `persistTaxonomy`:
- Compute `fullTriple = !!(secId && subId && catId)`.
- If **not** `fullTriple`: set `form_template_ids = []`, `forms_data = {}`, `form_version_ids = {}` in `nextData` (in addition to writing the partial IDs/names). This removes the old form immediately when the user picks a new sector.
- Keep the existing `fullTriple && tripleChanged` branch that resolves new matched templates and prunes stale keys.

### B. Gate the submit button on a complete triple
In the applicant submit block:
- Add `const taxonomyComplete = !!(appData?.sector_id && appData?.sub_sector_id && appData?.category_id);`
- Priority order for the button label / disabled state (highest priority first):
  1. `!taxonomyComplete` → **disabled**, label `Select sector, sub-sector and category`.
  2. `noTemplates` (triple complete but zero matched templates) → **disabled**, label `No forms configured for this selection`.
  3. `needsForms` → **enabled**, navigates to Submitted Forms tab (unchanged behavior, label `Complete all forms (X/Y)`).
  4. `licenseGate.isBlocked` → disabled `License Not Active`.
  5. `!paymentComplete` → disabled `Complete payment to submit`.
  6. `canSubmit` → enabled `Review & Submit`.
- Update `disabled` expression accordingly so an incomplete triple can never proceed.

### C. Nothing else changes
- Cascading dropdowns, auto-save, activity tab, workflow, payments, RLS, and internal-reviewer view all stay as-is.
- No backend or schema changes.

## Manual verification (application `670791b1…`, DEMO-ULRA-002 gap)
1. Open the draft app → change Sector to Commercial Bank → Sub-Sector and Category clear.
2. Details tab immediately: submit button becomes **disabled** with `Select sector, sub-sector and category`.
3. Submitted Forms tab: no longer shows the Building Society form (shows "No forms were submitted…" or the tab collapses).
4. Pick a valid Sub-Sector and Category for Commercial Bank:
   - If templates match → button becomes clickable as `Complete all forms (0/N)` and jumps to the new Commercial Bank forms.
   - If no templates configured → button stays disabled with the "No forms configured…" hint.
5. Complete forms → button transitions to `Complete payment to submit` → then `Review & Submit`.
6. Reload page after each step → persistence holds; internal reviewer view unchanged.
