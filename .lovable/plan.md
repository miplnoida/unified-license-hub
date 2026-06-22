## Issues

### 1. "Loading form fields..." hangs on the renewal form
The renewal template's `form_versions.schema_snapshot` is stored as an empty array `[]`. In `src/hooks/useFormTemplates.ts`:

```ts
function isValidSectionSnapshot(snapshot): snapshot is FormSection[] {
  return Array.isArray(snapshot) && snapshot.every(...);
}
```

`[].every(...)` returns `true`, so the empty snapshot is treated as "valid" and `useVersionSections` returns `[]`. The hook never falls back to the `form_fields` table (which actually contains 35 fields for this version). `ActiveFormFiller` then stays on the loader because `sections.length === 0`.

### 2. Anisha is shown as "Primary User" instead of "Applicant"
Anisha (`anisha.k2@yopmail.com`) is a `pre_licensee` / `applicant`. She has:
- No `profiles` row (so `user.licenseeId` is null)
- No `user_type = 'primary'`
- No `licensee_primary` role
- No `ppoc_entity_mappings`

But `PpocContext` *infers* an "own licensee" for her (via license holder back-reference / name match on `Anisha Commercial Bank`). That makes `ownLicenseeId` non-null, which makes `hasPrimaryUserAccess` true. In `src/lib/effectiveRole.ts` (lines 105–116), any user with `hasPrimaryUserAccess` gets relabeled as **"Primary User"**, overriding her real role.

## Fix Plan

### A. Stop the empty-snapshot loader hang
- `src/hooks/useFormTemplates.ts` — tighten `isValidSectionSnapshot` to require `snapshot.length > 0`. An empty array must fall through to the `form_fields` row-based path so the renewal form actually renders its 35 fields.
- No other call site changes needed; `useVersionSections` already prefers `fieldRows` when no valid snapshot is present.

### B. Stop mislabeling inferred owners as "Primary User"
Primary User status must come from an explicit signal, not from inference.

- `src/hooks/useEffectivePortalContext.ts` — compute `hasPrimaryUserAccess` from explicit signals only:
  ```
  hasPrimaryUserAccess =
       !!user?.licenseeId
    || user?.userType === 'primary'
    || user?.role === 'licensee_primary'
  ```
  Drop the `ownLicenseeId` fallback (inferred), but still pass `resolvedLicenseeId` through so the licensee audience context keeps working for legitimate cases (PPOC, real primary).
- `src/lib/effectiveRole.ts` — in the non-PPOC licensee branch (lines 105–116), only return `'Primary User'` when `isPrimaryRole` is true (explicit `licensee_primary` role or `userType='primary'`) **or** `user.licenseeId` is set. Inferred `resolvedLicenseeId`-only users fall back to their base role label (`Applicant`, `Pre-licensee`, etc.).
- Keep all existing PPOC / Secondary / Internal paths and tests intact. The `ppocVsPrimary` test suite continues to pass because all "Primary User" cases there use an explicit signal (`profileLicenseeId`, `userType='primary'`, or `licensee_primary` role).

### C. Verify
- Reload `/post-licensee/applications/7d257778-aae0-47e4-a767-f9e1e7b6ec2b/forms?service=Renew` as Anisha → form fields render, no infinite loader.
- Header / portal context shows her role as **Applicant** (her actual role) while she stays on the renewal flow.
- Existing primary / PPOC / admin users are unaffected — they all have explicit signals.

## Out of Scope
- No RLS changes (the previous RLS fix stays).
- No changes to the Renew button insert flow in `LicenseDetail.tsx`.
- No DB migration — both fixes are purely frontend.
