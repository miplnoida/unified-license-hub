## Goal
Allow admins to map a licensee to an unlinked complaint directly from the "Escalate to Enforcement" card, then complete the escalation — without having to leave the page or edit the DB.

## Scope
File: `src/pages/complaints/ComplaintDetail.tsx` (Escalate to Enforcement card, ~lines 461–477), plus a new backend RPC and one small hook query.

## UX Changes (Escalate to Enforcement card)
When `complaint.licensee_id` is null:
1. Replace the amber "link this complaint via the DB" warning with an inline **Licensee picker**:
   - Searchable Combobox (Command + Popover pattern already used in project) that queries `licensees` by legal name / license number.
   - Shows top 20 matches; debounced 300ms search.
   - Selecting a licensee stages it locally (not saved yet).
2. Below picker: a **"Link Licensee"** button that persists the mapping via new RPC `link_complaint_licensee(_complaint_id, _licensee_id)`.
3. Once linked, card re-renders with licensee name shown (small badge with "Change" link that clears mapping) and the existing findings textarea + **Open Enforcement Case** button becomes enabled.

When `complaint.licensee_id` is already set: unchanged (already works today).

## Backend
New migration adds:
- `public.link_complaint_licensee(_complaint_id uuid, _licensee_id uuid) returns void`
  - `SECURITY DEFINER`, `search_path=public`.
  - Permission check via existing `has_complaint_perm(auth.uid(), 'edit')` or admin/super_admin bypass (mirrors `escalate_complaint_to_enforcement`).
  - Validates licensee exists.
  - Updates `complaints.licensee_id`, refreshes `updated_at`, writes an `audit_logs` row (`action='licensee_linked'`, before/after snapshot of licensee_id).
- `GRANT EXECUTE ... TO authenticated`.

Escalation RPC unchanged.

## Frontend Details
- New `useMutation` `linkLicensee` invoking the RPC; `onSuccess` invalidates `['complaint', id]`.
- New `useQuery` for licensee search (enabled on non-empty search term); returns `id, legal_name, license_number, sector_id`.
- Reuse `Command`, `Popover`, `Button` primitives already in the project. No new dependencies.
- Preserve current escalation flow — no changes to `escalate_complaint_to_enforcement` call.

## Out of Scope
- Bulk mapping, auto-suggestion from complaint text, and creating a new licensee from this dialog.
- Changing linkage after enforcement case has been opened.

## Verification
- Manual: open an unlinked complaint → search, pick licensee, click Link, then fill findings, click Open Enforcement Case → lands on new enforcement case.
- History drawer shows a `licensee_linked` audit row.
