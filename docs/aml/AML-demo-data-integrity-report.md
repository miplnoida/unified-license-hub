# AML/CFT demonstration data — integrity report

Scope: the persistent AML/CFT demonstration dataset (24 `DEMO AML …` entities) audited
and corrected against the application-wide demo data integrity standard: every demo
record must be valid under the same relational, lifecycle, security, provenance and
audit rules as genuine application data, created only through the canonical
architecture, never by bypassing constraints, triggers or RLS.

| Artefact | Path |
| --- | --- |
| Seed (idempotent, append-only-safe) | `scripts/demo/seed-aml-demo-dataset.sql` |
| Cleanup | `scripts/demo/cleanup-aml-demo-dataset.sql` |
| Integrity verifier (behavioural, read-only) | `scripts/demo/verify-aml-demo.sql` |
| Dataset description | `docs/enterprise/suptech-convergence/AML-demonstration-dataset.md` |

Non-production only: seed, cleanup and rehearsal all refuse to run when
`public.is_production_environment()` is true. No live AML/CFT calculation policy was
created or activated (`supervisory_calculation_config` remains empty).

## 1. Baseline (before this wave)

| Measure | Value |
| --- | --- |
| Licensees total / `DEMO AML` / non-demo | 89 / 24 / 65 |
| `entity_risk_state` — demo / non-demo | 21 / 1 |
| `entity_risk_state_movement` — demo / non-demo | 23 / 2 |
| `supervisory_assessment` — demo / non-demo | 25 / 3 |
| `supervisory_assessment_risk_publication` (whole database) | 0 |
| `supervisory_assessment_approval_decision` (whole database) | 0 |
| `supervisory_assessment_question_plan` (whole database) | 0 |
| Live AML/CFT calculation policies | 0 |

Note for the release record: the preserved "canonical" AML risk counts carried through
AML-07…AML-LOCK-01 (22 risk states, 25 movements) are in fact **mostly demonstration
records** — 21 of 22 risk states and 23 of 25 movements belong to `DEMO AML` entities.
Only one risk state and two movements are non-demo.

## 2. Defects found and corrected

### D-01 Demo entities were not licence holders (corrected)

The 24 demo entities appeared as supervised institutions purely because
`licensees.status = 'active'`. None had a licence, a licence attachment, an identity
status or a licence term, while `public.entity_licenses` is the only authority for the
entity-to-licence relationship.

Correction (seed section 3c): 23 supervised demo entities now each hold exactly one
canonical licence (`FSRA-DEMO-AML-01 … 24`, licence type derived from the entity's
sector) attached through `entity_licenses` as the current primary attachment, with the
identity status set to *verified*. The live licence decision gate
(`enforce_license_decision_gate`) and the append-only original-term trigger stayed
enabled and accepted every row unchanged; each licence has exactly one current term
created by the platform, not by the script. `licensees.license_id` is deprecated and is
deliberately not written. Licence numbers are collision-guarded.

Case 21 (`DEMO AML 21 Morne Fortune Holdings Ltd`) is retained as a deliberate negative
control: it is the entity a governed determination placed outside the AML/CFT perimeter
and it holds no licence, proving the "not licensed" presentation. The seed and the
verifier both assert this.

### D-02 The seed was no longer idempotent (corrected)

The seed rebuilt itself by deleting the previous run's records, including
`entity_risk_state_movement`. That table is now protected by `ersm_immutable`
("a recorded entity_risk_state_movement cannot be delete — record a new decision
instead"), so re-running the seed aborted at the first delete.

Correction: the seed no longer attempts to delete any immutable record. It detects
whether immutable risk movements already exist for the demo entities; if so it refreshes
only the idempotent registry and licence fixtures and skips the governed pipeline
entirely, leaving the published dataset exactly as it is. When no immutable record
exists, the previous partial run is removed in full and the dataset is rebuilt
deterministically. Re-running the seed now succeeds and produces no duplicates
(verified: 24 entities, 23 licences, 23 attachments, 23 current terms before and after).

### D-03 The cleanup would have orphaned immutable records (corrected)

`entity_risk_state_movement` has no foreign key to `licensees`, is immutable, and is the
FK parent-side reference for reassessment requirements. The previous cleanup deleted
movements (now impossible), then the entities — which would have left permanent
movements pointing at entities that no longer exist. A rollback-only rehearsal
reproduced the failure:
`update or delete on table "supervisory_reassessment_requirement" violates foreign key
constraint "entity_risk_state_movement_requirement_id_fkey"`.

Correction: when immutable risk movements exist for the demo entities the cleanup now
refuses to run and removes nothing, rather than leaving a half-removed dataset. Verified
by rollback-only rehearsal: `DEMO AML cleanup refused: 23 immutable risk movement(s)
exist … nothing was removed.` — 24 demo entities intact afterwards.

## 3. Integrity verifier results

`scripts/demo/verify-aml-demo.sql` — behavioural, read-only, single transaction ending in
`ROLLBACK`, no text/regex inspection.

| Gate | Result |
| --- | --- |
| INTEGRITY-00 demo dataset present (24 entities) | PASS |
| INTEGRITY-01 canonical organisation party per entity | PASS |
| INTEGRITY-02 organisation profile per party | PASS |
| INTEGRITY-03 current primary licence per supervised entity | PASS |
| INTEGRITY-04 out-of-perimeter entity holds no licence | PASS |
| INTEGRITY-05 licence coherence (holder, status, validity, attachment date) | PASS |
| INTEGRITY-06 exactly one current licence term per licence | PASS |
| INTEGRITY-07 licence sector matches entity sector | PASS |
| INTEGRITY-08 active supervision assignment per entity | PASS |
| INTEGRITY-09 governed AML/CFT perimeter determination per entity | PASS |
| INTEGRITY-10 no orphaned governed references | PASS |
| INTEGRITY-11 assessment create/submit/approve/publish chronology | PASS |
| INTEGRITY-12 maker-checker (approver ≠ submitter) | PASS |
| INTEGRITY-13 risk of record derives from its approved assessment | PASS |
| INTEGRITY-14A publication carries its risk movement lineage | PASS |
| INTEGRITY-14B risk of record backed by an AML-07 publication decision | **FAIL** (21) |
| INTEGRITY-15 responses belong to the assessment question plan | **FAIL** (984) |
| INTEGRITY-16 audit entries exist for demo assessments (119) | PASS |
| INTEGRITY-17 derived AML overview metrics reconcile with canonical tables | PASS |
| INTEGRITY-18 no live AML/CFT calculation policy | PASS |

## 4. Open blockers (not bypassed, not faked)

### B-01 The dataset predates the AML-05/AML-07 governed ledgers

The demo assessments were approved through the pre-AML-07 path, so across the whole
database there are **zero** rows in `supervisory_assessment_question_plan`,
`supervisory_assessment_review_round`, `supervisory_assessment_approval_decision` and
`supervisory_assessment_risk_publication`. Consequences:

* 21 demo risk-of-record rows have no publication decision behind them (INTEGRITY-14B);
* 984 demo question responses exist with no materialised question plan (INTEGRITY-15);
* the question-plan, review, challenge, approval and publication screens have no
  demonstration data at all.

This cannot be repaired in place: the existing risk movements, and therefore the
existing risk of record, are immutable. The canonical remedy is additive — for each demo
entity, raise a **new** assessment through the current governed path (plan
materialisation → responses → submission → review round → maker-checker approval →
publication), which supersedes the earlier rating without rewriting history. That is a
separate seeding wave and was not attempted here, because doing it partially would leave
an incoherent dataset.

No shortcut was taken: no ledger row was inserted directly, no immutability guard was
bypassed, and no rating provenance was fabricated.

### B-02 The demonstration dataset is permanent

Once a governed AML/CFT risk movement exists for a demo entity, that entity and its risk
history can never be removed (immutable rows, plus FK parents on the immutable side).
Full reversibility is therefore architecturally impossible for this dataset, and the
cleanup script now says so instead of half-removing it. Approved exception, consistent
with the already-documented append-only intervention-event limitation.

### B-03 External policy blockers unchanged

DEC-01…DEC-08 remain unsigned; AMLH-09, CALC-05/06/09/11 and LINK-11 remain
policy/configuration dependent. No regulator policy was invented and no calculation
policy was created or activated in this wave.

## 5. Preservation

| Statement | Result |
| --- | --- |
| Non-demo licensees changed | NO (65 before and after) |
| Non-demo risk of record changed | NO |
| Risk history rewritten | NO (append-only guard never bypassed) |
| Existing demo governed content changed | NO (pipeline skipped on re-seed) |
| Methodology v1.0 / v1.1 changed | NO |
| Live calculation policy created or activated | NO |
| Operational or historical records deleted | NO |
| Immutability, RLS or constraint bypassed | NO |

## 6. Verdict

**DEMO DATA INTEGRITY — FAIL (2 open gates, both reported, none bypassed)**

The relational, licence, lifecycle, ownership, maker-checker, audit and derived-data
integrity of the demonstration dataset is now proven, and the seed and cleanup behave
correctly under the platform's append-only architecture. The dataset is **not yet
demonstration-complete**: it does not carry AML-05/AML-07 question-plan, review,
approval and publication provenance (B-01), which requires an additive governed
re-assessment wave before the demo can be declared ready.
