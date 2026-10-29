## Files proposed for modification
1. `src/hooks/useUserPermissions.ts`: add `/help`, `/support`, `/entity/correspondence`, `/entity/profile` and `/documents` to `PRE_LICENSEE_ALLOWED_ROUTES`.
2. `src/routes/routeHelpers.tsx`: in `RegistrationApprovalGate`, replace the silent `<Navigate to="/dashboard">` for approved pre-licensees with an access-message screen that links back to the dashboard. The unapproved registration redirects stay as they are.
3. `src/lib/licenceEntitlementNav.ts`: add `/entity/complaint-rfis` and `/entity/supervisory-actions` to the licensed-only prefixes. The Sidebar's existing `canUsePostLicenceServices` check then hides them.
4. `src/components/layout/Sidebar.tsx`: hide `/entity/profile` for external users who have neither `canUsePostLicenceServices` nor an approved membership. This reuses the existing `useMyApprovedMemberships`.
5. `src/routes/dashboardRoutes.tsx`: wrap `/entity/complaint-rfis` and `/entity/supervisory-actions` in `PortalRoute area="returns"`-style licensed-only gating, using a new reusable area or a `licensedOnly` prop on `PortalRoute`. Wrap `/documents` in `P`.
6. `src/components/auth/PortalRoute.tsx`: generalise the existing `LicensedInstitutionOnly` notice so it covers these routes as well as returns. Staff behaviour stays the same.
7. `src/pages/entity/profile/MyInstitution.tsx`: if there's no approved membership, show a clear "Not linked to an institution" message. Today this state may render empty. The membership check is not bypassed.
8. Tests: `src/test/postLicenceAccess.test.ts` and a new `src/test/preLicenseeRoutes.test.ts`. They assert the allowed and denied paths for each row of the matrix and the licensed-only prefixes, and they check that licensee-role inputs are still allowed.

## Verification
- Run Vitest on the tests above and the existing route-coverage and navigation tests.
- In the browser, signed in as the pre-licensee: open every menu item in the matrix and type each hidden address directly. Expect an access message, never a silent bounce.
- In the browser, signed in as rbc_primary_user@yopmail.com: confirm My Institution, Returns, Information Requests and Supervisory Actions still work.
- Spot-check a staff account's sidebar for no change. Nothing is published.

## Approval conditions (added)
- One shared eligibility module, `src/lib/postLicenceAccess.ts`, decides both sidebar visibility and direct route access. There are no parallel checks.
- Post-licence entitlement never comes from an active linked licence alone. It comes only from a licensee role, an approved Primary/Secondary association or a contact-person mapping.
- Documents and My Licences: confirm in the browser and with read-only queries that the pre-licensee sees only their own records.
- Browser matrix, menu and direct URL: pre-licensee, licensee_primary, returns officer, supervisor and admin.
- Add these tasks to roadmap.md once build mode starts. No publish or deploy without approval.
