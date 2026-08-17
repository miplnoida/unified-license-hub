# Fix missing Product / Channel / Conduct Risk Category / Customer Type on complaint detail

## What is actually wrong

The intake form does collect and send these values — the database intake function silently discards them.

Verified: complaint CMP-2026-000080 has `product_id`, `channel_id`, `conduct_risk_category_id` and `customer_type` all `NULL` in the database, even though the form posted them. The `create_complaint` function inserts only these columns: complainant, subject, description, email, severity, priority, status, intake source, created-by, complaint type, licensee, regulator, vulnerability indicator and notes. The four conduct classification fields (plus `vulnerability_category`) are never written, so nothing can display them later.

A second, separate defect confirmed from the live preview: the `get_complaint_current_assignees` call fails on every complaints list/detail load with `operator does not exist: text = app_role`. `approval_steps.approver_role` is the `app_role` enum but the function compares it against a text value without casting.

## Fix

1. **Persist the classification fields at intake.** Update `create_complaint` so the insert includes `conduct_risk_category_id`, `product_id`, `channel_id`, `customer_type` and `vulnerability_category`, read from the payload with the same null-coercion the other fields use. Invalid `customer_type` values are ignored rather than rejected (the client already whitelists them). No change to severity/priority/triage behaviour, validation, workflow start, notifications or audit.
2. **Fix the assignee lookup error.** Cast the enum comparison in `get_complaint_current_assignees` so the role join works, removing the repeating failed request on complaints screens.
3. **Show the saved values read-only on the detail page.** The Conduct Classification card currently renders editable selects only; add the resolved names (product, channel, risk category, customer type) so a viewer without edit rights still sees what was recorded.
4. **Keep the card in sync with the loaded complaint.** Its form state is seeded once on mount, so values that arrive after the first render (or after a save/refetch) can display stale/blank. Re-sync when the complaint record changes.

## About CMP-2026-000080 specifically

The values the user selected were never stored anywhere, so they cannot be recovered. After the fix, they need to be re-entered once on the complaint detail page via the Conduct Classification card. Complaints created from then on will retain the selections.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.create_complaint(_variant text, _payload jsonb)` with the five extra insert columns; `create_complaint_with_attachments` delegates to it and needs no change. Plus `CREATE OR REPLACE FUNCTION public.get_complaint_current_assignees` with `ur.role::text = st.approver_role::text`.
- Frontend: `src/components/complaints/ConductClassificationCard.tsx` only — add read-only resolved labels and a `useEffect` that re-seeds form state from `complaint`. No schema, RLS or grant changes.

## Verification

- Record a new internal complaint with all four fields set, then query the row and confirm all four persisted.
- Open the complaint detail page and confirm the values render, with no failed `get_complaint_current_assignees` request in the network log and no console errors.
- Confirm existing complaints, triage, workflow actions and SLA display are unaffected.
