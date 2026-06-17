## Scope

Tighten the External Portal Access admin page and make the role capabilities actually gate dynamic forms on the frontend. No changes to internal Role Management or other workflows.

## 1. Admin UI — `src/pages/admin/ExternalPortalAccess.tsx`

- Remove the `Tabs` wrapper. Show only the **External Portal Roles** content (current `RolesTab`). Delete the `User Assignments` and `Effective Access` tabs and their helper components (`AssignmentsTab`, `EffectiveTab`) from this file. The underlying tables and hooks stay (used by registration/approval auto-assignment).
- Replace every user-facing occurrence of "template" with "role":
  - Page description, card title ("Role Templates" → "External Portal Roles"), dialog titles ("New role template" / "Edit role template" → "New role" / "Edit role"), delete confirm ("Delete role template?" → "Delete role?"), save button ("Create role" stays, "Save changes" stays).
- Remove the **Applies to external roles** field entirely:
  - Drop the checkbox group from the dialog.
  - Drop the "Applies to" column from the table.
  - Stop sending `applies_to_roles` from `upsertRole` payload in `useExternalPortalRoles` (keep the DB column, just always send `[]`).

## 2. Frontend capability enforcement — dynamic forms

Currently `useExternalPortalAccess` exists but `FormRenderer` and submit/upload controls don't consult it. Wire it in so admin-toggled capabilities take effect live for external users (`applicant`, `pre_licensee`, `licensee_primary`, `licensee_secondary`). Internal users keep current behavior.

- **Portal area resolution**: add a small helper `src/lib/portalAreaForContext.ts` exporting `resolvePortalArea(ctx)` that maps the active context to one of `licensing | returns | complaints | fp_declarations` (based on the form template's `module`/`type` or the calling component; default `licensing`).
- **`FormRenderer`** (`src/components/form-renderer/FormRenderer.tsx`):
  - Accept optional `portalArea?: PortalArea` and `entityId?: string | null` props (callers in `SubmittedForms`, `ReturnReviewPanel`, application forms, complaints, F&P forms pass the appropriate value; internal admin renders pass nothing → behaviour unchanged).
  - Use `useExternalPortalAccess()` + `useIsInternal()`. For external users:
    - If `!can(area, 'can_submit*' for that area)` → disable Submit button with tooltip "You don't have permission to submit in this portal".
    - If `!can(area, 'can_upload_documents')` → disable all file/document inputs with tooltip.
    - If `!can(area, 'can_view_status')` → hide status/workflow read-only banners inside the renderer.
    - If `!can(area, 'can_respond_rfi')` (licensing/returns only) → hide RFI response controls.
  - Internal users bypass all checks.
- **Submit edge functions stay authoritative**: no server changes — capability already enforced by `has_portal_capability` RPC + RLS.

## 3. Hook tidy

- `useExternalPortalRoles.upsertRole`: drop `applies_to_roles` from the form-driven payload (always `[]`).
- Keep `useExternalUserPortalRoles` intact (used by auto-assignment).

## 4. Verification (must pass before claiming done)

- Seed dummy data via a one-off SQL script: insert a custom role `dummy_licensee_view_only` with only `can_view_status=true` on `licensing`, assign it to an existing test external user, log in as that user, confirm Submit + Upload are disabled in a licensing form, then toggle `can_submit=true` in the admin UI and confirm the Submit button enables on reload without a code change.
- Run `bunx vitest run` + project build.
- Open `/admin/external-portal-access` and confirm: no tabs, no "template" wording, no "Applies to" field, dialog saves successfully.

## Files touched

- `src/pages/admin/ExternalPortalAccess.tsx` (remove tabs, rename, drop applies_to field)
- `src/hooks/useExternalPortalRoles.ts` (always send `applies_to_roles: []`)
- `src/lib/portalAreaForContext.ts` (new)
- `src/components/form-renderer/FormRenderer.tsx` (capability gating)
- Callers passing `portalArea` to `FormRenderer`: `SubmittedForms.tsx`, `ReturnReviewPanel.tsx`, and the registration/complaints/F&P form entry points
- `scripts/external-portal-access-smoke.sql` (extend with dummy role + assignment for verification)

## Out of scope

- Internal Role Management page
- DB schema (columns kept for compatibility)
- Auto-assignment flow in `register-pre-licensee` / `approve-pre-licensee`
