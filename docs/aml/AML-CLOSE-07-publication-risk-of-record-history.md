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

---

# AML-CLOSE-07A — Final Publication Closure

## AC. Publication-action contract defect
`supervisory_assessment_lifecycle_state` returned `PUBLISH_RISK_OF_RECORD.permitted=true` for stale and self-owned approved cases, while the publish command refused them. Fixed.

A second defect was found during this work. New assessments defaulted to `is_current=true`, so an approved-but-unpublished TEST case (01103) was briefly flagged current alongside the official one. This matters because `aml_entity_panel` picks its "current approved" assessment by that flag.

Fixed in migration 2 of 07A:
- the default is now `false`;
- publication clears `is_current` only on approved/closed rows, so drafts — including protected 00836/00838 — are never touched.

## AD. Shared eligibility authority
New `supervisory_assessment_publication_eligibility_internal(assessment, uid)` is the single evaluator.
- The lifecycle contract uses it (`permitted`, `reason_code`, `publication_allowed`, `publication_reason_code`).
- `supervisory_assessment_publish_internal` calls it under the entity/domain advisory lock and maps each code to its existing refusal.
- It checks state, decision, final rating, permission plus entity scope, preparer/owner/submitter, effective date and staleness.
- Execute access is revoked from PUBLIC, anon and authenticated. A direct call was refused (spec 16, action matrix).
- The UI reads only the server action. New safe labels: STALE_PUBLICATION, EFFECTIVE_DATE_REFUSED, NO_FINAL_RATING.

## AE. Action reason matrix (spec 16, server contract)

| Case | Result |
|---|---|
| Fresh approved F, supervisor | `true / OK` |
| F, officer | `false / PERMISSION_MISSING` |
| Published F, supervisor | `false / ALREADY_PUBLISHED` |
| Stale H, supervisor | `false / STALE_PUBLICATION`; Publish not enabled; refusal text shown; RPC `stale_publication` |
| Self-owned S (supervisor took ownership in the browser), supervisor | `false / MAKER_CHECKER`; Publish not enabled; RPC "cannot publish it" |
| Out-of-scope prudential supervisor, licensee | lifecycle refused or not permitted |
| Signed out | refused (HTTP ≥ 400) |

## AF. Different-rating browser journey
All via browser: facts, answers, calculation, submit, independent approval, publish. Inputs differ only in the TEST fact `AML_TECH_CERT_STR_COUNT`: 12 gives MODERATE, 60 gives MEDIUM_HIGH.

| Run | Step | Record | Movement |
|---|---|---|---|
| 1 | F | 01097 | MEDIUM_HIGH → MODERATE, IMPROVING |
| 1 | G | 01099 | MODERATE → MEDIUM_HIGH, DETERIORATING (movement `bd9f18d2…`) |
| 2 | F | 01100 | MEDIUM_HIGH → MODERATE, IMPROVING |
| 2 | G | 01102 | MODERATE → MEDIUM_HIGH, DETERIORATING (movement `59af5372…`) |

- Each movement's previous and new assessment IDs were asserted.
- Trend now follows `sup_risk_ordinal`; it used to record a generic CHANGED.
- Same rating still gives STABLE (source test).
- G approval alone left F official, and F's publication was preserved (F now SUPERSEDED).

## AG. As-of changed-rating proof
Checked 3 times, with identical results:

| As of | Result |
|---|---|
| Before F | The previous driving assessment |
| After F | F / MODERATE / GOVERNED_PUBLICATION |
| After G | G / MEDIUM_HIGH / GOVERNED_PUBLICATION |

## AH. Official-risk consumer recheck
After G was published, `aml_entity_panel`, `entity_supervisory_360`, `aml_portfolio_page` and `supervisory_monitoring_register` all returned MEDIUM_HIGH. The browser review tab showed "Current published risk: MEDIUM_HIGH".

Limitation: the consumer assertion checks that the rating appears in each response, not the exact field.

## AI. Complete publication-lineage census
**All 88** AML/CFT publications were checked, none sampled. For each:
- the assessment and decision exist;
- the decision is APPROVED and belongs to that assessment;
- entity, domain and rating match;
- the movement exists, with matching entity, domain, assessment and rating;
- there is no duplicate per decision;
- the assessment points back to the publication.

All mismatch counts were 0. The lineage RPC resolved 76 of 76 (run before the last 12 were added).

## AJ. Recomputed L4
**L4 = 0** on the complete set of 88.

## AK. TEST publication residue
All on the demo licensee only, TEST-labelled, not FSRA policy evidence:

| Record(s) | State |
|---|---|
| 01102 | Published, current |
| 01097, 01099, 01100 and earlier S15 records | Published, superseded |
| 01101 and 01103 | Approved, not published (stale or self-owned) |
| 01104 | Draft from a failed suite attempt; still has the old `is_current=true` default |

No withdrawal mechanism was invented.

Demo entity: exactly one `entity_risk_state` row, driven by its latest publication (01102). Of the approved assessments, only 01102 is flagged current; draft 01104 also still carries the flag.

## AL. Regression
- Vitest: 188 files / **1793/1793** passed.
- Publication source tests: 7/7.
- Spec 16 standalone: **8/8** (with fixtures).
- Full AML browser project (06–16): **37 passed, 1 failed, 5 did not run**. The failure was spec 16 F: the Recalculate button was not found after navigation, a timing issue (it passed standalone).
- Typecheck/build: through the platform build only.

## AM. Security scan
A fresh scan was not re-run in 07A, so no fresh scan result exists for this package. The last scan (`2026-10-06T02:30Z`) showed 0 critical, 28 warn and 31 info. The new helper is not executable by clients (AD).

## AN. Publish / live smoke
Publish requested after 07A. Live smoke for 07A has not been re-run.

## AO. Protected-state proof
- 00830 approved, `2026-09-12 14:11:29`.
- 00836 draft, `2026-09-28 11:37:09`.
- 00838 draft, `2026-10-03 17:35:00`, with 3 facts (unchanged).
- Legacy L3 (19) and L5 (24) records untouched.
- No email or SMS sent.

## AP. Final verdict
**CONDITIONAL PASS.**

All technical publication criteria (1–13, 16, 17) are proven. Open items:
- a clean full-suite AML run (14);
- a fresh security scan (15);
- live smoke after the 07A publish;
- TEST draft 01104's leftover current flag.

| Question | Answer |
|---|---|
| Contract refuses before the RPC? | YES |
| Stale shows permitted? | NO |
| Self shows permitted? | NO |
| Different-rating proven in the browser? | YES |
| Movement keeps before and after? | YES |
| Trend follows canonical order? | YES |
| As-of A then B? | YES |
| All publications rechecked? | YES (88) |
| L4 = 0? | YES |
| One current TEST risk? | YES |
| Legacy preserved? | YES |
| Protected unchanged? | YES |
| Fresh scan 0 critical? | NOT RE-RUN |

Stopped. AML-CLOSE-08 not started.

---

# AML-CLOSE-07B — Final Certification Closure

**Baseline (before testing):**
- Git HEAD `f632f4429`; 88 AML/CFT publications.
- Demo entity official risk: MEDIUM_HIGH, driven by 01121.
- Demo `is_current` rows: 01121 (approved, published) and 01104 (draft, unpublished).

## AQ. Fresh security scan
A new scan ran at 13:05 UTC on 2026-10-06, after 07A: **0 critical, 17 warn, 42 info** (59 findings).

If the publish gate still shows "60 critical", that is STALE SAVED SCAN STATE — DOES NOT MATCH CURRENT FRESH SCAN.

The migration linter separately lists 1806 findings that predate this package and are unchanged.

## AR. AML browser regression

| Run | Scope | Passed | Failed | Did not run |
|---|---|---|---|---|
| Full AML project (setup, 09–16, teardown), 43 tests | 40.7 min | 37 | 2 | 4 |
| Rerun of specs 12 and 16 | 16.2 min | 10 | 1 | 4 |

Failures in the full run:
1. Spec 12 E: the entity option in the new-assessment picker was not found in time.
2. Spec 16 ACTION MATRIX: one officer read of the lifecycle state returned HTTP 500.

Failure in the rerun: spec 16 G/H timed out waiting for the page to change after "Create assessment".

**No clean, uninterrupted full AML run was achieved.**

## AS. Previous Recalculate failure disposition
In the full run, spec 16 test F (the earlier "Recalculate not found" failure) passed. The earlier failure did not reproduce.

The 3 failures seen in 07B are each different and each passed elsewhere:
- spec 12 E passed in the rerun;
- G/H passed in the full run;
- the officer read reproduced as HTTP 200 for all 4 latest demo cases right afterwards.

No database errors appeared in the logs for that period. The pattern points to load and latency in the test environment, not a publication defect. However, the single HTTP 500 is unexplained, so this is not proven.

Per the brief, no test waits were weakened or lengthened.

## AT. Live publish verification (https://olras.mishainfotech.com)
Republished after the 07B consumer migration and test-only changes. The root page returned 200. Checked in a real browser with TEST cases only:

| Persona | Case | Result |
|---|---|---|
| Supervisor | Approved-not-published stale TEST cases 01143 and 01141 | Publish button shown **disabled**; "Current published risk: MODERATE" (the official state) |
| Officer | 01149, 01143, 01141 | Publish **disabled**; "Current published risk: MODERATE" visible |
| Licensee | All three cases | Access denied; no publish control or risk shown |

Reload kept the same state for all three personas.

**Not re-proven live:**
- an *eligible* fresh case showing an enabled Publish button. Proving it needs a new approval; it was proven in the preview by spec 16 F in the full run.
- a self-owned case. Proven in the preview by spec 16 S in the full run.

## AU. TEST 01104 disposition
**Retained as PRE-FIX TEST DATA ARTIFACT.** The lifecycle offers no governed withdraw or cancel action for drafts. It was not patched, deleted or fabricated.

| Check | Result |
|---|---|
| A. Drives `entity_risk_state` | No |
| B. Has a publication | No (0) |
| C. Status | Still DRAFT, no approval decision |
| D. Consumers | Fixed — see AW |
| E. New drafts start `is_current=false` | Yes: 0 unpublished current rows created after 12:30 UTC, including drafts 01148/01150 created by the browser |

## AV. Current-flag invariant census
These AML assessments are flagged current but have no publication.

| Group | Records | Count |
|---|---|---|
| **TEST residue** | 01104 (draft) | 1 |
| **Legacy approved, pre-publication** | 00130, 00353–00375 | 18 |
| **Non-TEST drafts / submitted / returned** | 00131, 00351, 00352, 00735–00739, 00836, 00837, 00838 | 11 |

The legacy approved records do drive `entity_risk_state` (22 of 22 approved current rows drive it, 0 do not).

The non-TEST drafts are all from before the fix (2026-09-02 to 10-03) and include the protected 00836/00838. Per the brief's "do not touch protected" and "do not mutate history" rules, their flags were **left as they are**. Instead, the readers were fixed (AW) so the flag carries no authority.

**Real/non-TEST unpublished rows with `is_current=true` is 11, not 0.** They are neutralised but still present.

## AW. Official-risk consumer protection
Migration `20261006130811` (no data changes) changes 4 readers:
- `aml_entity_panel`, `aml_portfolio` and `aml_overview_metrics` now find the official assessment through `entity_risk_state.driving_assessment_id`;
- `supervisory_reassessment_require` now links its default previous assessment to the driving assessment, replacing "any `is_current` row", which could pick draft 01104.

The cross-domain monitoring readers already filter to `status='approved'` and only use `is_current` for ordering. Legacy approved current rows all equal the driver, so drafts cannot surface there.

Source regression: 5 new checks in `amlClose07Publication.test.ts`. The `AGENTS.md` rule is updated.

## AX. Final publication census
**TOTAL PUBLICATIONS CHECKED = 104** (88, plus 16 created by the 07B reruns). Zero mismatches on:
- assessment;
- decision (approved, owned by the assessment);
- entity/domain;
- rating;
- movement;
- reverse assessment pointer;
- uniqueness per decision.

**L4 = 0.**

Demo entity: exactly 1 `entity_risk_state` row, MODERATE, driven by 01149, its latest publication.

## AY. Rating-change and as-of preservation
The latest demo movements, newest first:
1. MEDIUM_HIGH → MODERATE, IMPROVING
2. HIGH → MEDIUM_HIGH, IMPROVING
3. MEDIUM_HIGH → HIGH, DETERIORATING
4. MEDIUM_HIGH → MEDIUM_HIGH, STABLE

The 07A chains are unchanged (census AX).

The as-of browser test (spec 16 AS-OF) did **not run** in 07B, because it depends on the failed earlier test. It is only proven in 07A (3 identical calls).

## AZ. Protected-state proof
- 00830 approved, `2026-09-12 14:11:29`.
- 00836 draft, `2026-09-28 11:37:09`.
- 00838 draft, `2026-10-03 17:35:00`, with 3 facts.

All unchanged. Legacy L3/L5 records untouched. No email or SMS sent.

The STR_SAR_GOVERNANCE check was not re-proven in 07B: a query of `supervisory_policy_component` by that code returned 0, so its original source table was not re-identified.

## BA. Regression and final verdict

| Check | Result |
|---|---|
| Typecheck (`tsgo`) | Passed |
| Full Vitest | **188 files / 1798 of 1798** |
| Publication source tests | 12 of 12 |
| Build | Via platform |

**Verdict: AML-CLOSE-07 remains CONDITIONAL PASS.** Unmet criteria:
- **#2:** no clean full AML browser run;
- **#7:** 11 non-TEST unpublished pre-fix rows still carry `is_current=true` (harmless to readers, but present);
- the as-of check was not re-run in 07B;
- STR_SAR_GOVERNANCE was not re-proven.

| Final question | Answer |
|---|---|
| Fresh scan? | YES |
| Unexplained critical? | NO |
| Full AML run clean? | **NO** |
| Recalculate failure a real defect? | No evidence of one: it passed in the full run |
| Live smoke after publish? | YES (with the limits in AT) |
| Stale case shows an enabled Publish? | NO |
| Self-owned case shows an enabled Publish? | NO (preview proof) |
| 01104 can influence official risk? | NO |
| 01104 patched? | NO |
| New drafts start `is_current=false`? | YES |
| Real unpublished `is_current=true` rows? | **YES, 11 legacy, neutralised** |
| Consumers use canonical risk? | YES |
| Exactly one official risk? | YES |
| All publications checked? | YES (104) |
| L4 = 0? | YES |
| Trend history correct? | YES |
| As-of re-proven? | 07A only |
| 00830/00836/00838 unchanged, 3 facts? | YES |

Stopped. AML-CLOSE-08 not started.
