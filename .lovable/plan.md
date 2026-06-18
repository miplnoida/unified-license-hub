# Add Form scope to Fee Management

The Fee Management module already supports configuring fees by **Sector → Sub-Sector → Category → Service**. The missing dimension is **Form** — letting an admin tie a fee configuration to a specific form template (e.g. a particular pre/post-license application form or return form).

This plan adds Form as an optional scoping dimension without touching existing working logic (calculation types, rules, exemptions, discounts, fee types master, rule editor).

## 1. Database (migration)

Add an optional `form_id` to `public.fee_configurations`:

- `form_id uuid null references public.form_templates(id) on delete set null`
- Index on `form_id` for resolver lookups
- No change to existing rows (NULL = applies to all forms in scope, current behavior)
- Keep all existing RLS/GRANT statements; the migration only adds a column + index

## 2. Admin UI — `src/pages/admin/FeeManagement.tsx`

In the create/edit fee dialog, add a **Form (optional)** selector below Services:

- Multi-select of form templates, filtered by the selected Sector / Sub-Sector / Category (using the same scoping fields `form_templates` already exposes; fall back to "All forms" when nothing matches)
- Empty selection → `form_id = null` (current behavior, applies to all forms)
- Like Services today, selecting multiple forms expands into one `fee_configurations` row per (fee type × service × form) combination in `handleSave`
- Show the Form column in the configurations table and in the edit prefill
- New state: `formIds: string[]`, included in `resetForm`, `openEdit`, payload `buildRow`

No changes to: fee types master tab, rules tab, calculation/min/max validation, currency, regulator scoping, RowActionsMenu wiring.

## 3. Fee resolver — `src/lib/applicationFeeBreakdown.ts`

Extend the specificity ranking so a fee scoped to the application's form wins over a generic one:

- Accept the form template id from the application (`appData.form_template_id` / equivalent already on `applications.data`)
- Add `+16` specificity when `f.form_id === selectedForm`
- Keep the existing service exclusivity rule (service-scoped vs no-service) and apply the same rule to `form_id`: if the application has a form, a row with `form_id = null` still matches (generic); a row with `form_id` only matches when it equals the application's form
- No change to the `fee_components` path (already-stamped invoices)

## 4. Hooks / queries

- Reuse `useFormTemplates` (already in the project) inside `FeeManagement.tsx` to populate the form dropdown
- No new hook files

## 5. Out of scope (do not touch)

- Fee Rules editor, fee_rules table, discounts, exemptions
- Payment Settings page, Stripe/Paddle wiring
- Returns late-fee structures
- RLS policies, fee_types master, regulator switching
- Application submission / payment workflow logic

## 6. Verification

- Existing fee configs (with `form_id = null`) continue to resolve exactly as today for both pre-licensee and post-licensee flows
- Creating a fee with a Form selected produces one row per (fee type × service × form)
- An application whose form matches a form-scoped fee picks that fee over a generic one with the same sector/category
- Editing an existing fee with no form keeps `form_id` null on save
