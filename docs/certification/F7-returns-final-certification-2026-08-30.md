# F7 — REGULATORY RETURNS: FINAL CERTIFICATION & FREEZE

Date: 2026-08-30
Protected F7-B baseline entering certification: `5968a3c78403a526d2cfc467ad84dc710bf7feb6`
F7-C delta start HEAD: `c68cfbfd6eb81f826c36aa10de2705f068c093b4`
Permanent certification gate: `npm run certify:f7c`
(`scripts/verify-f7c-route-retirement.mjs` + `scripts/certify-f7c.sql`)

## 0. Code baseline vs certification evidence HEAD

| Kind | Commit | Meaning |
| --- | --- | --- |
| **Protected production/code baseline** | `fecb806f992136341ce67a8205a3c0116761235d` | The F7 frozen functional baseline: application code, migrations, database contract, gates and tests as certified. |
| Certification evidence HEAD (prior) | `fe306f2c8952e948fba0fedc048cc77e7028a2e8` | Documentation-only evidence commit. |
| Certification evidence HEAD (current) | this documentation-only commit completing the formal freeze record | Documentation-only evidence commit. |

Documentation commits after `fecb806f992136341ce67a8205a3c0116761235d` touch only files under
`docs/` and therefore do **not** modify the frozen F7 runtime/code contract. The protected code
SHA must never be replaced by a documentation-only commit: certification of behaviour attaches to
`fecb806f…`, and evidence heads only extend the written record. No certification run is repeated
for a documentation-only pass; the already executed results below remain authoritative.


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

## 8. GAP-F7-01 … GAP-F7-14 — final disposition

| Gap | Original finding | Remediation | F7-C evidence | Final disposition |
| --- | --- | --- | --- | --- |
| GAP-F7-01 | Returns lifecycle emitted no canonical notifications; filers and reviewers were told nothing on submission, review, decision or correction. | Lifecycle events routed through the canonical notification/outbox primitives with one event per submitted version and per decision. | Section H notification contract; E-09 … E-16; E-16 corrected to expect one `return.submitted` per submitted version. | CLOSED + CERTIFIED |
| GAP-F7-02 | Pre-canonical external filing spine (`/entity/returns/new`, `:id/fill`, `:id/view`) remained callable alongside the canonical workspace. | Legacy create/fill/view retired; old links resolve server-side to the canonical filing; legacy register is read-only. | Section A surface inventory; Section O route register and retirement persistence (O-07 … O-10); `scripts/verify-f7c-route-retirement.mjs`. | DEAD/RETIRED + CERTIFIED |
| GAP-F7-03 | Legacy analytics read `compliance_returns` / `returns_filed`, producing a second, divergent source of truth. | Analytics repointed at the canonical filing/version/metric spine; legacy tables hold 0 operational rows. | Section B canonical spine; Section I live-estate integrity; Section M classification register. | DEAD/RETIRED + CERTIFIED |
| GAP-F7-04 | No governed filing-extension capability; deadline relief was untracked. | Governed extension request/decision workflow with authority checks, audit and due-date effect. | Sections D (authority) and E (lifecycle); `verify:f7b` extension assertions. | CLOSED + CERTIFIED |
| GAP-F7-05 | Returns actions were not consistently written to the canonical audit contract. | All governed Returns routines write canonical audit rows with actor and timestamp; stale writers removed. | Section D/E audit assertions; `verify:audit-contract` PASS (0 stale audit writers). | CLOSED + CERTIFIED |
| GAP-F7-06 | Overdue detection and late-fee behaviour were partly client-derived and ownership was ambiguous. | Server-side overdue sweep (trusted-service only) raises overdue events; monetary late-fee policy is explicitly owned by F6. | Section G F6 late-fee boundary; overdue sweep authorization assertions in `verify:f7b`. | CLOSED + CERTIFIED |
| GAP-F7-07 | Duplicate/competing validation implementations across legacy and canonical paths. | Single canonical validation rule set (`return_form_validation_rules`) with server-side execution; duplicates retired. | Sections B and N (canonical security coverage incl. `return_form_validation_rules`). | CLOSED + CERTIFIED |
| GAP-F7-08 | Filing evidence/attachments were not governed or authorization-checked. | Governed evidence attachment with entity-scoped authorization and audit. | `verify:f7b` evidence-authorization assertions; Section C security. | CLOSED + CERTIFIED |
| GAP-F7-09 | Amendment semantics undefined: no supersession lineage, no immutability of superseded versions. | Canonical amendment creates a new version and supersedes the prior one; sealed versions are immutable, `ACCEPTED → SUPERSEDED` is the only onward transition. | L-01 … L-30 (empirical privileged direct-DB probes); E-13; Section I lineage integrity (0 anomalies). | CLOSED + CERTIFIED |
| GAP-F7-10 | No request-for-information (RFI)/correction loop between reviewer and filer. | `REQUEST_CORRECTION` transition with governed RFI records, blocking downstream acceptance while open. | E-08 (open RFI raises no downstream signal); Section D maker-checker matrix. | CLOSED + CERTIFIED |
| GAP-F7-11 | Returns review lacked an explicit workflow/maker-checker architecture; submitter could decide. | `returns_review_filing` enforces maker-checker segregation and decision provenance; database refuses decision status without coherent provenance. | Section D; L-11, L-19 … L-30; migration `20260830101228_…`. | CLOSED + CERTIFIED |
| GAP-F7-12 | Legacy RBAC naming (`compliance_*` style permissions) diverged from the canonical `returns_management` module. | Canonical permission naming enforced; references verified against the catalogue. | `verify:permission-refs` PASS; Section C/D authority assertions. | CLOSED + CERTIFIED |
| GAP-F7-13 | Analytics caches could serve stale/unreconciled return metrics. | Metrics derive from the canonical version spine with source assertions; cache paths retired or reconciled. | Section I (1,717 metric values, 0 anomalies); metric-source assertions in `verify:f7b`. | CLOSED + CERTIFIED |
| GAP-F7-14 | Dormant legacy Returns structures (tables/routines) with no disposition. | Every Returns-relevant table and routine carries an explicit disposition; dormant structures are locked down (no browser DML, no anon grants). | Section M register (46 tables, 71 routines); Section N coverage; Section C privilege revocation. | DEAD/RETIRED + CERTIFIED |

No gap is omitted, and no Critical or High Track-A product defect is carried under another
label: every Critical/High finding above is `CLOSED + CERTIFIED` or `DEAD/RETIRED + CERTIFIED`.

## 9. Business Configuration Required (BCR)

Genuine jurisdiction/regulator setup items. These are configuration, not product gaps; ordinary
master data is excluded.

| # | Configuration item | Owning module | Safe behaviour when unconfigured | Blocks F7 runtime? |
| --- | --- | --- | --- | --- |
| 1 | Real return definitions and definition forms (the regulator's actual return set) | F7 | Only certification/demo definitions exist; no obligations generated for unconfigured returns. | No — engine operates on whatever is configured |
| 2 | Obligation applicability rules (`reporting_obligation_rules`) per sector/licence class | F7 | No obligation is created; nothing is wrongly demanded of an entity. | No |
| 3 | Reporting calendar and due-date policy (period end + cut-off) | F7 | Periods are not generated; no due dates and no overdue events. | No |
| 4 | Extension policy (who may grant, maximum relief) | F7 | Extension requests require explicit governed decision each time; no automatic relief. | No |
| 5 | Validation thresholds for return forms | F7 | Validation runs structural checks only; no threshold breach is asserted. | No |
| 6 | Notification templates for Returns lifecycle events | F7 (notification primitives shared) | Events are still recorded in the outbox; delivery falls back to default content. | No |
| 7 | Late-fee monetary policy (amounts, tiers, grace) | **F6** | Overdue is still detected and recorded; no monetary charge is raised. | No |
| 8 | Entity reporting-currency approval mode | F6-X / F7 | Currency profile changes require explicit governed action; no silent rebase. | No |
| 9 | Mandatory return currency per definition | F7 | Filing uses the entity's resolved reporting currency snapshot. | No |
| 10 | Returns FX-date policy (which effective date a filing converts at) | F6-X / F7 | Conversion uses the filing's snapshotted effective date; no retro-restatement. | No |
| 11 | Regulator monetary configuration (base reporting currency per regulator body) | F6-X | Monetary display resolves through the fallback chain; no cross-regulator conversion is invented. | No |
| 12 | Regulator FX configuration (rate source, staleness tolerance) | F6-X | Conversion is refused rather than estimated when no effective rate exists. | No |

**BCR count = 12**

## 10. Track-B / Advanced Capabilities

Capabilities identified by discovery as deliberately out of the certified F7 scope. None blocks
F7 certification and none is a defect.

| # | Capability | Note |
| --- | --- | --- |
| 1 | XBRL ingestion/rendering | Not required by the certified filing model; canonical forms are the source of record. |
| 2 | SDMX exchange | External statistical exchange format; not part of the F7 filing spine. |
| 3 | Advanced taxonomy import | Beyond the certified Excel/form-definition import path. |
| 4 | External filing gateway integrations | Machine-to-machine submission channels; canonical filing API remains internal. |
| 5 | Advanced consolidated analytical processing (group/consolidated return analytics) | Canonical metric values are certified; advanced consolidation is deferred. |

**Track-B count = 5**

## 11. Data Remediation

Historical data debt, kept strictly separate from product defects.

| Item | Owner | Status |
| --- | --- | --- |
| Ambiguous historical regulator-scoped entity identifier — 1 row; correct regulator body cannot be inferred and will not be guessed. | F2 (upstream/shared) | DATA_REMEDIATION_REQUIRED |
| Historical F6 receipt `RCT-2026-000038` minted before governed receipt issuance. | F6 (upstream/shared) | DATA_REMEDIATION_REQUIRED |
| Enforcement certification fixtures carrying JMD values under an XCD base configuration (5 rows). | F6-X / Enforcement | REMEDIATED — not outstanding debt |

**Outstanding Data Remediation count = 2** — both upstream/shared (F2: 1, F6: 1).
**F7-owned outstanding historical data issues: 0.** The live Returns estate has zero
decision-provenance, lineage, snapshot or status anomalies (Section I), so F7 itself carries no
unresolved historical data debt.

## 12. Certification scorecard

| Dimension | Score / 5 | Evidence |
| --- | --- | --- |
| Business/config completeness | 4.7 | All 14 discovery gaps dispositioned; 12 BCR items remain genuine regulator configuration with safe unconfigured behaviour, so the module is complete but not yet jurisdiction-populated. |
| RBAC / authority | 4.9 | Section D authority matrix; `verify:permission-refs`, `verify:anon-execute` (7 allowlisted, 0 defects), `verify:definer-guards` PASS. |
| Security | 4.85 | Section C + N: RLS on every canonical table, no anon grants, browser DML revoked, trusted-service-only sweeps. Held below 5 by pre-existing platform-baseline linter findings outside F7. |
| Workflow integrity | 4.9 | Governed `START_REVIEW`/`ACCEPT`/`REJECT`/`REQUEST_CORRECTION`; illegal lifecycle regression refused (L-01 … L-30); Section E lifecycle E2E. |
| Maker-checker | 4.9 | Submitter cannot decide; decision provenance is one-time and immutable (D matrix, L-11, L-19, L-20, L-29). |
| Entity isolation | 4.9 | Entity-scoped RLS and evidence authorization; cross-entity read/write probes refused (Sections C, E). |
| Data integrity | 4.9 | Sealed-version immutability and decision/provenance coherence enforced in-database (L-01 … L-30); 0 live anomalies in every class. |
| Audit / provenance | 4.9 | Canonical audit writes on every governed action; `verify:audit-contract` PASS (0 stale writers); currency/regulator snapshots provenanced. |
| Lifecycle E2E | 4.9 | Multi-persona empirical lifecycle E-01 … E-16 including RFI, amendment, supersession and the F8 downstream acceptance contract. |
| Navigation / operability | 4.8 | Sections J, K, O; 4 orphan routes retired and persisted; `verify:breadcrumbs` 0 uncovered routes. |
| Testing / regression | 4.9 | `certify:f7c` 120/120 ×2 zero residue, `verify:f7b` 105/105 ×2, entire F0→F7 frozen chain green, 143 files / 1312 tests, clean typecheck, successful build. |

**Overall F7 = 4.7** — set by the weakest material dimension (business/config completeness at
4.7, reflecting the 12 outstanding regulator configuration items), not by an arithmetic average.
All required thresholds are met: RBAC 4.9 ≥ 4.8, Security 4.85 ≥ 4.8, Workflow integrity 4.9 ≥ 4.8,
Maker-checker 4.9 ≥ 4.8, Entity isolation 4.9 ≥ 4.8, Data integrity 4.9 ≥ 4.8, Audit/provenance
4.9 ≥ 4.8, Lifecycle E2E 4.9 ≥ 4.8, Testing/regression 4.9 ≥ 4.8, Overall 4.7 ≥ 4.7.

## 13. Final certification summary

- Critical Track-A gaps: **0**
- High Track-A gaps: **0**
- Unexplained production surfaces: **0**
- Orphan active routes: **0**
- Frozen regression failures: **0**
- `certify:f7c`: **120/120 ×2** (zero residue)
- `verify:f7b`: **105/105 ×2**
- Frontend: **143 files / 1312 tests** PASS
- Typecheck: **clean**
- Production build: **success**
- BCR count: **12**
- Track-B count: **5**
- Outstanding data remediation: **2** (both upstream/shared; F7-owned = 0)
- F20 deployment/commissioning items remain **outside F7**.

## 14. Freeze contract

`fecb806f992136341ce67a8205a3c0116761235d` is the **F7 PROTECTED FROZEN CODE BASELINE**.

Any future change touching F7 must re-run the corresponding gates before it may land:

| Change area | Required re-verification |
| --- | --- |
| F7 lifecycle or shared Returns primitive | `verify:f7b` + `certify:f7c` |
| Regulator / currency identity | `verify:f6x-currency` (F6-X) + F7 regression |
| Accepted-return semantics | F7 certification + downstream F8 acceptance regression |
| Notification primitives | notification/outbox gates + F7 regression |
| Navigation | route / navigation / breadcrumb gates + F7 certification coverage |

## 15. Next module

Next planned module: **F8A — Entity Network / Relationship Graph / UBO / Director / Common
Address Intelligence** (not developed here). Then: **F8 — Prudential Supervision**.

## 16. Verdict

**F7 REGULATORY RETURNS CERTIFIED AND FROZEN**

