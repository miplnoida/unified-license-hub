# Application Detail — Documents Visibility, Identity Panel, Request Edit Tab

## What I verified first (data, not assumptions)

- The Documents tab renders `AttachmentList` with `entityType="application"` (plus `entity_type='form_field'`), which reads only `documents` and `file_uploads`.
- In the live database there are **no** `file_uploads` rows with `entity_type = 'application'` or `'form_field'`, and **no** `documents` rows for applications. The only `file_uploads` rows carry `entity_type = 'document_version'`.
- Application documents actually live in the **versioned** store: `document_groups` (`entity_type = 'application'`, `entity_id` = application id) → `document_versions` → `file_uploads` (as `document_version`). Example: application `APP-2026-000159` has **7 document groups** and would render as "No documents uploaded yet" today.
- So the read path is looking in the wrong place. This is the root cause of the empty Documents tab on both sides. Uploads themselves are fine — nothing needs migrating.
- `AttachmentList` ignores query errors entirely (no error branch), so an RLS/permission failure also renders as "No documents uploaded yet".
- Read access on the versioned store: `document_groups`/`document_versions` allow `owner_id = auth.uid() OR is_doc_staff(auth.uid())`. `is_doc_staff` only checks the legacy `user_roles` table (5 roles), while the platform's internal-staff check (`is_internal_staff`) also honours dynamic roles and profiles. There are 47 `sec_user_roles` rows vs 37 legacy rows, so internal reviewers who hold only dynamic roles cannot read application documents. This needs a backend fix, not weaker RLS.
- Request Edit currently appears in the right-hand action column (full-width button paired with a destructive Cancel), outside the tab system.
- Identity sources that exist: `applications.applicant_id` → `profiles` or `pre_license_users` (name + email, plus `entity_name`), `applications.entity_id` → `licensees.name` (the licensees table has **no** email column), company contact resolvable via `entity_user_memberships` → profile email, plus the application `data` snapshot.

## 1. One consolidated Documents view

Create a single hook, `useApplicationDocuments(applicationId)`, that reads all valid representations in parallel and returns `{ items, loading, error }`:

- `document_groups` + current/latest `document_versions` for `entity_type='application'`, `entity_id = applicationId` (this is where today's uploads land, including form-field attachments which carry `form_id`/`field_id`).
- `file_uploads` where `entity_type='application'` or `('form_field'` with `entity_id = applicationId)` — legacy/other paths.
- `documents` where `entity_type='application'`.
- File references embedded in `application.data.forms_data` (values with `filePath` / `uploadId` / `versionId` / `groupId`), resolved through the existing `resolveFormFileStoragePath` helper so nothing saved only inside `forms_data` is lost.

Each item is normalised to: filename, document type/label, size, uploaded date, source origin (internal only, not shown as jargon), storage bucket, storage path, version, and stable id.

**Deduplication** by, in order: storage path (primary physical identity), then `document_version` id, then `file_uploads` id. Never by filename alone. Where the same physical file surfaces via a group and via `forms_data`, the richer record (group/version, with document type and version number) wins.

**States** (replacing the current single empty string):
- Loading → "Loading documents…"
- All sources resolved, nothing found → "No supporting documents have been uploaded."
- Any source errored → "Unable to load documents. Please refresh and try again." with a Retry action; never silently empty.

Download and preview reuse the existing signed-URL logic (5-minute TTL) with bucket resolution across `secure-documents` and `documents`. Applicant and admin render the same list; the uploaders stay applicant-only exactly as today.

## 2. Backend read access (no RLS weakening)

Widen `is_doc_staff` to delegate to the platform's canonical internal-staff resolution (dynamic roles / profiles), so every internal reviewer with Application View can read application document metadata — same set that can already read `documents`/`file_uploads`. External applicants remain limited to their own records; nothing becomes public and no policy is dropped.

Where an application belongs to a licensee entity, document visibility for that entity's permitted users follows the existing external capability gate used by `documents`/`file_uploads` rather than any new rule.

## 3. Admin Details tab — Applicant & Licensee Information

Add an "Applicant & Licensee Information" block to the Details tab for internal users (extending the existing `CaseSnapshotFields`), with resolution precedence:

- **Licensee / Company Name**: linked `licensees.name` via `applications.entity_id` → registration `pre_license_users.entity_name` → application snapshot (`data.company_name` / `entity_name` / `organization_name`) → "—".
- **Licensee / Company Email**: entity primary-contact / PPOC email via entity membership → registration company email → snapshot company email. Left blank when only an applicant email exists; the applicant email is never relabelled as a company email unless the values are genuinely identical.
- **Applicant Name**: `profiles.full_name` → `pre_license_users.full_name` → snapshot.
- **Applicant Email**: profile email → registration primary-user email → snapshot email.

Snapshot values inside `applications.data` are preferred whenever they are already persisted for historical applications, so old cases keep the values captured at submission. No application rows are rewritten.

## 4. Request Edit as its own applicant tab

- Add an applicant-only `Request Edit` tab, shown only when the existing eligibility rules already pass (owner, status in the current `EDIT_REQUEST_ALLOWED_STATUSES` set, not read-only, not approved/rejected/cancelled/freely-editable).
- Move the existing reason textarea and actions into that tab and remove the block from the right-hand action column, so it appears exactly once.
- Pending state: when an edit request is already open, the tab shows the "Edit Request Pending" message only — no second form, preserving existing duplicate protection.
- Actions row, bottom-right of the card: `[ Cancel Application ]  [ Request Edit ]` — normal width, equal height, right aligned, no `flex-1`; stacked full-width only on small screens.
- The pre-submission Review & Submit / Cancel block for drafts stays where it is.

No change to `edit_requested`, status rules, admin allow/deny, resubmission, workflow pause/resume, notifications, or audit records — handlers are reused as-is.

## 5. Untouched

Submitted Forms keeps its inline field-level attachments (contextual view alongside the consolidated library). Tab order for internal users is unchanged; `Request Edit` is inserted only for eligible applicants. Creation, draft save, form versioning, submission, payments, workflow authorization, RFI, PPOC, sector context and batch upload logic are all left alone.

## 6. Verification before reporting done

Browser-driven end-to-end against a real application: applicant uploads through Documents, Batch Upload and a dynamic form file field; refresh; confirm all appear once, download works, no false empty state. Then open the same application as an internal reviewer and confirm identical documents plus the four identity fields. Re-check the existing application `APP-2026-000159` (7 existing document groups) to prove historical documents surface. Confirm an unrelated applicant still cannot read them. Any scenario that cannot be exercised will be reported explicitly as unverified rather than folded into a completion claim.

## Technical notes

- New: `src/hooks/useApplicationDocuments.ts` (multi-source resolver + dedup), `src/components/applications/ApplicationDocumentsPanel.tsx` (consolidated list with loading/empty/error states), `src/components/applications/ApplicantLicenseeIdentity.tsx`.
- Edited: `src/pages/applications/ApplicationDetail.tsx` (Documents tab body, new Request Edit tab, removal of the duplicated Request Edit block), `src/components/applications/CaseSnapshotFields.tsx` (identity section).
- One migration: widen `public.is_doc_staff` to the canonical internal-staff check.
- `AttachmentList` stays available for other modules; only the application Documents tab moves to the new panel.
