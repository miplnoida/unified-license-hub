# F5-B4 — Real Fit & Proper linkage for post-licensing services

Date: 2026-08-29
Final HEAD at closure: `6bd9feb56a9eb145ed3a19b5d8db73895fff150f` (working tree
carries the parity-migration hardening appendix listed below).

## 1. B4 reproof

`npm run verify:f5b4` → `scripts/verify-f5b4-fit-and-proper.sql`

| Run | Result |
|---|---|
| 1 | **48 PASS / 0 FAIL** |
| 2 | **48 PASS / 0 FAIL** — assertion-for-assertion identical |

Section C residue: 0 probe applications, individuals, assessments, orphan
provenance rows and orphan links.

`bash scripts/verify-f5b4-source-parity.sh` → **8/8 PASS**.

Live census (A-01, executed, not vacuous): **40 F&P service rows across 5
canonical definitions**.

Retained proofs (each on its own fresh filing + its own legitimate assessment +
its own explicit required link):

| Property | Assertions |
|---|---|
| exact canonical subject required | A-01..A-12, B-01..B-05 |
| explicit application link mandatory | B-06, B-13 |
| exact-person assessment/determination reuse only | B-07..B-10 |
| negative / expired / superseded determinations blocked | B-11, B-11a, B-11b |
| all subjects positive before effect | B-14, B-15 |
| Person A assessed → Person B effect refused | B-16, B-17 |
| aligned effect accepted | B-18..B-21 |
| subject context frozen after submission | B-26, B-27 |
| browser link / provenance tamper denied | B-22..B-25 |
| safe entity overview vs regulator detail | B-28, B-29 |
| F4 non-regression | B-30 |

Superseding a determination happens only under an audited
`fit_and_proper.assessment.edit_finalized` rule override; F&P immutability was
not weakened and no browser bypass exists.

## 2. Full F5 regression

| Gate | Result |
|---|---|
| verify:f5b3 | 53/53 |
| verify:f5b3-establishments | 34/34 |
| verify:f5b2 | 44/44 |
| verify:f5b1 | 51/51 |

Zero PRODUCT_GAP (`product_gap_entries=0`, `unclassified=0`) and zero synthetic
residue across all four gates.

## 3. Frozen upstream regression (single pass)

| Gate | Result |
|---|---|
| certify:f4c | 87/87 |
| verify:f4b | PASS |
| verify:license-terms | PASS |
| verify:coordination-lifecycle | 26/26 |
| verify:outbox-delivery | 28 passed / 0 failed, residue 0 |
| verify:audit-contract | PASS (0 stale writers) |
| verify:write-contract | OK (0 stale column references) |
| certify:f3c | 39/39, 0 FAIL |
| verify:f3b | 38 TESTED_PASS / 0 FAIL / 0 N-A |
| verify:f2b | 63/63 |
| verify:f1c | 96/96 |
| verify:f0c | 34/34 |

No frozen contract regressed.

## 4. Platform / security regression

| Gate | Result |
|---|---|
| verify:hardening | PASS (F5-B1 block 4/4) |
| verify:permission-refs | PASS (DEF-F3-C-01) |
| verify:anon-execute | PASS — 7 allowlisted, 0 defects |
| verify:definer-guards | PASS (F0-B7) |
| edge-authz | OK — user 47 / worker 28 / webhook 1 / machine 1 / public 7 |
| verify:breadcrumbs | 339 covered / 0 uncovered |
| verify:service-completeness | PASS |
| frontend vitest | 141 files / 1293 tests pass |
| typecheck | clean |
| build | OK (pre-existing chunk-size warning only) |

B4-specific posture:

- `anon` holds **zero** grants on `application_fp_links` and
  `post_license_fp_subject_links`.
- `authenticated` holds **zero** DML on either table. The residual
  `authenticated` INSERT/UPDATE/DELETE surface on the provenance table found
  during this pass was revoked (see §5); denial was already proven empirically
  by B-22..B-25 before the revocation, and remains proven after.
- No browser EXECUTE on `ensure_post_license_fp_links`,
  `post_license_fp_subjects`, `post_license_fp_subject_link_guard`,
  `protect_application_fp_subject_context`,
  `assert_post_license_fp_effect_alignment`.
- RLS enabled on both tables; provenance is append-only with a single one-time
  link stamp (`IMMUTABLE_RECORD`).
- No F4 behaviour change (certify:f4c 87/87, B-30).

Supabase linter reports 1,414 findings across 5 pre-existing baseline
categories (security-definer views, mutable search paths, public extensions,
definer-function EXECUTE breadth). Unchanged by B4; tracked as platform
baseline, not a B4 defect.

## 5. Migration / source status

`supabase/migrations/20260829120000_f5b4_fp_linkage_source_parity.sql` carries
the **byte-for-byte live definitions** of the eight B4 functions —
`ensure_post_license_fp_links`, `post_license_fp_subjects`,
`post_license_fp_readiness`, `post_license_fp_overview`,
`post_license_effect_plan`, `assert_post_license_fp_effect_alignment`,
`apply_post_license_effect`, `submit_application` — plus the F&P privilege/RLS
model, the trigger-function EXECUTE revocations, and the provenance
browser-DML revocation applied in this pass.

Direct replay through `psql` in this sandbox fails with
`permission denied for schema public` because the sandbox shell role lacks
CREATE on `public`. This is an **environment limitation, not a B4 product
defect**; grants were not weakened to enable replay. Actual fresh-reset /
migration-pipeline replay is carried to **F20**.

## 6. Scope statement

F9 remains **separately uncertified** and untouched by this pass. No F5-B5 /
B5X work was started.

## Remaining blockers

None.
