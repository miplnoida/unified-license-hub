Three separate issues on the RFI + queue flow.

## 1. RFI attachments not visible to anyone

`src/components/applications/ApplicationRfiTab.tsx` (line ~426) renders responses with only a count:

```tsx
{r.file_upload_ids.length > 0 && (
  <div>... {r.file_upload_ids.length} attachment{s}</div>
)}
```

No filename, no download link — so it always looks "not visible" regardless of role.

**Fix**: fetch the `file_uploads` rows referenced by every response and render each one as a clickable link.
- Add `useRfiAttachments(ids: string[])` (or inline `useEffect`) that batches all `file_upload_ids` across the current RFI's responses, queries `file_uploads (id, file_name, file_path, mime_type, file_size)` in one call, and stores them in a `Record<id, row>`.
- Replace the current `Paperclip` block with a list: filename, size, and a Download button that calls `getSignedUrl(file_path, 60)` from `@/lib/secureFileUpload` and opens/downloads the returned URL.
- Show a small "attachment no longer available" fallback if the row is missing (RLS-hidden or deleted).

No policy change needed — internals already pass `external_file_uploads_select_capability_gate` (the `NOT has_external_role(...)` branch), and applicants pass the `rfi_response` branch added in the previous migration.

## 2. Applicant name column blank for non-admin staff on Application Queue

Root cause is RLS, not UI. `src/pages/applications/ApplicationQueue.tsx` (lines 180-190) resolves names by querying `profiles` and `pre_license_users` directly. Both tables only allow SELECT for the row owner or `super_admin` / `admin`:

- `profiles`: policies `Users can read own profile`, `Admins can read all profiles`.
- `pre_license_users`: policies `Pre-license users read own`, `Admins manage pre-license users`.

Supervisors, licensing officers, and analysts get an empty result → the queue falls back to `'—'`. Admins see the correct name — matches the reported behaviour.

**Fix (single migration)**: allow every internal staff role to read applicant identity, minimum fields only.

Add two additive SELECT policies:

```sql
CREATE POLICY "Internal staff can read profiles for triage"
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer')
  OR has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'reviewer')
);

CREATE POLICY "Internal staff can read pre_license_users for triage"
ON public.pre_license_users FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'licensing_officer')
  OR has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'reviewer')
);
```

Additive policies do not weaken the existing "own row" and admin-only paths. Role list will be intersected with the actual `app_role` enum before running (any missing enum value is dropped from the migration to avoid failure).

No frontend change needed for this item — the existing name-resolution code will start returning values.

## 3. No default filters on Application Queue

`src/pages/applications/ApplicationQueue.tsx` currently defaults to:
- `statusFilter = 'pending'` (line 119)
- `sectorFilter = 'active'` (line 120)

**Fix**: initialise both to `'all'` so the page loads showing every record within its 500-row cap, and the user picks filters explicitly.

- Change initial state: `useState<string>('all')` for both.
- Keep the existing `pending` / `active` options in the dropdowns so the user can still pick them; just remove the "(default)" label suffix from `Pending (default)` and `Active sector (default)` to reflect that neither is the default anymore.
- Header-summary line ("Showing … · Status: … · Sector: …") already handles the `all` cases — no change.
- No change to load logic: `all` already skips the `.in('status', ...)` / sector `.or(...)` filters.

## Verification

- Reload `/applications/queue` as a supervisor account → applicant names populate, page loads with no status/sector filter applied.
- On DEMO-ULRA-005 detail → RFI tab shows attachment filenames with working Download buttons for both the applicant and the staff reviewer.
- `tsgo` + `supabase--linter` remain clean.
