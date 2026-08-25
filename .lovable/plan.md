# Fix: Returns "Access Denied" for valid licensee / PPOC users

## Root cause (verified)

The Returns routes are guarded by `PortalRoute area="returns" capability="can_view_status"`. For external users that guard grants access only if **either**:

1. the user holds the dynamic permission `returns_management.view_status`, or
2. the user's `profiles.role` appears in the role-default map `EXTERNAL_ROLE_DEFAULTS` in `src/lib/portalAccess.ts`.

Both legs fail for real portal users:

- Database check of the granted permissions shows `entity_ppoc@...` and `pre_licensee_user@...` carry only the `applicant` security role, which has **no** `returns_management` permission at all → leg 1 fails.
- The role-default map is keyed on the legacy role names (`licensee_primary`, `licensee_secondary`, `pre_licensee`, `applicant`), but the actual profile roles in use are `licensee_primary_user`, `licensee_secondary_user`, `pre_licensee_user`, `entity_ppoc` → leg 2 fails.

So the guard returns the generic `AccessDenied` page. Two separate defects are folded together: PPOC users are blocked from Returns entirely, and licence-ineligible applicants get an RBAC denial instead of an entitlement message.

## Fix approach (smallest targeted change)

Separate **route visibility** from **licence eligibility** and **action authority**. No server-side check, RPC, or RLS policy is changed.

1. **`src/lib/portalAccess.ts`** — add the canonical external role keys (`licensee_primary_user`, `licensee_secondary_user`, `pre_licensee_user`, `entity_ppoc`, plus `regulated_entity_user`) to the external role-default map, mirroring the capabilities their legacy equivalents already have. Pre-licensee/applicant keys get read capabilities for Returns (`can_view_status`) but **not** `can_submit_returns`.

2. **`src/components/auth/PortalRoute.tsx`** — treat read-only capabilities (`can_view_status`) as portal-visibility checks: a fully authenticated external portal user may open the area page. Action capabilities (`can_submit*`, `can_upload_documents`, `can_respond_rfi`) keep the existing dynamic-permission + role-default evaluation, so `/entity/returns/:id/fill` and every write path stay gated exactly as today.

3. **Page-level contextual states** — add a small shared notice component (e.g. `src/components/returns/ReturnsEntitlementNotice.tsx`) built on `useLicenseEntitlements` + the existing `LicenseStatusBanner`, and render it at the top of `EntityReturnsWorkspace.tsx` and `EntityReturnsDashboard.tsx`:
   - eligible licence → nothing extra, normal workspace/list;
   - no licence → "Regulatory Returns will become available once your licence has been approved and issued.";
   - suspended/revoked/expired → existing licence-status explanation, historical filings still listed, new-activity actions disabled;
   - entitlement lookup error → "We could not verify your licence eligibility. Please try again."
   PPOC users resolve against `activeLicenseeId` (already the behaviour of `useLicenseEntitlements`), so switching entity re-evaluates the correct entity.

## Explicitly unchanged

`returns_entitlement_ok`, `returns_can_file_obligation`, `returns_can_prepare_obligation`, `returns_open_filing`, `returns_submit_filing`, `can_act_on_specific_license`, RLS, the admin Returns Queue (`ModuleRoute` internal guard), sector-specific filtering, navigation locking, and the recently fixed pre-licensee route allowlist.

## Verification

Browser checks with a restored portal session for `/entity/returns` and `/entity/returns/dashboard`: eligible licensee loads normally, non-eligible user sees the entitlement notice (no Access Denied), direct-URL refresh stays on the page, and a submit attempt without authority is still refused server-side.
