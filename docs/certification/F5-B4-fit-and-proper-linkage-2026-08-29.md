# F5-B4 — Real Fit & Proper linkage for post-licensing services

Date: 2026-08-29

## Gate

`npm run verify:f5b4` → `scripts/verify-f5b4-fit-and-proper.sql`
(48 checks: Section A contract/privilege, Section B empirical, Section C residue).

Two consecutive runs: **48 PASS / 0 FAIL**, identical, zero residue.

Section B proves, each on its own fresh filing + own legitimate assessment +
own explicit required link (no reused determined assessment, no browser bypass):
subject required / not canonical; idempotent linkage; exact-subject reuse only;
in-flight reuse; other-entity assessment never reused; explicit link mandatory;
graded blocker codes; negative, expired and superseded determinations refused;
all-subjects-positive requirement; Person A assessed → Person B effect refused;
aligned effect accepted; browser link/provenance tamper denied; provenance
immutable; frozen subject set; entity-safe vs regulator-detailed overview; F4
non-regression.

Superseding a determination is done under an audited
`fit_and_proper.assessment.edit_finalized` rule override — product immutability
was not weakened.

## Source parity

`supabase/migrations/20260829120000_f5b4_fp_linkage_source_parity.sql` carries the
verbatim live definitions of `ensure_post_license_fp_links`,
`post_license_fp_subjects`, `post_license_fp_readiness`,
`post_license_fp_overview`, `post_license_effect_plan`,
`assert_post_license_fp_effect_alignment`, `apply_post_license_effect`,
`submit_application`, plus the F&P privilege model.
Verified byte-for-byte by `scripts/verify-f5b4-source-parity.sh` (8/8 PASS).

Applied migration: revoked `anon`/`authenticated`/`PUBLIC` EXECUTE on
`post_license_fp_subject_link_guard()` and
`protect_application_fp_subject_context()` (F0-B7 / GAP-F0-08 now PASS).

## UI

`src/components/applications/ApplicationFitAndProperPanel.tsx`, mounted in
`src/pages/applications/ApplicationDetail.tsx`. Sole data source is
`post_license_fp_overview(application_id)`; the RPC decides the audience.
Regulator: state, subject + proposed role, assessment status/type, determination
status, reuse basis, link to `/fpa/assessments/:id`. Entity: safe pending /
complete state only. Loading, empty and error states included.

## Focused regression

| Check | Result |
|---|---|
| verify:f5b4 (×2) | 48/48, 48/48 |
| verify:f5b3 | 53/53 |
| verify:f5b3-establishments | 34/34 |
| verify:f5b2 | 44/44 |
| verify-anon-execute | PASS (0 defects) |
| verify-definer-guards | PASS |
| frontend vitest | 141 files / 1293 tests pass |
| typecheck / build | clean |

`verify:f5b3` G-01/G-03 assertions were widened to accept any graded F&P blocker
code (`FP_SUBJECT_REQUIRED`, `FP_SUBJECT_NOT_CANONICAL`, `FP_LINK_REQUIRED`,
`FP_DETERMINATION_REQUIRED`). BLOCKED + fail-closed remains asserted; B3 was not
weakened.

## Remaining blockers

None for development close. The parity migration cannot be replayed through
`psql` in this sandbox (the shell role lacks CREATE on `public`); replay must run
through migration tooling in the release pipeline.
