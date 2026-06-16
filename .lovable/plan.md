# Allow Multiple Files on Form File Fields

Enable bulk upload + per-file versioning on `file` fields in the Form Builder, so applicants can upload many documents into a single field (e.g., "Supporting Documents") with full version history per document.

## 1. Field config: add `allowMultiple` flag

**`src/types/formBuilder.ts`** — extend `FormField` with optional `allowMultiple?: boolean` (default `false`, so existing forms behave exactly as today).

**`src/components/form-builder/FieldProperties.tsx`** (file-field block, ~line 412–443) — add a `Switch` row above "Allowed File Types":

```
[ Switch ] Allow multiple files
          When on, applicants can upload many files into this field, each with its own version history.
```

Bound to `f.allowMultiple`; updated via `onUpdateField(f.id, { allowMultiple: v })`.

No changes to validation, allowed types, or size limits — they continue to apply per file.

## 2. FormRenderer: branch on `allowMultiple`

**`src/components/form-renderer/FormRenderer.tsx`** — in the `case 'file':` branch (~line 686):

- **When `field.allowMultiple === true` AND `formId` prop is present**, render `<VersionedDocumentUploader>` instead of the single-file `<Input type="file">`. Pass:
  - `entityType` (already on FormRenderer props)
  - `entityId` (already on FormRenderer props)
  - `defaultDocumentType={field.fieldName}`
  - `documentLabel={field.label}`
  - `formId`, `formVersionId`, `submissionId`, `fieldId={field.id}` (extend the uploader's props to forward these to `batchUploadDocuments`)
  - `onUploaded={(results) => onChange(field.fieldName, mergeResults(val, results))}`

- **When `allowMultiple === false`** or `formId` is absent → keep the existing single-file input and version-aware row exactly as today. No regression to current behavior.

The stored field value shape changes only when `allowMultiple` is true:

```ts
// single (today, unchanged)
{ name, size, path, groupId?, currentVersionId?, version? }

// multiple (new)
Array<{ name, size, path, groupId, currentVersionId, version, mimeType }>
```

Render the saved multi-file value as a stacked list reusing the same row UI (filename, size, `v{n}` badge, Eye preview, History dialog, X remove). Remove only the clicked row from the array; History opens the existing `DocumentVersionHistoryDialog` for that row's `groupId`.

## 3. Uploader prop forwarding

**`src/components/documents/versioned/VersionedDocumentUploader.tsx`** — accept and forward optional `formId`, `formVersionId`, `submissionId`, `fieldId`, `documentLabel` into each `BatchUploadItem`. No behavioral change when absent (registration/standalone use stays identical).

**`src/lib/documentVersioning.ts`** — `BatchUploadItem` / `uploadVersionedDocument` already accept form context; just thread the new fields through to the existing `create_document_version_metadata` RPC payload. No DB migration needed.

## 4. Submission + completion gating

- Treat a multi-file field as "filled" when the stored array length ≥ 1 (or ≥ `validation.min` if set).
- `required` validation: array length ≥ 1.
- No change to step-completion logic beyond reading the array form.

## 5. Read-only / review rendering

In `readOnly` mode for a multi-file field, render the same stacked row list without the upload control and without the remove button. History + preview remain available.

## 6. Tests

- Extend `src/test/formRendererStepPersistence.test.tsx` with one case: an `allowMultiple` file field with two files saved; rerender preserves both rows.
- Extend `src/test/documentVersioning.test.ts` to assert `fieldId` / `formId` are forwarded into the RPC payload for batch uploads.

## What stays untouched

- Registration approval, login, notifications, licensing, dashboard, payment workflow.
- Default behavior of every existing file field (toggle defaults off).
- DB schema, RLS, storage bucket, edge functions.
- Single-file rendering path, including the existing version-history clock button.

## Verification (manual)

1. `/admin/forms/create` → add a File field → toggle **Allow multiple files** on → save & publish.
2. As an applicant, open the form → select 3 PDFs in that field → Upload → three rows appear, each `v1`.
3. Re-upload one of them with the same filename → its row flips to `v2`; History dialog shows v1 + v2.
4. DB check: `document_groups` has 3 rows (one per file), `document_versions` has 4 rows (3×v1 + 1×v2), `document_action_logs` has matching `version_created` entries.
5. Toggle off on another field → field renders the original single-file input unchanged.
