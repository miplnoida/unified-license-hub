## Goal
Make the renewal form actually render. Today the Renew button opens a small dialog with only a Notes textarea and a Submit/Pay button — no form. The Submit Renewal Request button must appear **after** the renewal form fields.

## Approach
Reuse the existing post-license application flow. The database already has published renewal templates (`form_templates.form_type = 'post_license'`, names like "Commercial Bank License Renewal"). The post-license forms page (`/post-licensee/applications/:id/forms`) already:
- renders the form via `FormRenderer`
- shows the Submit button at the bottom
- enforces mandatory fees/payment

So the Renew button should create a draft renewal application bound to the matched renewal template and navigate there.

## Changes in `src/pages/licenses/LicenseDetail.tsx`

1. **Resolve the renewal form template** using `useFormTemplates`, filtering `status = 'published'` and `form_type = 'post_license'`, then matching by:
   - service named "Renew" (priority 1)
   - `sub_sector_id` (priority 2)
   - `sector_id` (priority 3)
   - name contains "Renewal" (fallback)
   If none, show toast "No renewal form is configured for this license."

2. **Replace `openRenewDialog` + `submitRenewal` with a single `startRenewal()`**:
   - Insert into `applications`:
     - `status: 'draft'`
     - `license_type`: current license type
     - `data`: `{ form_template_ids: [renewalTemplate.id], sector_id, sub_sector_id, service_id, renewal_of_license_id: license.id, computed_new_valid_until: computedNewValidUntil, licensee_id? }`
     - `regulator_id`: from active regulator
   - `logAudit({ action: 'license_renewal_started', entityType: 'license', entityId: license.id, newValue: { application_id, new_valid_until: computedNewValidUntil } })`
   - `navigate('/post-licensee/applications/:id/forms?service=Renew')`

3. **Remove the inline renewal `<Dialog>`** (summary + notes + Pay & Submit). The forms page is now the single source of the renewal form and Submit button.

4. **`?action=renew` auto-trigger**: keep, but now calls `startRenewal()` once on mount instead of opening the dialog.

5. **Keep `computedNewValidUntil`** logic and continue passing it into the application `data` so approval still extends the license correctly. `license_renewals` is created on approval as today — no change to that path.

## Not changing
- `src/pages/admin/ManageLicensees.tsx` status badge.
- `LicenseStatusBadge`, `useLicenseExpiryConfig`.
- The post-license forms page renderer or its existing Submit / payment flow.
- Renewal fee resolution — fees continue to be charged via the standard application payment step.

## Open question
Confirm: the renewal templates currently in the DB are not scoped by sector/sub-sector (`sector_id` is null). Is name-based matching ("Renewal" in the template name plus the license's sub-sector keyword) acceptable as the fallback when no service/sector match exists, or should I pick the single template whose name best matches `license.license_type`?
