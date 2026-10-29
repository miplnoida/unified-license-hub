## Technical details
- `src/hooks/useUserPermissions.ts`: add `/entity/profile`, `/entity/correspondence`, `/help` and `/support` to `PRE_LICENSEE_ALLOWED_ROUTES`. The prefix match already covers subpaths. `/entity/returns` keeps its `PortalRoute` licensed-only check.
- Check that `MyInstitution` handles an empty or denied result from `entity_self_profile` with a friendly empty state. If it doesn't, add one inside the page; this is UI only.
- Test: add cases to an existing test file confirming that `isPreLicenseeAllowedRoute` allows these four paths, still allows the existing ones, and still rejects an unrelated path such as `/admin`.
- Verify: sign in as rodneybay.registration@yopmail.com in the browser and confirm all four pages open, then confirm Returns still shows the licensed-only notice.
