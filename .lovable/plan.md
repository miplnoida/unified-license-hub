# Fix Application History & Attachment Access (Admin)

Two problems on the admin application detail page (`/applications/:id`):

1. **History drawer is empty and dumps JSON.** Audit rows exist in the DB but only `super_admin`/`admin` can read `audit_logs`, and the drawer renders raw JSON via `DiffViewer`.
2. **Uploaded documents can't be viewed/downloaded** for many internal staff (regulator, legal_compliance, market_conduct_officer, analyst on some paths, etc.) because RLS on `documents`, `file_uploads`, and the `documents` / `secure-documents` storage buckets only whitelists a handful of roles.

## Fix 1 — Human-readable history

Rework `src/components/audit/ChangeHistoryDrawer.tsx` (already used by `HistoryButton` on `ApplicationDetail.tsx` and everywhere else) to render each event as plain English instead of a JSON diff.

- Add an action label map (e.g. `application.submitted` → "Application submitted", `application.status_changed` → "Status changed", `workflow.assigned` → "Assigned to reviewer", `application.draft_updated` → "Draft updated", `application.sufficiency.evaluated` → "Sufficiency evaluated", `RULE_OVERRIDE` → "Rule override", etc.).
- Resolve `user_id` to a display name via a small batched `profiles` lookup (fall back to role or "System").
- Render before/after as a small key/value change list (`Status: submitted → under_review`) using existing diff helpers to compute changed keys; only fall back to a collapsed "Show technical details" JSON block for unknown shapes.
- Same treatment applies to `compliance_audit_logs` and `rule_overrides` entries.
- Keep the existing merge/sort/dedupe logic; only the row renderer changes.

## Fix 2 — Broaden read access for internal staff

Add a security-definer helper `public.is_internal_staff(uid uuid)` returning true for any non-external app role (super_admin, admin, supervisor, licensing_officer, analyst, legal_compliance, compliance_officer, market_conduct_officer, regulator, prudential_supervisor, etc. — the full internal set already in `src/types/platform.ts`).

Then in one migration:

- Replace the `audit_logs` SELECT policy so any internal staff can read.
- Replace `documents` / `file_uploads` SELECT policies for internal users (`Read documents`, `Users read own uploads`) to use `is_internal_staff(auth.uid())` — external policies remain untouched.
- Update the `secure-documents` bucket SELECT policy (`Users read own secure-documents`) and the `user_can_access_document_object` function (used by the `documents` bucket policy) to allow all internal staff.

No changes to INSERT/UPDATE/DELETE policies, external capability gates, or bucket write rules.

## Files touched

- `src/components/audit/ChangeHistoryDrawer.tsx` — new human-readable renderer, profile name lookup, technical-details toggle.
- `src/components/audit/DiffViewer.tsx` — small helper export to compute changed keys (or a new tiny `humanizeChange.ts`).
- One migration:
  - `CREATE OR REPLACE FUNCTION public.is_internal_staff(uuid)`.
  - `DROP POLICY … CREATE POLICY` on `audit_logs`, `documents`, `file_uploads`, and `storage.objects` (SELECT on `secure-documents`).
  - `CREATE OR REPLACE FUNCTION public.user_can_access_document_object` extended to accept all internal staff.

## Out of scope

- No UI/functional changes to the history button placement, other tabs, or upload flow.
- No changes to storage bucket write policies or external-user capability gates.
