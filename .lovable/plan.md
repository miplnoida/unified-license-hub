# Fix appeal panel internal-user filtering

## Confirmed cause

The appeal panel pickers both use `useInternalUsers`, but that hook currently excludes users only through external roles and entity-access mappings. It does not check `profiles.user_type`.

The displayed account was verified in the database as:

- `user_type`: `primary`
- role: `licensing_officer`
- no entity-access mapping

Because the internal role survives the current filter, the primary user is incorrectly shown.

## Changes

1. Update `useInternalUsers` to fetch `user_type` and exclude every profile whose type identifies a primary, secondary, applicant, pre-licensee, or licensee portal user, regardless of any additional internal role.
2. Keep the existing external-role and entity-access exclusions as defence in depth.
3. Deduplicate the final internal-user list by profile ID and update the query cache key so previously cached unfiltered results cannot remain visible.
4. Apply the correction centrally so both Appeal Panel entry points—the New/Edit panel multi-select and Composition member picker—receive the same clean list.

## Verification

- Query the underlying account classifications and compare them with the rendered picker.
- Open both panel-member pickers in the running application.
- Confirm all active, distinct genuine internal staff remain searchable by name and email.
- Confirm Vidya Rani and every other `primary`/`secondary` portal profile are absent.
- Report verification only after the running application is checked.