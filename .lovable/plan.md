I understand the frustration. I found the renewal path and the policy that is still failing.

## Actual issue

The Renew button creates a new row in `applications` and immediately calls `.select().single()` on the insert.

For external users, `applications` has a restrictive select policy named `external_applications_select_capability_gate`. Because it is restrictive, it must pass even when the normal “applicant can read own apps” policy passes. During `INSERT ... RETURNING`, that restrictive select check can fail and roll back the insert, which matches the exact error:

`new row violates row-level security policy "external_applications_select_capability_gate" for table "applications"`

The renewal form page also reads and updates the same application row after navigation, so I will verify both creation and the form continuation path, not only the first click.

## Plan

1. **Fix the restrictive application select policy safely**
   - Update `external_applications_select_capability_gate` so external static roles can directly read their own application row using the row’s own `applicant_id`.
   - Keep the existing portal capability checks for dynamic portal roles.
   - Do not broaden access to other users’ application records.

2. **Harden the Renew button creation path**
   - In `src/pages/licenses/LicenseDetail.tsx`, pre-generate the application id before insert.
   - Insert the renewal draft without chaining `.select().single()` so renewal creation does not depend on immediate `INSERT RETURNING` readback.
   - Navigate using the pre-generated application id.
   - Keep the existing licensee authorization guard and renewal metadata unchanged.

3. **Check the renewal form path closely**
   - Review `src/pages/PostLicenseApplicationForms.tsx` save/submit behavior against the same policies.
   - Ensure the form can load the created renewal application, save draft data, mark it in progress, handle payment gating, and call final submit without introducing a regression.

4. **Validate against Anisha’s record only**
   - Use the known Anisha account/license relationships already identified:
     - user id: `817c85c1-114b-41e0-8da2-314c55f87c42`
     - license: `LIC-2026-000014`
     - licensee: `8e3ffcec-8270-478d-861e-da60f025e3b3`
   - Confirm the policy logic permits this user to create/read/update only their renewal draft.
   - Do not change unrelated licensees or application records.

5. **Regression guard**
   - Keep existing internal staff, PPOC, applicant, pre-licensee, primary licensee, and secondary licensee access paths intact.
   - Avoid changing unrelated tables, forms, dashboard listings, or submission workflow logic.

After approval, I’ll implement this as one focused backend migration plus the small Renew button frontend change, then verify the renewal click and renewal form path.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>