## Goal
Harden the License Renewal feature so the original-application lookup, diff comparison, and review-screen visualization are reliable across every supported field type — without regressing any non-renewal flow.

## Scope (files touched)
- `src/pages/licenses/LicenseDetail.tsx` — original-app lookup chain
- `src/lib/formDiff.ts` — normalization + memoizable diff index
- `src/components/form-renderer/FormRenderer.tsx` — consume memoized diff, table/repeatable highlighting
- `src/components/applications/ApplicationReviewBuilder.tsx` — pass row/entry-level diff data
- `src/components/applications/ReviewAcknowledgement.tsx` — render row/entry "added/deleted/edited/reordered" + Was values
- `src/test/formDiff.test.ts` — extend coverage
- `.lovable/plan.md` — update status

No DB migration. No backend change. No edits to workflow, payment, document, AI-assessment, or approval code.

## 1. Original application lookup (LicenseDetail.startRenewal)
Replace the current 4-step chain with a single resolver that, in priority order, returns the first match from:

1. `licenses.application_id` (FK)
2. `applications` where `id = license.data.application_id`
3. `applications` where `license_id = license.id` AND `status IN ('approved','active')`
4. `applications` where `data->>license_id = license.id` OR `data->>issued_license_id = license.id` OR `data->>renewal_of_license_id = license.id`
5. `applications` where `license_number = license.license_number` OR `data->>license_number = license.license_number`
6. `applications` where applicant/licensee/holder match (`applicant_id`, `licensee_id`, `data->>applicant_id`, `data->>licensee_id`, `data->>holder_id`) AND sector/sub-sector/category match (top-level columns OR `data->>sector_id` / `sub_sector_id` / `category_id`), ordered by `submitted_at desc` and approved status.
7. Fallback: latest approved application for the same applicant+sector taxonomy.

When found, snapshot `original_application_id`, `original_forms_data`, `original_form_version_ids`, `original_form_template_ids`, `original_snapshot_at` on the renewal app. When not found, set `legacy_renewal_fallback = true`. Add a `resolveOriginalApplication(license)` helper unit-tested with mocked rows.

## 2. formDiff.ts normalization + memoization
Rewrite `deepEqualField` to normalize before compare:

- **Dates/timestamps**: if both sides parse as valid `Date` (ISO 8601, `YYYY-MM-DD`, epoch ms), compare by `getTime()`.
- **Numeric strings vs numbers**: when one side is `number` and the other is a numeric-only string, compare as numbers (`Number(x) === Number(y)`).
- **Booleans**: treat `true/"true"/"yes"/1` and `false/"false"/"no"/0` as canonical booleans before compare.
- **Objects**: sort keys before iterating so insertion order doesn't matter.
- **Strings**: trim + collapse internal whitespace.

Strengthen `isFileFieldChanged` identity chain: `uploadId` → `groupId+versionId` → `groupId+version` → `filePath` → `name+size+mimeType`. Apply same chain to array elements (multi-file), matching by best identity, not index.

Add `buildDiffIndex(currentData, originalData, fieldNames) → Map<fieldName, { changed, original }>` that callers can `useMemo` once per render. FormRenderer/ReviewBuilder use the map instead of re-running deep compare per field.

Add `diffRepeatable(currentArr, originalArr, keyFn) → { added[], deleted[], edited[], reordered[], pairs: [{ current, original, status }] }`:
- `keyFn` prefers an entry's stable id (`id`, `uuid`, `_key`) and falls back to a content hash.
- Detects added (key only in current), deleted (key only in original), edited (same key, different content), reordered (same key set, different order).
- Same algorithm reused for table rows.

## 3. FormRenderer.tsx
- Build the diff index once per render via `useMemo([formData, originalData, fieldSignature])`.
- Apply yellow ring + "Changed" badge to scalar inputs from the index.
- Tables: render `Changed`/`Added`/`Deleted`/`Reordered` badge inside the first `<td>` only (no extra cell, no column-count drift). Highlight cells whose value differs vs paired original row.
- Repeatables: each entry card uses `diffRepeatable` pairing, shows status badge on the card header, highlights only changed fields inside.
- Files/multi-file: use `isFileFieldChanged` for highlight + show "Was: <originalName>" beneath.

## 4. Review screens
`ApplicationReviewBuilder` passes the diff index + per-table/per-repeatable pairing into `ReviewAcknowledgement`. `ReviewAcknowledgement` renders:

- Scalars: current value + `Changed` + `Was: <original>` (already in place; keep).
- Tables: a sub-table with one row per `pairs` entry, status badge in the leftmost cell, current row values, and a muted "Was:" line beneath edited cells. Added rows show only current with `Added` badge; deleted rows show only original with `Deleted` badge; reordered shows both with `Reordered`.
- Repeatables: same status-badge pattern per entry card.
- Attachments: keep `Was: <originalName>` already implemented.

## 5. Preservation guarantees
- All new behavior gated on `originalData != null` / `originalFormsData != null`. When absent, renderers behave exactly as today — no badges, no ring, no extra DOM.
- No edits to: workflow engine, payments, documents, AI assessment, approvals, returns, registrations.
- `legacy_renewal_fallback` banner stays non-blocking.

## 6. Verification
Run in order:
1. `bunx tsgo --noEmit` — must pass.
2. `bunx vitest run` — extend `formDiff.test.ts` with new normalization + repeatable-diff cases; all green.
3. Playwright session against the running preview:
   - **A. Renewal with original app**: open an approved license → Renew → confirm forms pre-fill, edit one field of each type (text, number, date, boolean, single-select, multi-select, file, multi-file, table row edit/add/delete/reorder, repeatable entry edit/add/delete/reorder) → screenshot each → confirm yellow highlight + correct status badge → Save Draft → reopen via Continue Draft → confirm highlights persist → Review → confirm `Was:` values + status badges per row/entry → Submit → open Internal Review as regulator → confirm same comparison view.
   - **B. Legacy renewal fallback**: license with no resolvable original → Renew → confirm forms load blank with fallback banner → no badges anywhere → Save/Submit works.
   - **C. Resubmission**: regulator returns app for resubmission → applicant re-opens → original baseline still drives highlights.
   - **D. Non-renewal regression**: create a brand-new application → confirm zero badges, zero `Was:` text, identical DOM to pre-change baseline → Save/Submit/Internal Review unaffected. Spot-check payments, documents, AI assessment, approvals on the same app.

Mark complete only when all four Playwright scenarios pass with screenshot evidence and the test + typecheck commands are green.

## Out of scope
- DB schema changes
- Backend/edge-function changes
- Any UI work outside the renewal comparison surface
