# Fix "Edge Function returned a non-2xx status code" on Sign Certificate

## What is actually happening

The signing request is rejected before any signing work happens. Two independent authorization defects were confirmed:

1. **The permission being checked does not exist.**
   `sign-license-certificate` gates on `license_management` / `issue`, and `dispatch-license-certificate` gates on `license_management` / `dispatch`. The permission catalog has no such rows — the licence-certificate permission that exists is `license_management.manage_certificates`. `has_permission` therefore returns false and the function replies **403 Forbidden** for everyone except a super admin (super admins bypass via `is_super_admin`).

2. **A second, legacy role check duplicates and contradicts the first.**
   Both functions then re-check roles by reading the old `user_roles` table against a hardcoded allow-list. Staff whose roles are assigned through the dynamic RBAC (`user_dynamic_roles` / `roles`) have no matching `user_roles` row, so they get **403 `not_authorized_to_sign`** even when their role legitimately grants certificate management.

Certificate data itself is fine: all 12 certificate rows have matching PDFs in the `license-certificates` bucket, and `LICENSE_SIGNING_SECRET` is configured — so this is purely the authorization gate.

## Fix

**1. Gate on a permission that exists**
- `sign-license-certificate`: check `license_management` / `manage_certificates`.
- `dispatch-license-certificate`: check `license_management` / `manage_certificates`.
- Update `docs/rbac/edge-function-permission-map.tsv` rows for both functions so the CI authz verifier stays in sync.

**2. Remove the duplicate legacy role check**
- Delete the hardcoded `SIGNING_ROLES` / `DISPATCH_ROLES` lookups against `user_roles` in both functions and rely solely on `requireUserPermission` (project convention: one authority). Keep the `security_event_logs` denial record, emitted from the single gate path.
- Reuse the authenticated user id returned by the gate instead of re-resolving the user with a second client.

**3. Make sure the permission is actually granted**
- Migration: ensure `license_management.manage_certificates` is attached to the roles that should sign/dispatch (Admin, Supervisor, Licensing Officer and equivalents), so non-super-admin staff can complete the action.

**4. Surface the real reason in the UI**
- `LicenseSignaturePanel` currently shows the raw invoke failure. Map the function's error body (403 → "You do not have permission to sign certificates", 409 → "Already dispatched") so the message is actionable instead of "non-2xx status code".

## Verification
- Call the signing function for a `draft` certificate as an authorized non-super-admin and confirm 200, a `license_certificate_signatures` row, and `dispatch_status = ready`.
- Confirm a user without the permission still gets a clean 403 with a readable message.
- Run `node scripts/verify-edge-authz.mjs` so the permission map stays green.
