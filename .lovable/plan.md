## Goal

Finish the renewal pre-fill + diff-highlight feature so a renewal application behaves exactly like the original approved application being reopened — same templates, same versions, same data, with every applicant change highlighted yellow for both applicants and internal reviewers. No changes outside the renewal path.

---

## Gaps in the current implementation

After reviewing the code that was already shipped:

1. **`LicenseDetail.startRenewal` still hard-requires a renewal template.** It calls `resolveRenewalTemplate()` and bails with *"No renewal form is configured for this license."* before it ever looks up the original approved application. It also only sets `form_template_ids` to the originals — `form_version_ids` is copied but never validated, and template lookup blocks renewal when no template exists.
2. **`FormRenderer` only highlights top-level scalar fields.** The `isFieldChanged` call sits in `renderField` guarded by `isTopLevel = data === formData`, so repeatable-section rows, table rows, and nested groups never highlight. Tables and repeatables also don't compare row-by-row.
3. **`ApplicationReviewBuilder` / `ReviewAcknowledgement` show no diff.** They render `field.value` only — no comparison against the original snapshot.
4. **No legacy fallback banner.** When no original app can be located, the renewal still opens silently with the standalone renewal template; the spec wants a non-blocking notice.
5. **Original-app lookup is narrow.** Today it only tries `licenses.application_id` plus an `approved + sector + license_number/id` fallback. Spec wants priority chain incl. license_number and holder/applicant+sector/sub-sector/category.
6. **No memoization of `originalData` per template** — comparisons re-run on every render of every field.

Everything else (snapshot persistence, version pinning via `useResolveAppFormVersion`, internal-view wiring, applicant edit wiring, legend banners in PostLicense and ApplicationDetail) is already in place and stays untouched.

---

## Files to change

```text
src/pages/licenses/LicenseDetail.tsx                  # priority chain + drop template requirement + persist legacy flag
src/components/form-renderer/FormRenderer.tsx         # diff for repeatables, tables, files; memoize
src/components/applications/ApplicationReviewBuilder.tsx # accept + propagate originalFormsData to review
src/components/applications/ReviewAcknowledgement.tsx # render Changed badge + yellow wrapper per field
src/pages/PostLicenseApplicationForms.tsx             # pass originalFormsData to ApplicationReviewBuilder; legacy banner
src/pages/applications/ApplicationDetail.tsx          # pass originalFormsData to ApplicationReviewBuilder
src/lib/formDiff.ts                                   # add row-aware diff helpers (table row, repeatable entry)
```

No DB migration, no edge-function, no workflow/payment/AI/RLS/permission/route-guard changes.

---

## Detailed plan

### 1. `src/pages/licenses/LicenseDetail.tsx` — renewal creation

- Drop the early `if (!template) return toast.error(...)` gate. Templates are now optional.
- Replace original-application lookup with a priority chain that runs **before** any template logic:
  1. `licenses.application_id`
  2. `applications` where `status='approved'` and `data->>license_id = license.id` (most recent by `approved_at`)
  3. `applications` where `status='approved'` and `data->>license_number = license.license_number`
  4. `applications` where `status='approved'` AND `applicant_id = license.holder_id` (or `licensee_id = linked`) AND `sector_id`/`sub_sector_id`/`category_id` match, most recent
- If found → use `original.data.form_template_ids`, `forms_data`, `form_version_ids` exactly. Set `legacy_renewal_fallback: false`.
- If **not** found → only then call `resolveRenewalTemplate()`; if that also returns nothing, still allow renewal with `form_template_ids: []` and surface a single non-blocking toast (`"Original approved application could not be located. This renewal will use the standard renewal form if available."`). Set `legacy_renewal_fallback: true` and **do not** write `original_*` snapshot keys.
- Keep all existing logic for fee/service/workflow/payment resolution unchanged. Continue writing `is_renewal`, `renewal_of_license_id`, `service: 'Renew'`, `service_id`, valid_until, etc.
- Snapshot is already deep-cloned (`JSON.parse(JSON.stringify(...))`) — keep that. Never overwrite `original_forms_data` / `original_form_version_ids` / `original_form_template_ids` after insert.
- Add `original_form_template_ids` to the insert payload (currently missing).

### 2. `src/lib/formDiff.ts` — extend helpers

- Existing `deepEqualField` already handles nested objects/arrays — keep as-is.
- Add `isRowChanged(currentRow, originalRow)` and `isRepeatableEntryChanged(currentEntry, originalEntry)` as thin wrappers around `deepEqualField` so callers don't reinvent the compare.
- Add `pickFieldFromOriginal(originalData, fieldName)` helper that safely returns `undefined` when `originalData` is null/undefined.

### 3. `src/components/form-renderer/FormRenderer.tsx` — full diff coverage

- Remove the `isTopLevel = data === formData` guard. Replace with a per-call optional `baselineForField?: unknown` argument so each renderField invocation knows its own baseline:
  - Top-level: `baselineForField = originalData?.[field.fieldName]`.
  - Repeatable entry at index `i`: `baselineForField = originalData?.__repeatable?.[sectionId]?.[i]?.[field.fieldName]` (matches the `__repeatable` shape already used).
  - Table rows: still rendered inside one `field`; diff at the field level (see below) — individual cells compared via deep equal.
- For `field.type === 'table'`: compare each row against `originalData?.[field.fieldName]?.[rowIdx]` via `deepEqualField`. Add a `bg-yellow-50 ring-1 ring-yellow-400` class on the changed `<tr>` plus a small "Changed" pill in the row's actions cell. Keep existing add/remove row UX.
- For repeatable sections: highlight the whole entry container (yellow border) when `isRepeatableEntryChanged`. Also keep per-field highlight inside the entry.
- For `file` fields (single + `allowMultiple`): compare by stable identity — prefer `uploadId`, then `groupId`+`version`, then `filePath`, then `name+size`. Highlight the file row when changed (different file uploaded, removed, or added vs. original).
- Memoize per-render: wrap the original-data lookup in a `useMemo` keyed on `originalData` reference + `formData`/`repeatableData` so the diff cost is proportional to actual changes, not render count.
- Keep the existing top-level "Changed" badge + yellow wrapper; just expand the surfaces it applies to.
- `display`/`heading`/`paragraph`/`divider` fields: skip diff (already returned early — preserve that).

### 4. `src/components/applications/ApplicationReviewBuilder.tsx`

- Add prop `originalFormsData?: Record<string, Record<string, any>>`.
- For each template, also fetch the original section data the same way as current values, run `resolveDynamicFieldValue` against `originalFormsData?.[templateId]`, and push a parallel `originalValue` onto each section field.
- Pass `originalValue` and a derived `changed` boolean (via `deepEqualField`) into the `sections` array given to `ReviewAcknowledgement`.

### 5. `src/components/applications/ReviewAcknowledgement.tsx`

- Extend the section field type with optional `originalValue` and `changed`.
- When `changed === true`:
  - Wrap that row in `border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 rounded-md px-2 py-1`.
  - Append `<Badge variant="outline">Changed</Badge>` next to the label.
  - When `originalValue` is non-empty and differs, render it as a muted `Was: <value>` line under the current value (skipping it for attachment/file types to avoid clutter).
- No behavior change when `changed` is undefined/false — keeps every non-renewal review identical to today.

### 6. `src/pages/PostLicenseApplicationForms.tsx`

- Pass `originalFormsData={hasRenewalDiff ? originalFormsData : undefined}` into the `<ApplicationReviewBuilder>` call (line ~630).
- Add a small legacy-fallback banner just above the forms when `appData?.data?.is_renewal === true` and `appData?.data?.legacy_renewal_fallback === true`:
  *"Original approved application could not be located. This renewal is using the standard renewal form."*

### 7. `src/pages/applications/ApplicationDetail.tsx`

- Pass `originalFormsData={hasRenewalDiff ? originalFormsData : undefined}` into the second `<ApplicationReviewBuilder>` (line ~971, the submit-review dialog).
- Show the legacy-fallback banner symmetrically when `appData.legacy_renewal_fallback === true`.

### 8. Backward compatibility & safety

- All new behavior is opt-in via the presence of `originalData` / `original_forms_data`. Existing non-renewal applications never see a baseline → no visual change.
- Legacy in-flight renewals without snapshot keys: render normally, no highlighting, no legend, legacy banner only if `legacy_renewal_fallback` is true.
- Version pinning is already handled by `useResolveAppFormVersion` + `formVersionIds` snapshot stored at renewal-creation time. The renderer keeps using the pinned id; latest published is only the fallback. Friendly "version unavailable" message is already produced by `useResolveAppFormVersion`/`SingleFormViewer` (resolver error path).
- Performance: `originalData` references stay stable per render (read from `appData.data.original_forms_data`); memoized field-level lookups avoid O(N) recomputes.

---

## Verification (executed before declaring complete)

1. Build a license whose original approved application is reachable → click Renew → renewal opens with original templates + values prefilled; legend shown.
2. Edit a top-level field, a repeatable row, a table cell, a file upload, and a nested group → all four surfaces highlight yellow live; revert removes highlight.
3. Save draft → reopen → highlights persist.
4. Open the renewal in Review → review screen shows yellow Changed badges and `Was:` lines.
5. Submit renewal → open `/applications/:id` (internal) → Submitted Forms tab + ApplicationReviewBuilder dialog both show identical highlighting; legend appears.
6. Force a legacy path (license with no resolvable original) → renewal still opens, legacy banner shown, no highlighting, no crashes, no console errors.
7. Smoke a non-renewal new application + a normal post-license non-renew service → no visual change vs main.
8. Trigger Query Raised → applicant resubmits → highlight still compares against original snapshot, not the prior submitted draft.

Acceptance criteria from the request map 1:1 onto steps 1–8 above; completion is only declared after all pass.
