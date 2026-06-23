## Goal
In Admin → Fee Management → "Add/Edit Fee" dialog:
1. Add a switcher controlling whether the selected category/services/form is **Free** or **Paid**.
2. Reorder the dialog so scope fields appear first, then fee details.
3. When Free is selected, skip paid-only fields and persist a zero-amount/free configuration so downstream payment flow treats the application as free.

No changes to listing tables, rules, fee types tab, or other modules.

## UX Changes (`src/pages/admin/FeeManagement.tsx`)

### New field order inside the dialog (top → bottom)
1. **Fee Scope** (Category / Services / Individual Form) — moved to top
2. **Sector**
3. **Sub-Sector**
4. **Category** / **Services** / **Form** (conditional on scope, unchanged logic)
5. **Paid toggle** — new `Switch` labeled "Paid (toggle off = Free)". Default ON (paid) for backward compatibility.
6. **Fee Name** *(only when Paid)*
7. **Fee Type(s)** *(only when Paid)*
8. **Currency** *(only when Paid)*
9. **Per-fee-type amount rows** *(only when Paid)*
10. **Active** switch
11. **Save** button

When the Paid switch is OFF:
- Hide name, fee types, currency, amount rows.
- Show a small info banner: "This scope will be marked as Free. No payment will be collected."
- Skip name/fee-type validation in `handleSave`.

### Persistence when Free
- Insert a single `fee_configurations` row per scope target (same expansion as today for services/forms, one row for category) with:
  - `name`: auto `"Free"` (or `"Free - <scope label>"`)
  - `fee_type`: `'free'` (a reserved sentinel)
  - `calculation_type`: `'fixed'`
  - `amount`: `0`, `min_amount`: `0`, `max_amount`: `null`
  - `currency`: existing default
  - `is_active`: from Active switch
- Duplicate guard reuses existing logic against `fee_type = 'free'`.

### Edit mode
- When opening an existing row with `amount = 0` and `fee_type = 'free'`, prefill the Paid switch OFF; otherwise ON.

## Downstream Free handling
The application/payment workflow already reads `fee_configurations` to resolve fees. A row with `amount = 0` naturally yields a zero total. To make the "free" path explicit and skip the mandatory payment gate:
- In `src/lib/applicationFeeBreakdown.ts` (fee resolution): when the resolved configuration has `fee_type === 'free'` or total computes to `0`, mark the breakdown as `isFree: true`.
- In the application submit flow that today blocks submission until payment is recorded (per memory: "Mandatory payment before final submit"), bypass the payment gate when `isFree` is true and auto-mark `feeStatus = 'paid'` / `feeApproved = true` at submit time so the existing edge function (`verify-and-submit`) accepts it.

Scope note: only the resolver + the client-side gate check change; no edits to other modules, no schema migration (uses existing columns with sentinel `fee_type`).

## Files to edit
- `src/pages/admin/FeeManagement.tsx` — reorder dialog, add `isPaid` state, conditional rendering, free-row save path, edit prefill.
- `src/lib/applicationFeeBreakdown.ts` — recognise free configurations.
- Application submit gate (the helper used by the applicant submission page that currently enforces payment) — allow skip when breakdown is free. I will locate the exact file at implementation time (likely the submit handler in the application detail page) and limit the change to a single conditional.

## Out of scope
- No DB migration.
- No changes to Rules, Fee Types tab, late fees, or listings table columns.
- No styling/layout changes outside the dialog field order.
