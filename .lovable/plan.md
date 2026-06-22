I will not claim this is fixed until it is verified in the preview.

What I found:
- The database says `anisha.k2@yopmail.com` is not a Primary User:
  - roles: `applicant`, `pre_licensee`
  - no `profiles.licensee_id`
  - no `profiles.user_type = primary`
  - no active PPOC mappings
- The remaining problem is frontend context inference: `PpocContext` still treats licensees found by entity name/application/license back-reference as the user’s “own” licensee. That can make applicant/pre-licensee users look like they are operating as Primary User even when the database does not grant that role.
- There is also a preview crash in the console: `useActiveSector must be used within ActiveSectorProvider`. The provider exists in `App.tsx`, so this is likely an HMR/context mismatch made fatal by the hook throwing. I will make this hook degrade safely so it does not blank the route while we verify the role issue.

Plan:
1. Tighten Primary User ownership in `PpocContext`
   - Only set `ownLicenseeId` from explicit Primary User signals:
     - `profiles.licensee_id`
     - `user.licenseeId`
     - `profiles.user_type = primary`
     - `user.role = licensee_primary`
   - Do not mark inferred matches from entity name, applicant applications, registration sector, or license back-references as Primary User ownership for applicants/pre-licensees.
   - Keep inferred licensee context available for renewal/form scoping where needed, but do not expose it as `ownLicenseeId` or Primary User mode.

2. Make role display authoritative
   - Header role label should use only the effective role helper and explicit Primary User signals.
   - Ensure dynamic role labels cannot override an applicant/pre-licensee into `Primary User` unless the explicit Primary User signals exist.

3. Prevent the provider crash from hiding verification
   - Update `useActiveSector()` to return a safe empty context fallback instead of throwing when the provider is temporarily unavailable during route/HMR rendering.
   - This avoids disrupting admin/licensee pages while keeping normal provider behavior unchanged.

4. Add/adjust focused tests
   - Add a regression case for Anisha’s exact shape: `pre_licensee/applicant`, no profile licensee, no primary user type, no PPOC mapping, but with a resolved/inferred licensee context.
   - Expected result: label remains `Pre-Licensee Applicant` or `Applicant`, never `Primary User`.
   - Keep existing Primary User and PPOC tests passing.

5. Verify before reporting fixed
   - Run the focused role tests.
   - Use the browser preview after implementation to verify the header/account role no longer shows `Primary User` for Anisha’s session.
   - Check console/runtime errors after the change before saying it is fixed.