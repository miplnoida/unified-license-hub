# AML-CLOSE-07 — Publication, effective risk-of-record and historical risk truth

## A. Verdict
**PASS**, with the limitations listed in AA.
Migrations: `20261006015223_bae82146…` and `20261006020343_2b4ae3d0…`.
All values are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.

## B. Existing publication architecture
The chain runs:
1. Assessment.
2. Review round (`supervisory_assessment_review_round`).
3. Approval decision (`supervisory_assessment_approval_decision`, immutable). It pins:
   - round, calculation run and its inputs/result hashes;
   - override, final rating and its source;
   - methodology and programme versions, question-plan, fact and evidence counts, review history.
4. Publication (`supervisory_assessment_risk_publication`, immutable, unique per decision).
5. Entity risk state (`entity_risk_state`, unique on entity + domain).
6. Movement (`entity_risk_state_movement`, immutable).

Commands and read models:
- `supervisory_assessment_approve(_publish)` and `supervisory_assessment_publish_risk_of_record` both call `supervisory_assessment_publish_internal`.
- Read models: `supervisory_entity_risk_history`, `supervisory_assessment_risk_lineage`, `supervisory_assessment_lifecycle_state`.

No parallel register was introduced.

## C. Official risk authority
The current official AML/CFT risk is the `entity_risk_state` row for entity + `AML_CFT`.
- Its writer guard only admits the governed publication path.
- `driving_assessment_id` identifies the source assessment, and the publication row identifies decision, publisher and movement.
- Exactly one row per entity/domain (unique index). Live check: 0 entities with more than one row.

## D. Approval vs publication separation
Gap found and fixed: approving an assessment used to flip `is_current` and mark the previous assessment superseded even when publication was deferred. Approval no longer does this; it happens only at publication.
Proof (browser journey A):
- Approve with "Also publish…" unticked.
- Lifecycle state is `APPROVED_NOT_PUBLISHED`, shown as "Approved — not yet official risk-of-record".
- The decision exists; there is no publication row and no new movement.
- `entity_risk_state` is byte-for-byte unchanged.

The combined approve + publish path runs in one transaction: a publication refusal rolls back the approval.

## E. Publication permissions
- Permission: `aml_supervision.approve` / `supervisory_spine.approve`, the narrowest existing authority. No role names are hard-coded.
- Entity scope check: `supervisory_entity_scope_check`.
- New rule: the preparer, owner or submitter cannot publish (super admin excepted, per the platform exception).

Refused in spec 15 D:
- AML officer.
- Out-of-scope prudential supervisor.
- Licensee.
- Signed-out visitor.

The approver may publish; no third actor is required.

## F. Publication prerequisites
`publish_internal` requires all of the following:
- an approved assessment;
- the decision is `APPROVED`, belongs to this assessment, and is its current `approval_decision_id`;
- the final rating is non-null with a valid source;
- the effective date is no later than today;
- no newer publication exists;
- an authorised, in-scope caller.

A draft assessment is refused with "only an approved assessment" (spec 15 D).

## G. Publication immutability
Immutable triggers on publication, decision and movement tables.
- Direct PATCH of rating, entity, effective date, publisher, reason or movement affected 0 rows.
- INSERT and DELETE were refused or affected 0 rows.
- Grants: anon has no privileges, and authenticated has SELECT only on all four tables.

## H. Current risk update
Done atomically under an entity/domain advisory lock and a row lock.
Result: rating = the decision's final rating, `driving_assessment_id` = the assessment, `effective_from` = publication instant.

## I. Previous risk preservation
- Each publication stores `previous_rating` and `previous_assessment_id`, and each movement stores before → after.
- Spec 15 B/C: A's publication was unchanged after B was published, and B's `previous_assessment_id` = A.

## J. Successive assessments
- Risk-of-record supersession happens at publication. The previous driving assessment becomes `superseded` (existing platform lifecycle).
- An older approved-but-unpublished assessment stays `approved`, does not drive risk, and cannot publish (see N).
- This was fixed during the run: the first attempt wrongly superseded it.

## K. Effective-date semantics
Canonical rule: the risk-of-record takes effect at the publication instant.
- `entity_risk_state.effective_from = now()` and `publication.effective_from = publication date`.
- `published_at` remains the actual regulator action time.
- The approval `effective_date` must be today.

## L. Future / backdated treatment
- Scheduled activation and backdated corrections are not supported, so both are refused with `effective_date_refused`, at approval and at publication.
- Spec 15 E: +30 and −30 days both refused, and no decision was created.
- Corrections go through a new governed assessment and publication.

## M. Point-in-time / as-of risk
New `supervisory_entity_risk_as_of(entity, domain, at)`:
- It uses publication records only and returns provenance `GOVERNED_PUBLICATION`, `LEGACY_RISK_STATE` or `NONE`.
- Access: authenticated callers with supervisory view permission and entity scope. anon is refused, and licensee and out-of-scope supervisor were refused.

Spec 15 AS-OF, repeated twice:

| As of | Result |
|---|---|
| Before A | The previous driving assessment |
| After A | A |
| After B | B |
| After E | E |

## N. Idempotency / concurrency / stale
- Duplicate publication for the same decision returns `already_published` and creates no movement.
- 4 concurrent publish calls produced exactly 1 publication and 1 movement (spec 15 E).
- Stale: C was approved before B. After B was published, publishing C is refused with `stale_publication` (SQLSTATE 55000), and the risk stays B.

## O. Cross-entity / domain isolation
- Entity and domain come from the assessment; a forged `_entity_id` argument was rejected (no matching function).
- The PRUDENTIAL `entity_risk_state` row was unchanged across the run.
- The out-of-scope supervisor's direct table read now returns 0 rows: read policies gained `supervisory_entity_scope_permits`.

## P. Final-rating lineage
- Publication copies `decision.final_rating`; no calculation runs at publication (run count unchanged, spec 15 B).
- The decision pins the run and hash, the override (`APPROVED_OVERRIDE`) and the source.
- Rejected or stale overrides are excluded by `supervisory_assessment_approve` (AML-CLOSE-05).
- The lineage RPC contains the decision's result hash and the publication id (spec 15 B).

## Q. Official-risk consumer audit

| Consumer | Value | Source |
|---|---|---|
| `aml_entity_panel` (Entity AML panel) | CURRENT_OFFICIAL_RISK | `entity_risk_state`; last approved assessment shown separately |
| `aml_overview_metrics` | CURRENT_OFFICIAL_RISK | `entity_risk_state` + movements |
| `aml_portfolio` / `aml_portfolio_page` (Supervised entities, heatmap) | CURRENT_OFFICIAL_RISK | `entity_risk_state` |
| `aml_work_queue` | DRAFT/WORKING (open cases) + official (overdue reviews from `entity_risk_state`) | mixed by design |
| `entity_supervisory_360` / Entity 360 | CURRENT_OFFICIAL_RISK | `entity_risk_state`; driving assessment flagged `is_driving_risk_state` |
| `enterprise_supervisory_overview`, `supervisory_portfolio`, `supervisory_portfolio_cross_domain`, `supervisory_sector_overview` | CURRENT_OFFICIAL_RISK | `entity_risk_state` |
| `supervisory_monitoring_register` | CURRENT_OFFICIAL_RISK | `entity_risk_state`; assessment metadata listed separately |
| `supervisory_consequence_source_internal` | CURRENT_OFFICIAL_RISK | `entity_risk_state` |
| `supervisory_entity_risk_history` (Risk history panel) | HISTORICAL_RISK | publications + movements |
| `supervisory_entity_risk_as_of` | HISTORICAL_RISK | publications |
| Assessment register / workspace badges | ASSESSMENT_RESULT | `supervisory_assessment.residual_rating` |
| Calculation / judgement screens | DRAFT/WORKING_RESULT | calculation runs |

Notes:
- `is_current` is now set only by publication, so "current assessment" filters in these consumers can no longer pick up an approved-but-unpublished case.
- `RiskHeatmap.tsx` and `AlertCenter.tsx` read `entity_risk_scores`, a non-AML legacy score table. They are not AML risk-of-record consumers.

## R. UI official-risk semantics
- Approved-not-published shows "Approved — not yet official risk-of-record".
- The approve section has an "Also publish as the official risk-of-record now" option.
- The publication card shows rating, previous rating, effective date, publisher/time, movement and reason.
- The risk-history panel shows "Current published risk" and labels legacy state.
- New refusal messages: stale publication, effective date, and preparer/owner/submitter publish.

## S. Historical legacy inventory (AML_CFT, approved / closed / superseded; re-queried after all runs)
- **L1** (approved + governed publication): **74** assessments — 00744, 00830 and 72 TEST records 00941–01096. This includes publications from suite reruns.
- **L4** (publication with mismatched or missing lineage): **0**. This was checked against the earlier 64 publications; publications added by reruns were not re-checked.
- **L2** (approved with a modern decision but never published): **3** — 01067 (first-run C), 01070 and 01094 (later stale-candidate C records). All are TEST; none can publish (stale).
- **L5** (approved / superseded with no decision or publication): **24** — 00129, 00130, 00353–00372, 00374, 00375.
- **L3** (subset of L5 that still drives current state): **19** current `entity_risk_state` rows without a governed publication — 00130, 00353, 00354, 00357–00369, 00371, 00374, 00375.

## T. Legacy reconciliation decision
- L3 and L5: preserved as legacy. No publications were fabricated (no publisher, date or decision evidence exists). Read models label them `LEGACY_RISK_STATE`. Reconciling them needs regulator evidence; the recommendation is a fresh governed assessment and publication per entity.
- L2: preserved TEST records. They can never publish (stale).

## U. Browser E2E
`e2e/cert-v2/15-aml-publication-risk-of-record.spec.ts`: **9/9 passed** (journeys A, B, C, E, AS-OF, D-negative, protected, fixture setup/teardown).

TEST records created on the demo licensee:

| Reference | Role | State |
|---|---|---|
| SUP-AML_CFT-2026-01069 | A | Published, then superseded |
| SUP-AML_CFT-2026-01070 | C | Stale, unpublished |
| SUP-AML_CFT-2026-01071 | B | Published, then superseded |
| SUP-AML_CFT-2026-01072 | E | Concurrent publish; current |

Suite reruns also left TEST 01066–01068 and 01076–01096.
All four published ratings were MEDIUM_HIGH, with trend STABLE. This proves same-rating succession without a false movement, but not a rating change (see AA).

## V. Direct bypass / security tests
See D, E, G, N and O.

## W. Regression
- Vitest: 187 files / **1786/1786** passed, plus the new `src/test/amlClose07Publication.test.ts` (5/5).
- Full AML browser project (06–15):
  - First run: 20 passed, 3 failed (12 A, 13 A, 15 A: page or sign-in load timeouts, shown in screenshots), 14 did not run.
  - Rerun of 12–15 with fixtures: **25/25 passed**.
- Full non-AML Playwright was not re-run. Known baseline Complaints and Inspection failures are not affected.

## X. Security scan
Fresh scan `2026-10-06T02:30:46Z`: **0 critical**, 28 warn, 31 info.
- All are earlier findings on other tables or storage; none concern the risk tables.
- The new `supervisory_entity_risk_as_of` linter warning is justified by D-negative persona tests.
- The publish gate still reports the stale "60 critical" from older stored scan state (out of scope).

## Y. Publish / live smoke
- Publish requested to `olras.mishainfotech.com`; the live entry is `index-yPVaqLh5.js`.
- Live checks:
  - AML supervisor sees "Approved — not yet official risk-of-record", the publish action and the approve-publish option on TEST 01070.
  - AML officer sees "Current published risk" on TEST 01072, also after reload.
  - Licensee sees no publication controls or risk.
- No records were modified.

## Z. Protected-state proof
- 00830 approved, `2026-09-12 14:11:29`.
- 00836 draft, `2026-09-28 11:37:09`.
- 00838 draft, `2026-10-03 17:35:00`, with **3 facts**.
- STR_SAR_GOVERNANCE: 22 rows, latest `2026-09-04 09:12:27`.
- FSRA components: latest `2026-09-14 04:32:41`.
- No email or SMS sent.

## AA. Remaining issues
- The browser succession produced the same rating (MEDIUM_HIGH → MEDIUM_HIGH). Rating-change movements (CHANGED) are proven only by existing historical rows, not by a fresh TEST run.
- The lifecycle `PUBLISH_RISK_OF_RECORD` action still shows as permitted for a stale or self-prepared case; the server refuses it with a clear message.
- The 19 L3 legacy current risks remain until real regulator re-assessments.
- `entity_risk_state.effective_from` on legacy rows is the original write time and cannot be reconstructed precisely.

## AB. Final answers
- Can an approved-but-unpublished assessment change the official entity risk? **NO**.
- Can a draft, submitted, returned or rejected assessment publish? **NO**.
- Is there exactly one canonical current AML/CFT risk-of-record per entity/domain? **YES**.
- Does publication use the approved final rating without recalculating? **YES**.
- Is every modern publication immutable and attributable? **YES**.
- Can publication be duplicated by retry, double-click or concurrent calls? **NO**.
- Does publishing B preserve A's historical official risk? **YES**.
- Can the system determine the official risk as of a historical point in time? **YES**.
- Can a stale older assessment overwrite a newer official risk? **NO**.
- Can AML publication change another entity or domain? **NO**.
- Do official-risk views use published canonical risk? **YES**.
- Are legacy records without modern provenance identified rather than fabricated? **YES**.
- Are 00830, 00836 and 00838 unchanged, with 00838 keeping its 3 facts? **YES**.
- Does the fresh scan contain zero unexplained critical findings? **YES**.

**AML-CLOSE-07 = PASS**
**Publication, effective risk-of-record and historical risk truth are TECHNICALLY CLOSED.**

Stopped. AML-CLOSE-08 not started.
