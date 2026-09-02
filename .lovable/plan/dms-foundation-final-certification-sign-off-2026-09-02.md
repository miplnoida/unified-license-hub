# DMS Foundation — Final Certification & Sign-Off

Certification only. No new features, no refactors, no later-phase work. The only code changes permitted are fixes for genuine DMS regressions or typecheck/production-build errors caused by the DMS work.

## 1. Certification suite (run and report verbatim)

| # | Check | Command / artefact |
|---|-------|--------------------|
| 1 | Typecheck | `tsgo --noEmit` |
| 2 | Production build | project build |
| 3 | F0C certification | `scripts/verify-f0c-certification.sql` |
| 4 | DMS scan lifecycle | `scripts/verify-f8-dms-scan-lifecycle.sql` |
| 5 | Document versioning | `src/test/documentVersioning.test.ts` |
| 6 | DMS Vitest | all DMS-related test files |
| 7 | RBAC catalogue integrity | `src/test/rbac/catalogueIntegrity.test.ts` |
| 8 | RBAC action coverage | `src/test/rbac/actionCoverage.test.ts` |
| 9 | Backend security scan + linter | security scan and database linter |

Every row is reported with exact counts, gate names, and the verbatim text of any remaining failure or warning. No "clean"-only summaries.

## 2. Scan-security re-certification (code + fixture evidence)

Confirm from the RPC definitions and the F8 fixture that:

- New DMS-managed files are created `pending_scan`, with no provider and no `scanned_at`.
- No DMS code path can set `clean` / `released` itself; only the existing trusted scan-verdict mechanism can release a file.
- The release predicate stays exactly `scan_status IN ('clean','released','not_required') AND NOT is_quarantined`.
- Quarantined, suspicious, infected, scan-error, and unknown/absent states are all treated as unreleased and block verify/accept.
- `dms_get_document.current_file` is the only file-safety source used by Document Detail; version lifecycle status (`current`, `superseded`) is never used as safety state.

Existing F0 scan/quarantine controls are read-only for this exercise — no weakening.

## 3. Governed UI action re-certification

For `/documents/registry/:documentId`, confirm each governed action has a `useCan('document_management', '<action>')` gate, a matching `data-rbac` marker, a governed service/RPC call, and no direct table mutation; and that RBAC coverage reports zero unguarded sites under `src/pages/documents/**`.

Behavioural confirmations: verify and acceptance unavailable before security release; download unavailable for unreleased/quarantined versions; archive and soft delete unavailable while a hold blocks disposal; restore follows its existing governed rule; server-side RPC enforcement remains authoritative regardless of UI state.

## 4. Legal-hold re-certification

Re-run the F8 hold gates proving hold placement syncs `document_groups.legal_hold_status`, archive and soft delete are blocked, releasing the final active hold updates document state and lifts disposal restrictions, and every hold transition is auditable.

## 5. Permission catalogue reconciliation

Reconcile live `document_management` permissions across backend `sec_permissions`, `src/lib/rbac/catalog.json`, active DMS UI actions, and `docs/rbac/permission-disposition.json`. Report them split into actively used in Foundation versus reserved for later phases. Reserved definitions stay.

## 6. Foundation architecture regression review

Confirm `document_groups` / `document_versions` / `document_action_logs` remain canonical with no parallel subsystem; one logical document keeps one canonical identity with many versions; two files from one multi-file field remain two logical documents; context linking creates relationships, not duplicate documents; `owner_id` has not been repurposed as regulated-entity identity; entity association uses the agreed existing identity; legacy sources still dual-read; existing upload components intact; secure-documents storage still private.

## 7. Regression boundaries

Confirm no unintended changes to registration, pre-/post-licensing, returns, complaints, payments, public registry publication, Fit & Proper, prudential/CAMELS/PFMI, navigation outside the approved DMS additions, or the existing secure-file download/scan architecture. Unrelated functional issues are not "fixed" to make the report look clean.

## 8. Pre-existing unrelated RBAC failures

The `actionCoverage.test.ts` failures in `ExecutiveAiWorkspace.tsx`, `ExecutiveSupervisoryDashboard.tsx`, and `OwnershipTreePanel.tsx` are re-checked to confirm they predate and are unrelated to DMS, then reported as "Pre-existing / unrelated — not a DMS Foundation blocker". Those modules are not modified. Any newly introduced failure is fixed.

## 9. Build errors

Both typecheck and production build are executed. DMS-caused errors are fixed. Any genuinely pre-existing unrelated error is reported with file, line, exact error, why it is unrelated, and whether it prevents the production build. Nothing is hidden or reclassified.

## 10. Residual — unlink

Confirm no `dms_unlink_record` or equivalent unreviewed RPC exists, no client-side relationship deletion exists, the UI does not present unlink as available, and the residual stays documented for a later phase. Unlink is not implemented.

## Final report format

A certification table (Check / Result / Evidence-Counts / Blocker?) covering all nine checks plus the DMS regression review, followed by exactly these sections: DMS Foundation blockers; Non-blocking residuals; Files changed during final certification; Final verdict — either `DMS FOUNDATION — CERTIFIED` or `DMS FOUNDATION — NOT CERTIFIED`. CERTIFIED is withheld if any DMS security, scan-lifecycle, RBAC, canonical-identity, production-build, or governed-action check is failing.
