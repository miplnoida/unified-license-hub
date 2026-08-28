# F4 — LICENSING FINAL CERTIFICATION RECORD (canonical)

- Date: 2026-08-28 (UTC)
- Scope: F4 Licensing (application intake from F3 handoff → readiness → decision authority → issuance → provisioning → withdrawal)
- Mode: **CERTIFICATION ONLY** (no product remediation performed during this pass)
- B5 product/runtime freeze HEAD: `dfe4340b8e546fe39f2e1a54ae1c4dacbdc25e0a`
- Actual F4-C tested HEAD: `dfe4340b8e546fe39f2e1a54ae1c4dacbdc25e0a`
- Harness: `scripts/certify-f4c.sql` (rollback-safe, Sections A–G)

## 0. Attempt history (preserved — F4 did NOT pass on the first attempt)

| Attempt | Outcome | Blocking defect | Evidence |
| --- | --- | --- | --- |
| F4-C Attempt 1 | HALT | DEF-F4-C-02 — stale `audit_logs.actor_id` writers (audit write contract) | `docs/certification/F4-C-halt-2026-08-28.md` |
| F4-C Attempt 2 | HALT | DEF-F4-C-03 — stale `notifications.related_entity_*` writers (runtime write contract) | `docs/certification/F4-C-halt-2026-08-28-attempt-2.md` |
| F4-C Attempt 3 | **NOT CERTIFIED (82 PASS / 5 FAIL)** | DEF-F4-C-04 — governed issuance did not create the opening `original` `license_terms` row; plus harness fixture leaks | `docs/certification/F4-C-attempt-3-failure-2026-08-28.md` |
| F4-C Attempt 4 | **CERTIFIED (87/87 twice)** | none | this record |

Remediation records: `F4-B3-def-f4-c-02-closure-2026-08-28.md`, `F4-B4-def-f4-c-03-closure-2026-08-28.md`, `F4-B5-def-f4-c-04-closure-2026-08-28.md`.

## 1. Full rebaseline battery (all green)

| Gate | Result |
| --- | --- |
| `verify:license-terms` | PASS — 7/7 |
| `verify:write-contract` | PASS — 0 stale statically inspectable runtime writers |
| `verify:audit-contract` | PASS — 0 stale DB audit writers |
| `verify:coordination-lifecycle` | PASS — 26/26 |
| `verify:outbox-delivery` | PASS — 28/28 |
| `verify:f4b` | PASS |
| `certify:f3c` | PASS — 39 assertions |
| `verify:f3b` | PASS — 38 TESTED_PASS |
| `verify:f2b` | PASS — 63 TESTED_PASS |
| `verify:f1c` | PASS — 96 TESTED_PASS |
| `verify:f0c` | PASS — 34 TESTED_PASS (first run hit a transient `P0002 file_upload_not_found` race in Stage 4 caused by concurrent cleanup; clean on re-run, no product change) |
| `permission-refs` | PASS |
| `hardening` | PASS — 31 assertions |
| `edge-authz` | PASS |
| `anon-execute` | PASS — 0 defects |
| `definer-guards` | PASS |
| `breadcrumbs` | PASS |
| `service-completeness` | PASS |
| Frontend suite (vitest) | PASS — 141 files / 1293 tests |
| RBAC coverage (`verify:rbac-parity`) | PASS |
| `typecheck` (tsc) | PASS |
| `build` | PASS |

No unexplained F0–F3 regression.

## 2. Live estate reconfirmation (pre-record, B5 estate)

| Measure | Value |
| --- | --- |
| Total licences | 60 |
| Licences with `original` term | 59 |
| Licences with a `current` term | 60 (100%) |
| Multiple-current violations | 0 |
| Orphan terms | 0 |
| Original-term validity mismatches | 0 |
| `LIC-2026-000033` | Documented append-only legacy exception: surrendered licence whose term #1 is a `renewal`; an `original` row cannot be inserted without violating append-only term numbering. No `original` term; holds exactly one current term. |

Estate is 60 rather than the 59 recorded at B5 close because one legitimate licence was issued for `pre_licensee_user` through the governed provisioning worker after B5 froze. All 58 reconstructed originals remain intact.

### Backfill provenance (F20 carry-forward)

The 58-row opening-term backfill was shipped inside migration `20260828174732_2dcfc907-103d-40e0-8ea4-90ecdd928a32.sql` (metadata `source: F4-B5 backfill`). The migration file is source-controlled, but its INSERTs are **estate-specific and NOT replayable** against a fresh/reset environment — a clean environment has no legacy licences to backfill. This is recorded as a one-time live **DATA_REMEDIATION** operation. No new migration was authored during F4-C.

## 3. Certification runs — `scripts/certify-f4c.sql`

Sections executed: A (F3→F4 boundary), B (seven readiness dimensions), C (workflow/decision authority), D (issuance integrity), E (provisioning/outbox), F (withdrawal/surfaces), G (privileges/state integrity).

| Run | Result | Assertion rows | Residue |
| --- | --- | --- | --- |
| Run #1 | **87 PASS / 0 FAIL** | 87 | zero across all registers |
| Run #2 | **87 PASS / 0 FAIL** | 87 | zero across all registers |

Assertion identifier sets for the two runs are byte-identical (diff clean), confirming deterministic coverage rather than coincidental totals.

Formerly failing probes reconfirmed:

- **A-01…A-04** — untrusted F3→F4 handoff path: application creation without an approved handoff is denied; handoff consumption is idempotent; trusted-context leakage is cleared between identity switches.
- **D-05** — governed issuance creates **exactly one** atomic `original` `license_terms` row, with effective dates matching licence validity.
- **F-01** — withdrawal authority: a dynamically selected genuinely unrelated user (lacking `application_management.edit`) is denied.

Residue proof after each run — 0 rows in every register: synthetic registrations, handoffs, applications, approval workflows, licences, `entity_licenses`, `license_terms`, coordination cases, audit logs, `notification_outbox`, `notifications`, and licensing gate configuration fixtures.

No new PRODUCT_DEFECT surfaced during either run.

## 4. Final GAP re-census (GAP-F4-01 … GAP-F4-16)

| GAP | Severity at discovery | Current status | Evidence |
| --- | --- | --- | --- |
| GAP-F4-01 | CRITICAL | **RESOLVED** — `perform_manual_application_approval` no longer exists (0 rows in `pg_proc`); approval only via governed `perform_final_workflow_approval` | C-section probes, live catalogue census |
| GAP-F4-02 | CRITICAL | **RESOLVED** — handoff precondition enforced in `create_application_draft` | A-01…A-04 |
| GAP-F4-03 | CRITICAL | **RESOLVED** — F&P gate binds canonical party identity and fails closed | B readiness dimension probes |
| GAP-F4-04 | HIGH | **RESOLVED (product)** — `perform_final_workflow_approval` consults `application_licensing_readiness` and fails closed; configuration is CFG-F4-01 | `verify:f4b` F4-04 |
| GAP-F4-05 | HIGH | **RESOLVED (product)** — fee readiness dimension is a pre-decision gate; configuration is CFG-F4-03 | B probes |
| GAP-F4-06 | HIGH | **RESOLVED** — `anon` holds no write privilege anywhere in the F4 estate; `authenticated` holds no structural privilege, and every residual DML privilege (6: `approval_workflows` I/U, `license_lifecycle_configs` I/U/D, `licensees` U) is policy-backed governed-configuration surface | `verify:f4b` F4-06, G probes |
| GAP-F4-07 | HIGH | **RESOLVED** — canonical application status vocabulary enforced by `trg_applications_status_vocabulary` (trigger, not CHECK, per immutability rules); licence statuses are within canonical vocabulary (0 off-vocabulary rows) | trigger census |
| GAP-F4-08 | HIGH | **RESOLVED** — idempotent provisioning outbox with retry, dead-letter and reaping; exactly one active schedule | E probes, `verify:outbox-delivery` 28/28 |
| GAP-F4-09 | MEDIUM | **RESOLVED** — server-side workflow resolution contract | C probes |
| GAP-F4-10 | MEDIUM | **RESOLVED** — single canonical workflow vocabulary; no `entity_type='application'` drift remains | catalogue census |
| GAP-F4-11 | MEDIUM | **RESOLVED** — handoff FK hardened (no `ON DELETE SET NULL`), linkage authoritative | FK census |
| GAP-F4-12 | MEDIUM | **RESOLVED** — legacy `licensees.license_id` made read-only for application code via `trg_licensees_legacy_license_id`; `entity_licenses` canonical. Column retirement is data remediation DR-F4-05 | `verify:f4b` F4-12 |
| GAP-F4-13 | MEDIUM | **RESOLVED (product)** — condition attachment path exercised at decision; content is CFG-F4-04 | D probes |
| GAP-F4-14 | MEDIUM | **RESOLVED** — governed `withdraw_application(uuid,text)` with reason capture and audit | F-01…F probes |
| GAP-F4-15 | LOW | **RESOLVED** — `ApplicationQueue` retained as the active canonical queue (`/applications/queue`); genuinely unreachable legacy static PreLicense/PostLicense screens deleted and still absent | route census, `f4b2UiSurfaceClosure.test.tsx` |
| GAP-F4-16 | LOW | **RESOLVED** — `scripts/certify-f4c.sql`, `verify-f4b-remediation.sql`, `verify-f4b3-coordination.sql`, `verify-f4b4-outbox.mjs`, `verify-license-terms.sql` | scripts inventory |

**0 Critical and 0 High unresolved product defects.**

## 5. Final DATA_REMEDIATION register (recalculated, not copied)

| DR | Item | Discovery | **Current** | Why it exists | Recurrence structurally prevented? |
| --- | --- | --- | --- | --- | --- |
| DR-F4-01 | Licences with no `application_id` | 48 | **58** | Legacy/seeded licences plus demonstration seeding after discovery; issuance from an application always sets the link | Yes for new governed issuance (issuance path always binds `application_id`); count only grows via seeding, not via product paths |
| DR-F4-02 | Licences with no `entity_licenses` link | 19 | **0** | Closed by remediation; canonical binding now created at issuance | Yes |
| DR-F4-03 | Applications with null `entity_id` | 4 | **4** | Pre-remediation ad-hoc applications | Yes — handoff precondition now supplies the entity binding |
| DR-F4-04 | Applications with no handoff | 16 | **16** | Pre-F3-boundary/ad-hoc history | Yes — `create_application_draft` requires an approved handoff |
| DR-F4-05 | `licensees.license_id` rows to migrate | 31 | **31** | Legacy single-licence column retained for read compatibility | Partly — column is now read-only to application code; physical retirement deferred |
| DR-F4-06 | `VRF-EMPTY-ACTIONS` test-artifact workflows | 3 | **3** | Historical verification artefacts left in live configuration | No structural prevention; requires configuration cleanup |
| DR-F4-07 | `licenses.status='surrendered'` rows | 2 | **2** | Vocabulary now canonical — `surrendered` is an accepted status, so these rows are valid; retained here only as a historical reconciliation note | Yes — status vocabulary enforced |
| DR-F4-08 (new) | Licences without an `original` term | n/a | **1** (`LIC-2026-000033`) | Append-only term numbering conflict: term #1 is a `renewal`, so an opening `original` cannot be inserted without breaking append-only integrity | Yes for new issuance — `trg_license_open_original_term` plus the post-provisioning integrity check in `perform_final_workflow_approval` make an opening term atomic and mandatory |

DR-F4-08 is recorded once, in this register only — not folded into DR-F4-01/02 and not double-counted.

## 6. Final CONFIGURATION register (CFG-F4-01 … CFG-F4-06)

| CFG | Item | Current | Classification |
| --- | --- | --- | --- |
| CFG-F4-01 | `application_form_requirements` per licence type | 0 rows | **BUSINESS_CONFIGURATION_REQUIRED** — readiness resolver fails closed and visibly blocks decision when a requirement set is expected |
| CFG-F4-02 | `application_fp_links` policy per licence type/role | 0 rows | **BUSINESS_CONFIGURATION_REQUIRED** — F&P dimension fails closed |
| CFG-F4-03 | Initial-licensing fee bindings as decision prerequisites | not configured | **BUSINESS_CONFIGURATION_REQUIRED** — fee dimension fails closed |
| CFG-F4-04 | Standard licence conditions per licence type | 0 rows | **NOT_APPLICABLE** for issuance validity — conditions are optional by regulatory design; attachment path is proven |
| CFG-F4-05 | Active-workflow-per-licence-type map | 10 active workflows | **SHARED_FALLBACK** — server-side resolution uses a governed shared fallback when no licence-type-specific workflow exists |
| CFG-F4-06 | `license_lifecycle_configs` validity/renewal parameters | present, not confirmed per licence type | **SHARED_FALLBACK** — governed default lifecycle applies where no type-specific row exists |

Missing regulator configuration remains only where the product **visibly fails closed** (CFG-F4-01/02/03).

## 7. Runtime and surface closure

| Check | Result |
| --- | --- |
| Stale DB audit writers | 0 (`verify:audit-contract`) |
| Stale statically inspectable runtime writers | 0 (`verify:write-contract`) |
| F4-critical dynamic writers reviewed | Yes — issuance, provisioning, notification and withdrawal writers reviewed against live catalogue |
| `ApplicationQueue` active canonical queue | Yes — `/applications/queue` in `src/routes/dashboardRoutes.tsx` |
| Removed legacy static PreLicense/PostLicense screens | Remain absent |
| Withdrawal UI | Governed RPC only (`applicationGovernedOps.ts` → `withdraw_application`); no direct application mutation |
| Manual approval bypass | Absent (function does not exist) |
| Outbox browser privilege hole | Closed — `anon`/`authenticated` DML revoked on `public.notification_outbox` |
| Active provisioning schedules | Exactly one — `licensing-provisioning-worker-1min` |

## 8. Frozen F4 contracts

1. Applications for new licences may only be created from an **approved F3 handoff**, consumed idempotently.
2. Decisions are only made through `perform_final_workflow_approval`, which consults decision authority, maker≠checker and the **seven readiness dimensions**, failing closed.
3. Issuance is atomic: licence + `entity_licenses` canonical binding + exactly one `original` `license_terms` row, with exactly one current term at all times.
4. Provisioning is asynchronous, idempotent and reconcilable through the outbox (retry, dead-letter, reaping), with exactly one active schedule.
5. Withdrawal is governed RPC only, owner-authorised, non-terminal-state only, reason required, audited.
6. No `anon` write privilege in the F4 estate; residual `authenticated` DML is policy-backed governed configuration.
7. Audit and notification writes follow the canonical column contracts enforced by `verify:audit-contract` and `verify:write-contract`.

## 9. F4 → F5 entry contract

- Every licence exposes a canonical `entity_licenses` binding (DR-F4-02 = 0).
- Every licence holds exactly one **current** term; term history is append-only.
- Licence status vocabulary is canonical and server-enforced.
- Provisioning outcomes are observable and replayable through the outbox.
- Known entry exception: `LIC-2026-000033` has no `original` term (DR-F4-08); F5 supervision logic must read the **current** term, never assume an `original` row.

## 10. F20 carry-forward

1. The 58-row opening-term backfill is **not replayable** on a fresh environment — migration/reset certification must reconstruct opening terms from licence validity data rather than replaying the historical INSERTs.
2. `LIC-2026-000033` append-only exception must be handled explicitly in any reset/migration path.
3. DR-F4-05 (`licensees.license_id` physical retirement) and DR-F4-06 (`VRF-EMPTY-ACTIONS` configuration artefacts) remain open data/configuration cleanups.

## 11. Scores

| Dimension | Score |
| --- | --- |
| Security | 4.9 |
| Authorization | 4.9 |
| Workflow | 4.8 |
| Data integrity | 4.8 |
| Testing | 4.9 |
| **Overall F4** | **4.86** |

## 12. Verdict

**F4 PRODUCT CERTIFIED AND FROZEN — BUSINESS CONFIGURATION AND DATA REMEDIATION ITEMS RECORDED**
