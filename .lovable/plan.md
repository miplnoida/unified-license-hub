## End-to-End Renewal Form Hardening Plan

Goal: make license renewal reliably reuse the original approved application's templates, versions, and submitted data with correct change-highlighting everywhere — without regressing any other flow.

### 1. Original-application lookup (LicenseDetail.startRenewal)

Build a single resolver `resolveOriginalApplication(license)` that tries, in order, and returns the first hit:

1. `license.application_id` direct foreign key.
2. JSON references: `license.metadata.application_id`, `license.source_application_id`, `license.renewal_of_application_id`.
3. `applications` where `license_id = license.id` and `status in ('approved','active')`.
4. `applications` where `license_number = license.license_number`.
5. Holder/applicant + sector taxonomy: `applicant_id = license.holder_id` AND matching `sector_id` / `sub_sector_id` / `category_id`, latest approved.
6. Fallback: latest approved application for the same applicant in the same sector.

If found, snapshot into the new renewal application:
- `original_application_id`, `original_forms_data`, `original_form_version_ids`, `original_form_template_ids`, `original_snapshot_at`.
- Seed `forms_data`, `form_version_ids`, `form_template_ids` from the original so the renewal opens pre-filled with the exact same forms/versions.

If not found, set `legacy_renewal_fallback = true` and keep current renewal-template behavior.

### 2. Diff engine (`src/lib/formDiff.ts`)

- Keep `deepEqualField`, `isFieldChanged`, `isRowChanged`, `isRepeatableEntryChanged`, `isFileFieldChanged`.
- Add `buildDiffIndex(current, original, fields)` → returns a `Map<fieldName, { changed, original }>` computed once per render. This eliminates repeated deep comparisons inside `renderField`.
- File compare: identity chain uploadId → groupId+version → filePath → name+size; supports arrays for multi-file.
- Add unit tests for: scalar, array, nested object, table rows, repeatable entries, single file, multi-file, empty/null/whitespace normalization.

### 3. FormRenderer highlighting

- Accept `originalData` prop; compute `diffIndex` via `useMemo` keyed on `(formData, originalData, fieldsSignature)`.
- Apply yellow ring/background when `diffIndex.get(fieldName).changed === true`:
  - Normal inputs (text, number, select, radio, checkbox, date, textarea).
  - Table: per-row highlight using `isRowChanged`; "Changed" badge embedded inside first `<td>` so column count matches header (already in place — verify).
  - Repeatable sections: per-entry highlight via `isRepeatableEntryChanged`.
  - File / multi-file: via `isFileFieldChanged`.
  - Nested objects: deep compare via `deepEqualField`.
- Revert-to-original clears highlight automatically (driven by diffIndex recompute).

### 4. Review screens (applicant + internal)

`ApplicationReviewBuilder` + `ReviewAcknowledgement`:
- Pass `originalFormsData` through.
- For each field show: current value, `Changed` badge, and `Was: <original>` line.
- Attachment fields render the original file preview under "Was:" (already added — verify alignment with `max-w-[360px]`).
- Tables: per-row "Changed" indicator in first cell.
- Repeatables: per-entry "Changed" indicator.

### 5. Wiring points

- `PostLicenseApplicationForms.tsx`: load `original_forms_data` + `original_form_version_ids` from the application row, pass `originalData` to `FormRenderer`. Show non-blocking yellow banner when `legacy_renewal_fallback`.
- `ApplicationDetail.tsx` (internal review): same — pass `originalFormsData` to `ApplicationReviewBuilder` and show legacy banner.
- `SubmittedForms.tsx`: pass `originalData` for readonly comparison view.
- Resubmission + Continue Draft: both reuse the same renewal application row, so they inherit `originalData` automatically — confirm no code path strips it.

### 6. Backward compatibility

- Renewals without `original_*` fields → `originalData` is `undefined` → diff engine returns no changes → renderer behaves like a normal application. Show legacy banner only when explicitly flagged.
- Non-renewal applications never receive `originalData` → zero behavior change.

### 7. Performance

- Single `useMemo`-built diff index per form (not per field).
- Stable signature using field name list + JSON.stringify of relevant slices avoided in favor of reference equality on `formData` / `originalData`.
- Avoid re-running diff on every keystroke for unrelated fields by scoping recompute to the changed field path when feasible.

### 8. Verification checklist (must all pass before reporting done)

- `tsgo --noEmit` clean.
- ESLint clean on changed files.
- Manual via Playwright on localhost:
  1. Renewal with original found → forms pre-filled, edits highlight yellow live, revert clears highlight.
  2. Renewal without original → legacy banner shown, renewal continues using renewal templates.
  3. Table edit → only changed row highlights, columns aligned.
  4. Repeatable edit / add / remove → correct entry-level highlights.
  5. File replace (single + multi) → highlights, review shows "Was:" with prior file.
  6. Save Draft → reopen via Continue Draft → highlights persist against original snapshot.
  7. Submit → applicant Review screen shows Changed + Was values.
  8. Internal review (`ApplicationDetail`) shows identical Changed + Was values.
  9. Resubmission after query → still diffed against original snapshot, not previous submission.
  10. New (non-renewal) application → no diff UI, no banner, behaves exactly as before.
  11. Smoke: payments page loads, AI assessment trigger works, workflow actions execute, documents tab loads on an existing approved application.

### Files to touch

- `src/lib/formDiff.ts` — add `buildDiffIndex`, tests.
- `src/pages/licenses/LicenseDetail.tsx` — `resolveOriginalApplication` + snapshot writer.
- `src/components/form-renderer/FormRenderer.tsx` — memoized diff index, per-type highlighting.
- `src/components/applications/ApplicationReviewBuilder.tsx` — already wired; confirm repeatable/table per-entry diff.
- `src/components/applications/ReviewAcknowledgement.tsx` — verify attachment "Was" rendering.
- `src/components/applications/SubmittedForms.tsx` — pass `originalData` in readonly mode.
- `src/pages/PostLicenseApplicationForms.tsx` — load snapshot + banner.
- `src/pages/applications/ApplicationDetail.tsx` — load snapshot + banner.
- New: `src/test/formDiff.test.ts`.

No DB schema migration required if `original_*` columns already exist on `applications`; if missing I will add a migration with proper GRANTs and RLS preservation before snapshot writes.
