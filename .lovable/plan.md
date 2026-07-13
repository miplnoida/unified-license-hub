# Return File Upload & Dynamic Template Download

Adds template download (XLSX + XML + optional XSD) and secure file upload/validate/import to the existing licensee return completion experience. No existing routes, hooks, RLS, workflows, or manual entry paths are altered.

## Scope guardrails
- Extend `src/pages/returns-mgmt/ReturnDetail.tsx` (the shared return form page used by licensees) with a new **Upload Return File** section; keep manual entry, autosave, workflow, review, submission, revision compare untouched.
- Reuse the existing form-version resolution already in `ReturnDetail.tsx` (`versionByForm`, `form_templates`, `return_form_data.form_version_id`) as the single source of truth.
- Replace the static `src/pages/UploadReturns.tsx` mock (hard-coded lists, fake history) only if it is still routed; if unrouted, leave it but do not extend it. No new top-level route.
- Do **not** change: RLS, workflow edge functions, notifications, admin/regulator surfaces, `useReturnRevisions`, accounting reconciliation gate, submission edge function.

## User-facing changes (licensee return detail only)
New collapsible panel above the form tabs, showing: return name, period, due date, status, resolved form-version(s), accepted formats (.xlsx/.xls/.xml), max size (configurable, default 10 MB).

Actions:
- **Download XLSX Template** — per return (multi-sheet when the return has multiple forms).
- **Download XML Sample**.
- **Download XSD** (best effort; hidden if generation fails).
- Drag-and-drop + browse; shows filename/size, backend validation progress, structured error summary (worksheet/xml path, row, form, field label, stable key, rejected value, reason).
- **Import** button (disabled until zero blocking errors), with strategy choice: *Replace all mapped* / *Fill blanks only* / *Cancel*.
- **Upload history** table below, backed by new table (see below), scoped by RLS to current licensee.

Manual entry, save-draft, section navigation, and submission remain the primary flow — the panel is additive.

## Backend

### Edge Functions (new)
1. `generate-return-template` (POST `{ returnId, format: 'xlsx'|'xml'|'xsd' }`)
   - Auth user; verify access via existing `can_current_user_access_licensee` RPC against the return's licensee/sector.
   - Load `returns_filed` → linked `form_templates` → resolved `form_versions` using the same rule already applied in `ReturnDetail.tsx` (prefer `return_form_data.form_version_id`, else latest published for the template's effective window).
   - Load `form_fields` (ordered) for each resolved version.
   - XLSX: build workbook with SheetJS (`npm:xlsx`). One sheet per form: columns = Field Key (stable), Label, Value (editable), Type, Required, Allowed Values, Unit, Guidance. Hidden `__meta` sheet with `returnId`, `returnConfigId`, `formTemplateId[]`, `formVersionId[]`, `templateSchemaVersion`, `generatedAt`, `fingerprint` (SHA-256 of the ordered field-key/type list per version). Data validation lists for enum/select/radio/boolean.
   - XML sample: `<RegulatoryReturn><Metadata/><Forms><Form id key><Field key type>sample</Field></Form></Forms></RegulatoryReturn>` derived from field metadata.
   - XSD: generated from same schema; nullable if we cannot map a type cleanly.
   - Filename: `<returnName>_<period>_v<versionShort>_template.<ext>`.
   - Insert row into `return_template_downloads` audit table and call existing audit RPC (`log_self_audit`) with correlation id.

2. `validate-return-upload` (multipart POST `{ returnId, file }`)
   - Auth + licensee access check.
   - Enforce MIME + extension + size + non-empty; reject encrypted/corrupt.
   - Parse XLSX/XLS via `npm:xlsx`; parse XML via `npm:fast-xml-parser` with entity expansion disabled, no DTD, bounded depth/size (XXE-safe).
   - Read embedded `__meta` (XLSX) or `<Metadata>` (XML); reject if it references a different return; **compare fingerprint** to the current resolved version — same fingerprint → OK; same version id but different fingerprint → compatibility check (added optional fields = warning; removed required, renamed key, changed type = blocking).
   - Map values by stable field key/id only (never by label).
   - Run per-field validation: required, type, decimal precision, date, boolean, min/max, length, regex, allowed values, unknown/duplicate keys, missing required, worksheet/form mismatch. Reuse existing `returnsValidation.ts` cross-field/business rules where applicable.
   - Persist upload record + parsed staged JSON in private storage; return `{ uploadId, summary, errors[], warnings[], mappedPreview }`. No writes to `return_form_data` yet.

3. `commit-return-upload` (POST `{ uploadId, strategy: 'replace'|'fill_blanks' }`)
   - Re-auth + re-validate the still-stored parsed payload against current resolved version (defence in depth).
   - Upsert into `return_form_data` per form, preserving `form_version_id`, using the same shape manual entry writes. Wrap all form writes in a single transaction via a SECURITY DEFINER RPC (`import_return_form_data`) so partial failure rolls back.
   - Never transition workflow/status; never call submission.
   - Audit every step (`return.template.downloaded`, `return.upload.received`, `return.upload.validated`, `return.upload.imported`, or `.failed/.cancelled`) via existing `logAudit` / `log_self_audit`.

All three functions: standard CORS, Zod input validation, structured error envelopes, correlation id header, `verify_jwt` default.

### Storage
- Private bucket `return-uploads` (create via `supabase--storage_create_bucket`), path `${licenseeId}/${returnId}/${uploadId}/<file>`. RLS: only owner licensee + service role.

### Migrations (new tables, all with GRANTs + RLS)
- `return_template_downloads` — id, return_id fk, licensee_id, form_version_ids uuid[], format, fingerprint, downloaded_by, downloaded_at.
- `return_upload_attempts` — id, return_id, licensee_id, uploaded_by, original_filename, mime, size_bytes, checksum, storage_path, form_version_ids uuid[], fingerprint, status (`received|validated|invalid|imported|cancelled|failed`), summary jsonb, errors jsonb, warnings jsonb, created_at, updated_at.
- `return_upload_imports` — id, upload_id fk, strategy, values_written int, forms_touched uuid[], committed_by, committed_at.

RLS on all three: licensee scoped via existing `can_current_user_access_licensee(licensee_id)`; internal roles read via `has_role`. Indexes on `(return_id)`, `(licensee_id, created_at desc)`.

### Frontend integration
- New hook `useReturnTemplate(returnId)` → invokes `generate-return-template`, streams blob, triggers download.
- New hook `useReturnUpload(returnId)` → orchestrates validate → preview → commit; exposes progress/errors.
- New component `src/components/returns/ReturnUploadPanel.tsx` inserted at the top of the tabs area in `ReturnDetail.tsx` (licensee view only — hidden for admin/regulator).
- Upload history component `ReturnUploadHistory.tsx` querying `return_upload_attempts` with RLS.
- After successful commit: `qc.invalidateQueries(['returns_filed', id])` and `['return_form_data', id]` so the existing form renderer picks up values.

### Libraries
- Deno side: `npm:xlsx`, `npm:fast-xml-parser`. No new frontend heavy deps (frontend uses fetch + FormData).

## Tests (Vitest, additive)
- Template fingerprint stability across generations for one version.
- Fingerprint changes when a form version publishes new fields.
- Old return pinned to old version keeps old template.
- Validators: valid xlsx/xls/xml, invalid MIME, oversized, missing required, wrong type, invalid enum, unknown key, duplicate key, wrong-return metadata, incompatible version.
- Import strategies: replace-all vs fill-blanks; cancel leaves data unchanged; rpc transaction rollback on failure.
- RLS: cross-licensee download / upload / history denied.
- XXE payload rejected.
- Audit rows produced for download, validate, import, cancel.
- Regression: existing `ReturnDetail` manual save/submit tests still pass.

## Rollout
1. Migrations + storage bucket.
2. Edge functions + RPC.
3. Frontend hooks + panel + history.
4. Tests, then remove `src/pages/UploadReturns.tsx` from routes if still linked (leave file if unused).

## Acceptance
All items in the request's acceptance list satisfied: dynamic per-version templates, backend parse/validate, blocking-error gating, explicit import into existing `return_form_data`, no auto-submit, real audit + history, RLS enforced, manual entry untouched.

## Open questions before I build
1. Max upload size — default **10 MB** OK, or set higher (spec says configurable)?
2. XSD generation — nice-to-have; ship in v1 or defer if type mapping is incomplete for some field types?
3. Should the panel also appear for admin/regulator viewing a return (read-only download only), or licensee-only?
