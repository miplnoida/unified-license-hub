## Why the error appears now
The renewal flow now creates a row in `applications` (it used to write to `license_renewals`). The `applications` table is protected by external-portal RLS gates:

```
(NOT has_external_role(auth.uid()))
OR external_can_access_application_values(auth.uid(), applicant_id, data, 'can_submit')
```

`external_can_access_application_values` authorises the insert if any of:
1. `applicant_id = auth.uid()` and the user holds `applicant` / `pre_licensee` / `licensee_primary` / `licensee_secondary`.
2. `applicant_id = auth.uid()` and the user has `licensing.can_submit` on their own account scope.
3. `data->>'licensee_id'` is present and the user has `licensing.can_submit` on that licensee.

The renewal insert today fails because the actor is an external-portal user without the static licensee role (dynamic-role web user or PPOC acting on behalf), and the payload does not set `data.licensee_id`, so branch #3 can never authorise the insert. `NewPostLicenseApplication.tsx` doesn't hit this because it explicitly sets `data.licensee_id = resolvedLicenseeId` from `PpocContext`.

## Fix (single file)
`src/pages/licenses/LicenseDetail.tsx`

1. Import and read `resolvedLicenseeId` from `usePpoc()`.
2. In `startRenewal`, include `licensee_id` in the inserted `data` payload when available:
   ```ts
   data: {
     ...(resolvedLicenseeId ? { licensee_id: resolvedLicenseeId } : {}),
     sector_id, sub_sector_id, category_id,
     service_id, form_template_ids,
     renewal_of_license_id, renewal_of_license_number,
     computed_new_valid_until, previous_valid_until,
     is_renewal: true,
   }
   ```

No schema, no RLS, no other components change. Internal admins are unaffected because they bypass the external gate via `NOT has_external_role(...)`.
