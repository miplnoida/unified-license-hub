# F7 — REGULATORY RETURNS: FINAL CERTIFICATION & FREEZE

Date: 2026-08-30
Protected F7-B baseline entering certification: `5968a3c78403a526d2cfc467ad84dc710bf7feb6`
F7-C delta start HEAD: `c68cfbfd6eb81f826c36aa10de2705f068c093b4`
Final protected HEAD at freeze: `fecb806f992136341ce67a8205a3c0116761235d`
Permanent certification gate: `npm run certify:f7c`
(`scripts/verify-f7c-route-retirement.mjs` + `scripts/certify-f7c.sql`)

## 1. Result

`certify:f7c` = **120 / 120 PASS**, executed twice with zero residue.

Sections certified: surface inventory (A), canonical spine (B), security (C), authority &
maker-checker matrix (D), empirical multi-persona lifecycle and F8 downstream acceptance
contract (E), currency & regulator provenance (F), F6 late-fee boundary (G), notification
contract (H), live-estate integrity (I), navigation & discoverability (J), operability (K),
empirical privileged direct-database immutability and decision-provenance integrity (L),
live surface classification register (M), canonical security coverage (N), route and
navigation classification plus retirement persistence (O), zero residue (Z).

## 2. Defects found and repaired during certification

1. **Regulatory history integrity (DATA-INTEGRITY, repaired).**
   `return_filing_version_immutable()` sealed only version identity/`submitted_at`. A decided
   version's lifecycle status and decision provenance could be rewritten (for example
   `ACCEPTED` → `DRAFT`). Repaired: a decided version (`ACCEPTED`/`REJECTED`/`SUPERSEDED`)
   can no longer be reopened or unsealed, its decision record, submitter and declaration
   details are permanent, and the only permitted onward transition is `ACCEPTED` → `SUPERSEDED`.
   Certified by E-11 and E-12.

2. **Privilege drift on returns configuration (SECURITY, repaired).**
   `return_definitions`, `return_definition_forms`, `entity_reporting_obligations` and
   `reporting_periods` still carried blanket `INSERT/UPDATE/DELETE` (plus `anon SELECT` and
   residual `TRUNCATE/REFERENCES/TRIGGER`) grants to the browser roles. Row level security
   denied those writes, so the drift was latent rather than exploitable, but it contradicted the
   governed-configuration contract. Privileges revoked; `service_role` retained.
   Certified by B-01 and C-05.

3. **Sealed submitted-version immutability (DATA-INTEGRITY, repaired).**
   Sealing protected only versions whose prior status was already a decision. A sealed
   `SUBMITTED`/`UNDER_REVIEW` version could still have its identity, submission and
   declaration provenance rewritten by a privileged direct-database write. Repaired: every
   sealed version — awaiting decision or decided — has immutable identity, submission and
   declaration provenance; unsealing, deletion and illegal lifecycle regression are refused.
   Certified empirically by L-01 … L-20.

4. **Decision status without a decision record (DATA-INTEGRITY, repaired).**
   The trigger permitted a sealed `SUBMITTED`/`UNDER_REVIEW` version to be flipped to
   `ACCEPTED`/`REJECTED` with no provenance, because provenance checks only ran when the
   provenance columns themselves changed. Repaired (migration
   `supabase/migrations/20260830101228_89340ae6-67ed-43d1-8e91-c8cfdfd41d1b.sql`):
   - `ACCEPTED` requires `accepted_by` **and** `accepted_at`, and may carry no rejection record;
   - `REJECTED` requires `rejected_by`, `rejected_at` and a substantive `rejection_reason`
     (≥ 10 trimmed characters, the same standard as `returns_review_filing`), and may carry no
     acceptance record;
   - `SUBMITTED`/`UNDER_REVIEW` may carry no fabricated decision provenance;
   - `SUPERSEDED` preserves whatever provenance it legitimately earned — an accepted version
     later superseded keeps its acceptance record, and a correction-superseded submitted
     version is never given a fabricated one.
   Certified by L-21 … L-30.

5. **Orphan route registry entries (SURFACE, retired and persisted).**
   `/admin/returns/definitions`, `/admin/returns/metrics`, `/admin/returns/migration` and
   `/returns/filings` were active in `sec_routes` with no application implementation. All four
   (and any navigation item targeting them) are deactivated by the same idempotent migration —
   history is retained, nothing is deleted. Certified by O-07 … O-10 for live state and by
   `scripts/verify-f7c-route-retirement.mjs` for repository reproducibility.

Two gate assertions were corrected without weakening coverage, because they mis-stated correct
product behaviour: the entity-currency override statuses of record are `ACTIVE`/`SUPERSEDED`
(F-02), and a filing legitimately emits one `return.submitted` event per submitted version —
original and amended (E-16). N-05 was corrected to test effective privilege with
`has_table_privilege()` rather than direct grant rows, because the service path inherits.

## 3. Decision-provenance and route registers

Live `return_filing_versions` census at freeze (103 versions):
`ACCEPTED 94`, `SUPERSEDED 6`, `SUBMITTED 2`, `DRAFT 1`.
Anomaly census — accepted without actor/time, rejected without actor/time/substantive reason,
awaiting-decision versions carrying decision provenance, contradictory acceptance+rejection
records: **0 in every class**. No historical row required interpretation, so no new
`DATA_REMEDIATION_REQUIRED` item arises from decision provenance.

Retired (inactive, history preserved): `/admin/returns/definitions`,
`/admin/returns/metrics`, `/admin/returns/migration`, `/returns/filings`.
Canonical replacements verified active: `/returns/queue`, `/returns/obligations`,
`/returns/calendar`, `/entity/returns/dashboard`, with the filing detail surface
`/returns/filings/:filingId` (prefix) intact and untouched by the retirement.

## 4. Downstream F8 acceptance contract (certified)

`tg_prudential_detect_on_acceptance` fires only on a transition into `ACCEPTED`.
Empirically certified: DRAFT (E-05), SUBMITTED (E-07), open RFI (E-08) and REJECTED (E-14)
raise no downstream signal; an accepted version signals exactly once (E-10); an accepted
amendment raises its own single signal and never re-signals the superseded version (E-13).
A downstream detection failure is recorded and never rolls back regulatory acceptance.
Governed `START_REVIEW`, `ACCEPT` and `REJECT` remain fully operational through
`returns_review_filing` with audit, notification and downstream behaviour intact
(L-11, L-19, L-20, L-29, E-09 … E-16).

## 5. Frozen-contract regression battery (all green, actual results)

| Gate | Result |
| --- | --- |
| certify:f7c | 120/120 ×2, zero residue |
| verify:f7b | 105/105 ×2 |
| verify:f6x-currency | PASS (multi-currency extension certified) |
| verify:enforcement-currency | PASS (penalty currency authority holds) |
| verify:f0c | 34 TESTED_PASS / 0 FAIL |
| verify:f1c | 96 TESTED_PASS / 0 FAIL |
| verify:f2b | 63 TESTED_PASS / 0 FAIL |
| verify:f3b | 38 TESTED_PASS / 0 FAIL |
| certify:f3c | 39 assertions PASS |
| verify:f4b | PASS |
| certify:f4c | 87 assertions PASS |
| verify:f5b1 | 51 PASS / 0 FAIL |
| verify:f5b2 | 44 PASS / 0 FAIL |
| verify:f5b3-establishments | 34 PASS / 0 FAIL |
| verify:f5b3 | 53 PASS |
| verify:f5b4 | 48 PASS |
| verify:f5b5x | 66 PASS (incl. surface parity) |
| certify:f5c | 73 PASS |
| verify:f6b | 38 PASS / 0 FAIL |
| certify:f6c | 80 PASS |
| verify:anon-execute | PASS (7 allowlisted, 0 defects) |
| verify:definer-guards | PASS |
| verify:hardening | 4 PASSED / 0 FAILED |
| verify:audit-contract | PASS (0 stale audit writers) |
| verify:license-terms | 7/7, 1 allowlisted legacy gap |
| verify:permission-refs | PASS |
| verify:service-completeness | PASS |
| verify:breadcrumbs | 0 uncovered routes |
| frontend | 143 files / 1312 tests PASS |
| typecheck | clean |
| production build | success |

## 6. Live estate at certification

24 return definitions, 38 definition forms, 72 entity obligations, 362 reporting periods,
93 filings, 103 versions, 55 validation results, 6 requests, 1,717 metric values.
Classification register: 46 Returns-relevant tables and 71 routines, every one carrying an
explicit disposition (ACTIVE CANONICAL / COMPATIBILITY BRIDGE / DEAD-RETIRED / DOWNSTREAM /
BCR / TRACK-B / DATA_REMEDIATION_REQUIRED); 16 tables form the active canonical spine.
Legacy `compliance_returns` and `returns_filed` hold 0 operational rows.
Integrity anomalies (orphans, missing regulator/currency snapshots, accepted filings without
an accepted version, broken supersession lineage, duplicate live filings, unknown statuses,
decision-provenance anomalies): 0.

## 7. Recorded boundaries (not F7 defects)

- One ambiguous historical entity identifier remains `DATA_REMEDIATION_REQUIRED`.
- One legacy receipt remains `DATA_REMEDIATION_REQUIRED` (F6 boundary).
- Baseline platform linter findings (security definer views, extension-in-public, broad
  definer EXECUTE surface, mutable search paths) remain pre-existing and platform-level;
  the anonymous-EXECUTE and definer-guard gates constrain the exploitable surface.
- F20 deployment/commissioning items remain outside F7; the published frontend must be
  re-published to match the certified schema.
- Live FX rate feed availability remains an operational precondition of the F6-X engine.
- F8 Prudential, F8A and Entity Network / UBO remain out of scope and uncertified.

## 8. Verdict

**F7 REGULATORY RETURNS CERTIFIED AND FROZEN**
