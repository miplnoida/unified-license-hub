## Diagnosis

The earlier fix only added `resolvedLicenseeId` from the active PPOC/licensee context into the renewal draft. That does not cover all license detail flows because:

- On the license detail page, `resolvedLicenseeId` can be `null` or point to a different selected entity.
- The renewal application is inserted with `.insert(...).select().single()`, so the database must allow both creating the row and immediately reading the returned row.
- The returned row is blocked by the restrictive `external_applications_select_capability_gate` unless the application can be linked to a licensee the user can view.
- The renewal panel is also too restrictive: it only appears when `user.id === license.holder_id`, which can hide it from valid licensee/PPOC web users acting for the entity.

## Plan

1. **Resolve the actual licensee for the license**
   - In `LicenseDetail.tsx`, query the `licensees` row linked to the current license (`licensees.license_id = license.id`).
   - Store that `licenseeId` locally.
   - Use this license-derived ID as the primary renewal context, falling back to `resolvedLicenseeId` only if needed.

2. **Verify access before starting renewal**
   - Reuse `useLicenseeAccessGuard()` in `LicenseDetail.tsx`.
   - For external users, verify they can access the resolved licensee before inserting the renewal draft.
   - If not authorized, show a clear authorization error instead of triggering the RLS failure.

3. **Make the renewal insert RLS-readable**
   - Set `data.licensee_id` to the license-derived licensee ID.
   - Keep `applicant_id: user.id`.
   - Keep `form_template_ids`, `renewal_of_license_id`, and computed validity metadata.
   - This gives both the insert gate and the immediate select/return gate a licensee link to authorize against.

4. **Show renewal action only for expired licensee-panel licenses**
   - Keep dashboard/banners limited to expired licenses.
   - On `LicenseDetail.tsx`, show the renewal panel for external users when:
     - the license is expired, and
     - the user is authorized for the linked licensee.
   - Remove the `user.id === license.holder_id` restriction so valid PPOC/entity web users can renew.

5. **Keep submit button after the renewal form**
   - Do not add submit controls to the license detail page.
   - The flow should navigate to the existing post-license form page, where forms are completed first, payment is checked if a fee exists, then the submit button appears.

## Files to change

- `src/pages/licenses/LicenseDetail.tsx` only.

## Validation

- Check that renewal button/panel appears only for expired external-licensee licenses.
- Check that starting renewal includes `data.licensee_id` from the actual licensee record.
- Check that the user is sent to `/post-licensee/applications/{id}/forms?service=Renew` instead of seeing the RLS error.