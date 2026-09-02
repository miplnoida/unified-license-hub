# DMS Foundation — Scan Lifecycle Correction & Re-certification

The DMS foundation UI stays **not accepted** until the items below are fixed and proven.

## Confirmed findings (verified by reading the code)

1. **Real control bypass.** `create_document_version_metadata` (migration `20260902103013…`) inserts into `public.file_uploads` with `scan_status` hard-coded to `'clean'`. The F0 guard trigger `file_uploads_scan_status_guard()` only forces `pending_scan` for a limited set of `current_user` values, and this RPC is `SECURITY DEFINER`, so the literal `'clean'` survives — a DMS upload is treated as security-released with no provider and no `scanned_at`.
2. **Detail page derives safety from the wrong field.** `DocumentDetail.tsx` line 93 computes `scanStatus` from the *version* row's `status`/`version_status` (values like `current`/`superseded`), not from the file's `scan_status`/`is_quarantined`. `dms_get_document` returns no file-level scan state at all, so the "File safety" badge and the unsafe-file banner are meaningless.
3. **Action enablement is only partly aligned.** Verify is gated on the broken `fileSafe` value; Accept, and the version download in the versions list, are not gated at all. Disposal (archive/soft-delete) does reflect legal hold. Server rules already exist and are correct: `dms_version_scan_clean`, `scan_not_clean` in `dms_verify`/`dms_accept`, `document_on_legal_hold` in `dms_archive`/`dms_soft_delete`.

## Fixes

### 1. Upload enters the governed scan lifecycle (backend, one migration)
- Redefine `create_document_version_metadata` so the `file_uploads` insert uses `scan_status = 'pending_scan'` with `scan_provider = NULL` and `scanned_at = NULL`. No other behaviour of the function changes (identity/dedup by storage path, group resolution, version numbering, audit logging all preserved).
- Add a defensive rule so a DMS-managed insert can never assert a release state: the guard trigger keeps its existing worker exemptions, and the RPC itself never supplies anything other than `pending_scan`. `file_upload_record_scan` stays the only path to `clean`/`legacy_unverified`. No F0 control is weakened or bypassed.

### 2. Authoritative scan state in the read model
- Extend `dms_get_document` to return a `current_file` object built from the current version's `file_uploads` row: `scan_status`, `is_quarantined`, `scan_provider`, `scanned_at`, plus a derived `released` flag matching the existing F0 definition (`scan_status IN ('clean','legacy_unverified','released','not_required') AND NOT is_quarantined`). Everything already returned stays unchanged (additive only).
- Update the register supplement in `useDmsDocuments.ts` to use the same `released` definition rather than a raw status string comparison.

### 3. Detail page uses those values
- `DocumentDetail.tsx` reads scan state exclusively from `current_file`; the version `status` field is used only for "current / superseded" labelling.
- Verify, Accept/Conditionally accept/Reject-accept and every version **Download** control are disabled with an explanatory tooltip whenever the file is not security-released; quarantined files show a distinct blocking banner.
- Disposal actions (archive, soft delete) remain disabled under legal hold with the hold explanation; restore is unaffected.
- Unknown/absent file state is treated conservatively as *not released*.
- UI disabling is presentation only — the server RPCs remain the enforcing authority.

### 4. Verification
New `scripts/verify-f8-dms-scan-lifecycle.sql`, rollback-scoped like the existing F0C/W1C harnesses, asserting:
- a DMS-registered document's file starts `pending_scan`, un-quarantined, no provider, not released;
- `dms_verify('verified')` and `dms_accept('accepted'|'conditionally_accepted')` raise `scan_not_clean` before a clean verdict;
- `dms_get_document` reports the authoritative `scan_status`/`is_quarantined`/`released` for the current file;
- a trusted `file_upload_record_scan(…, 'clean', '<provider>')` verdict releases the file and then verify/accept succeed;
- `suspicious`, `infected`, `quarantined` and `scan_error` verdicts leave the file un-released and verify/accept blocked again;
- legal hold continues to block archive and soft delete.

### 5. Residual, recorded not implemented
- **Unlink / relationship deletion remains out of scope.** No `dms_unlink_record` RPC exists; no client-side relationship deletion will be added. Recorded as an explicit residual in the DMS source inventory doc and surfaced in the UI as unavailable.

## Out of scope (untouched)
Application workflows, returns, complaints, payments, public registry publication, legacy `/documents` dual-read behaviour, ratio/group/CAMELS/PFMI logic, navigation structure.

## Checks to run and report verbatim
- `tsgo` typecheck and production build
- `scripts/verify-f0c-certification.sql` (scan/quarantine regression)
- new `scripts/verify-f8-dms-scan-lifecycle.sql`
- `src/test/documentVersioning.test.ts` and the DMS-related vitest suite
- backend security scan/linter, reporting any new findings
