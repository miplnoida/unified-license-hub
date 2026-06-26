## Goal
Add a new **Internal** tab in Admin → Form Management so admins can configure form templates intended for internal-staff use only. No other functionality changes.

## Scope
- Admin UI only. No backend schema change (the `form_templates.form_type` column is free text — we introduce the value `'internal'`).
- Reuses the existing builder, version history, publish/archive, sector/sub-sector/category/service scoping, and permission gates.
- External portals (licensee/pre-licensee) already filter strictly by `pre_license` / `post_license` / `returns` / `registration`, so `'internal'` templates are automatically invisible to them — no additional guard needed for this task.

## Changes

1. **`src/pages/admin/FormManagement.tsx`**
   - Extend the `FORM_TYPES` array with `{ value: 'internal', label: 'Internal' }`.
   - The tab renders the same listing/filters/actions as other tabs (it's data-driven off `activeTab`).
   - Create / Edit buttons already route to `/admin/forms/create?type=${activeTab}`, so they work for `internal` with no extra wiring.

2. **`src/pages/admin/FormBuilder.tsx`**
   - Add `'internal'` to the `formTypeLabel` derivation so the header reads "Internal Form Builder".
   - No other branching needed: the existing pre/post-license code path (no `return_type_id`, taxonomy pickers visible) is the correct default for `internal`.

3. **`src/routes/adminRoutes.tsx`** (optional convenience)
   - Add `<Route path="/admin/forms/internal" element={<Navigate to="/admin/forms?tab=internal" replace />} />` to mirror the existing pre/post-license redirects.

## Out of scope (not changed)
- Where/how internal forms get rendered to internal users at runtime. The user asked only for the admin configuration tab; surfacing internal forms inside specific internal screens can be a follow-up once admins have created some.
- Workflow, RBAC, RLS, registration approval flow, and any external-portal behaviour.

## Verification
- Run `tsgo` typecheck.
- Manual: open `/admin/forms`, switch to the new **Internal** tab, click **Create New Form**, confirm builder opens with type `internal`, save a draft, return to the tab, confirm it lists. Confirm the other tabs (Pre-License, Post-License, Returns, Registration) still list only their own templates.
