## Goal
Make the licensee renewal flow reliable and runtime-error-free, with this business rule applied everywhere:

- Grace period extends license validity.
- Renewal opens only after grace period ends.
- After grace ends, renewal remains available indefinitely.

## What I found

1. **Licensee panel can still show expiry/renewal incorrectly**
   - Some UI still treats `valid_until < today` as expired, ignoring grace.
   - Admin licensee list and licensee dashboard metrics need the same effective status logic as the renewal button.

2. **Expiry lookup can miss the correct license**
   - The expiry hook primarily checks licenses by `holder_id`, but licensee users can be linked through `licensees.license_id`, active licensee context, or PPOC mapping.
   - This causes renewal banners/buttons to be missing or inconsistent for real licensee accounts.

3. **Renewal app creation does not fully match normal post-license applications**
   - Normal post-license applications store `data.type`, sector/sub-sector names, service name, and service id consistently.
   - Renewal-created applications currently store only part of that shape, which can break listing, fee matching, form matching, and review displays.

4. **Submission guard can block renewal as a duplicate application**
   - The backend submission check compares the same sector/sub-sector/category as the original license.
   - Renewal requests should be exempt from “already approved application” duplicate blocking when `data.is_renewal` and `data.renewal_of_license_id` are present.

5. **Date math has boundary risk**
   - Some code compares normalized “today” while other code compares `Date.now()`.
   - This can flip renewal availability too early/late within the same day.

## Implementation plan

### 1. Add one shared license validity helper
Create a small shared helper for effective license status/date math:

- Normalize dates to start-of-day.
- Compute:
  - `days_until_expiry`
  - `grace_ends_on`
  - `in_grace_period`
  - `is_past_grace`
  - `effective_status`
  - `can_renew`
- Treat invalid/null dates safely, returning no runtime errors.

### 2. Update all licensee-panel status calculations
Apply the shared helper to:

- `useLicenseExpiryStatus`
- `useLicenseeMetrics`
- `LicenseeDashboard`
- `LicenseExpiryBanner`
- `ManageLicensees`
- `LicenseStatusBadge`
- `useLicenseStatusGate`

Expected result:

- During grace: show active/grace state, no Renew button.
- After grace: show expired/grace-ended state, Renew button visible.
- Metrics and badges match the button state.

### 3. Fix expiry scoping for real licensee users
Update the expiry status hook so it loads licenses from both:

- direct holder user id
- selected/resolved licensee id via `licensees.license_id`

This prevents licensee/PPOC dashboards from missing the license that should drive renewal eligibility.

### 4. Fix renewal application payload
Make `startRenewal()` create a post-license renewal application with the same data shape as normal post-license apps:

- `type: 'post_license'`
- `is_renewal: true`
- `renewal_of_license_id`
- `renewal_of_license_number`
- `computed_new_valid_until`
- `previous_valid_until`
- `licensee_id`
- `sector_id`, `sub_sector_id`, `category_id`
- `sector_name`, `sub_sector_name`, `category_name` where available
- `service_id`, `service_name: 'Renew'`
- `form_template_ids`

Also harden template matching to prefer service id, then service name, then renewal-name fallback.

### 5. Exempt valid renewal submissions from duplicate-app blocking
Update the submission function so duplicate checks skip renewal applications only when both are true:

- `data.is_renewal === true`
- `data.renewal_of_license_id` is present

This keeps normal duplicate protection intact while allowing real renewals.

### 6. Add defensive runtime guards
Add safe checks around:

- missing license
- missing template/service
- invalid `valid_until`
- missing linked licensee
- duplicate renewal-click/autotrigger race
- failed application insert/update responses

### 7. Verify after implementation
Use the live preview/browser flow to verify:

- No runtime errors are recorded.
- Grace-period license shows no renewal button.
- Past-grace license shows renewal button.
- Clicking Renew creates a renewal application and opens `/post-licensee/applications/:id/forms?service=Renew`.
- Forms page loads without blank/runtime error.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>