# AML/CFT policy completion and same-day E2E execution plan

Date: 2026-10-03 (America/New_York).
Repository: miplnoida/unified-license-hub.
Reviewed baseline: 89352bf5fbc2a47b2b0ca7227492e02d2f0e4e0c.
Scope: regulator AML/CFT SupTech, Track A. No separate AML transaction-monitoring product; no Track B features.

## Evidence and release truth

This is an execution specification, not a completed certification. Do not promise same-day enterprise completion before the preflight establishes remaining effort and access. Previous maturity ranges are planning judgments, not measured completion; use the coverage register below instead.
Recorded R2F/R2G results are historical evidence. R2F records 19/19 chain gates, R2G records 179 files/1752 test passes. Neither is a rerun on this release.
An active FSRA package and a governed demonstration chain exist. Calculation values remain demonstration values, and DEC-01 through DEC-08 require regulator decisions.
Six tracked policy families remain configuration-only: sector overlay, fact, source binding, materiality, dashboard and notification. Existing related capabilities must be preserved.
The latest inspected CI run 36316172130 failed frontend and skipped dependent jobs. Logs returned unavailable; cause is unknown.
Current session has GitHub source access but no connected SQL runner or confirmed TEST frontend/persona session. No live E2E result is claimed.
Focused authorization-evidence classifier regression: 10/10 passed on Node 24.19.0. These are harness tests, not live AML tests.

## Operating boundaries

Implement in an isolated branch. Deploy migrations and exercise mutating journeys only in a confirmed TEST/staging environment. Keep LIVE unchanged.
Reuse canonical entity, evidence, supervisory action, workflow, SLA, notification and audit services.
Do not adopt the reference methodology, supply invented regulator parameters, use privileged identities as business-persona evidence, disable guards or rewrite historical conclusions.
Keep regulator approval separate from technical completion. Where decisions are absent, use explicitly labelled reference/demo policy; no production activation.
Capture before/after inventories. Treat fixture cleanup as governed work; do not delete immutable audit/publication records.
External notices require the configured TEST recipient controls. Do not deliver to real regulated institutions during certification.
Audit and traces can contain confidential data and authentication headers. Restrict access and redact secrets before sharing evidence.

## Stage 0: preflight (must finish before business writes)

1. Confirm baseline commit and any intervening changes. Record branch, tested commit, migrations, deployed frontend/edge versions, regulator, jurisdiction and TEST identity.
2. Establish the TEST URL and backend project identity. Confirm they point to the same TEST deployment. Use approved runtime secret management; never put passwords, database credentials or tokens in this document.
3. Confirm officer, independent approver, policy maker/checker, read-only, out-of-domain, external-licensee and cross-regulator personas. Verify permissions and assignment/perimeter conditions; do not infer roles from account names.
4. Reuse the existing AML demonstration population after inventory. Select at least six representative entities spanning available sectors and low/high/override/deficient/legacy/event cases. Use separate disposable fixtures for mutations and a unique run identifier.
5. Preserve SUP-AML_CFT-2026-00830 as a historical baseline. Do not mutate its approved conclusion merely to rerun tests.
6. Capture assessment/dimension/answer counts, policy bindings, published risk, movements, publications, plans, action links, SLA stages, notifications and audit references. Capture canonical-row fingerprints excluding justified volatile fields.
7. Inspect each SQL verifier before execution. Several create fixtures and run governed writes inside a rollback transaction; rollback does not guarantee reversal of external effects. They are not read-only merely because they end with ROLLBACK.
8. Confirm CI runner/toolchain availability, job execution, test recipient gates and recovery procedure. Missing access is BLOCKED, not PASS.

Preflight exit: known target, viable fixtures/personas, preserved baseline and no unexplained historical discrepancy.

## Stage 1: authoritative policy and readiness

Use the existing policy package/resolver. Extend it only where required. Govern Draft -> Review -> Approved -> Active -> Retired.
Approval and activation are distinct controls. Activation validates required executable components, dependencies, compatible versions, regulator ownership, approval, effective dates and unambiguous applicability.
Define explicit optional/required sections. Do not block old supported packages simply by introducing new optional component types.
Store the package/component basis and applicability inputs on the assessment. Server writes, scheduled jobs and exports consume the governed basis. No independent client calculation or guessed defaults.
Changes affect new work according to effective policy. Existing in-flight work follows an explicit migration decision with audit and recalculation/reapproval requirements. Historical approved work is not silently changed.

| Business section | Definition required | Runtime consumers / acceptance |
|---|---|---|
| Mandate/scope | jurisdiction, regulator, sectors, exclusions, obligation sources | eligible entities and reporting perimeter agree |
| Methodology | dimensions, questions, answers, mappings, instructions | adopted version drives forms and calculation |
| Sector/applicability | core/conditional/enhanced rules, unknown-input handling | executable question plan with inclusion/exclusion explanation |
| Programme | routine/thematic/event/follow-up triggers and authority | creation, review cycles and work queues agree |
| Facts | type, unit, period, denominator, missing value, source authority | canonical fact validation and officer exceptions agree |
| Source bindings | approved return/evidence mappings and correction rules | traceable fact proposals; no silent overwrite of judgments |
| Evidence/sampling | required basis, quality, sample design, exemptions | missing evidence blocks; approved exception independently traceable |
| Judgment | answer criteria, rationale, uncertainty, contradiction disposition | server validates judgments and approval readiness |
| Calculation | weights, bands, aggregation, floors/caps, missing data | deterministic recommendation reproducible from pinned inputs |
| Materiality | approved thresholds and sector context | precedence resolved; same inputs produce same result |
| Overrides/approval | permissible changes, maker/checker, publication authority | same-user and out-of-scope actions refused |
| Response | required/recommended/permitted/prohibited decisions | required plan cannot be bypassed; no automatic sanction |
| SLA/calendar | stage durations, timezone, holidays, pauses/extensions | canonical SLA engine yields independently expected dates |
| Monitoring | review schedule/events, reassessment authority | jobs expose due work; events do not auto-change risk |
| Effectiveness | validation evidence, approval, adverse-outcome handling | ineffective/inconclusive outcomes reach an accountable decision |
| Communications/reporting | recipients, templates, confidentiality, metrics | intended delivery and screen/export/backend reconciliation |
| Access/records | scope, segregation, retention, audit, recovery | real permission refusals and preserved/recoverable records |

Readiness UI: one AML administration launchpad into existing services, showing ownership, version, adoption, effective date, dependency errors, unresolved decisions and configuration-only components. Do not label configuration-only as runtime-ready.

## Stage 2: close development gaps in dependency order

Work item D01: complete policy validation, compatibility and transition behavior. Demonstrate no active-package ambiguity and no silent fallback.
D02: finalize v1.1 fact semantics (87 requirements), source authority and eight materiality parameters. The regulator signs decisions; MIPL implements. Reference approval is not regulator adoption.
D03: implement sector-overlay consumption through existing applicability/question-plan machinery. Test different sectors and unresolved triggers; preserve existing draft rebuild restrictions.
D04: implement fact/source-binding consumption. Include period alignment, staleness, provenance, source correction, proposal vs judgment and audited overrides.
D05: implement dedicated materiality consumption and rule precedence with existing calculation. Do not introduce a second scoring engine.
D06: implement AML notification policy consumption through shared communications, including governed recipients, retries, failures and confidential counts.
D07: implement dashboard policy consumption using the existing canonical portfolio model. Add actionable pending/overdue/stale/ineffective indicators with drill-through.
D08: verify evidence-quality, sampling and contradiction runtime against the adopted design; develop only missing behavior.
D09: verify distinct CFT/TF obligations and local/national-risk coverage. Existing sanctions/PEP/BO/STR dimensions are not absent. PF is included only if mandated.
D10: census the recorded STR_SAR_GOVERNANCE linkage issue. Require semantic-owner decision before an audited idempotent relink; preserve original code, judged ratings, rationale and history.
D11: complete scheduled-job observability, SLA/calendar validation and adverse-outcome decision queues. Existing BUSINESS_DAYS behavior uses working-day chunks; confirm the intended regulator semantics before changing it.
D12: address AML-relevant shared settings persistence/readiness: security, calendar, retention/recovery. Static UI settings are not evidence of operational controls.
D13: fix confirmed defects found during testing, resolve CI, rerun affected checks and downstream journeys.

For every item record code/migration, configured policy, consumers, positive/negative tests, rollback/transition implications and remaining decisions. Do not replace these with a screen inventory.

## Stage 3: frontend/backend E2E matrix

Run actual UI actions as actual personas. Pair with backend state and audit, never service-role impersonation as a substitute. UI unit tests and static checks do not certify live E2E.
Use existing evidence/answer/calculation fixtures to independently predict results before running the application.

| ID | Journey / risk exercised | Required evidence |
|---|---|---|
| E01 | create, review, approve and activate valid TEST policy | package state, independent identities, audit, all consumers |
| E02 | invalid/incomplete/foreign-regulator package | explicit server refusal, no active-state change |
| E03 | policy changes during draft and after approval | transition rule; frozen historical basis and conclusions |
| E04 | create assessment with sector/programme scope | entity, methodology, package and plan agree |
| E05 | conditional/enhanced/unknown/NA scope | expected questions, explicit rationale; unknown not scored low |
| E06 | source-derived fact and officer correction | units/period/source match; audited decision, reproducible input |
| E07 | stale/missing/contradictory facts | explicit exception/blocking/disposition; no hidden default |
| E08 | restricted or cross-entity evidence | no content/title/reference leakage; invalid linkage refused |
| E09 | deficient evidence and independent exception | readiness blocks then valid exception enables intended step |
| E10 | judgments, rationale and sampling | response/dimension/question IDs align; applicability respected |
| E11 | complete independently calculated rating cases | application result matches approved-policy expected result |
| E12 | insufficient data / noncalculable / boundary values | reason codes; no fabricated LOW risk |
| E13 | permitted and prohibited overrides | approval separation; bounds; operative risk provenance |
| E14 | submission and independent approval | illegal transitions/direct mutations refused |
| E15 | publication and retries/concurrent requests | one publication per identity; preserved audit; no duplicate movement |
| E16 | later independent assessment with same rating | correct distinct history, no accidental retry suppression |
| E17 | required plan and prohibited deferral | policy decision, canonical links and refusal audit |
| E18 | findings, examination, remediation, enforcement handoff | correct authority and lineage; no unintended auto-enforcement |
| E19 | SLA across weekend/holiday/timezone | independently expected start/due/end; permitted pause/extension |
| E20 | overdue escalation and retry/failure recovery | actual job run, queue, recipient and no duplicate consequence |
| E21 | review due and event consideration | canonical risk basis, consideration decision, authorised reassessment |
| E22 | duplicate reassessment requests | converged requirement; no duplicate active assessment |
| E23 | effective/partial/ineffective/inconclusive remediation | evidence, independent approval and accountable follow-up |
| E24 | notifications, retry and TEST recipient gate | correct recipient scope, delivery outcome, no external test send |
| E25 | portfolio/export/as-of/filters/paging | UI/export/backend totals reconcile; disclosed caps and provenance |
| E26 | officer, read-only, out-of-domain, external, cross-regulator | explicit permission/scope evidence with controlled positive fixture |
| E27 | direct API and table mutation bypass | forbidden state/write refused; no data change |
| E28 | transient failure, retry and double-click | idempotence and no orphan/stuck work |
| E29 | legacy/NOT_GOVERNED assessments | explicit classification; no forced historical rewrite |
| E30 | final integrity, confidential audit and recovery | reconciled census, approved deltas, restore evidence in isolated target |

A generic HTTP error is not permission proof. 401/expired credentials are authentication failure; missing RPC, missing fixture, validation failure and outage must fail/block the relevant test. The strengthened AML classifier checks this distinction, but controlled fixture and positive-path evidence are still required.
A successful empty external read proves little without a known visible positive fixture. Pair denied/empty reads with officer-visible data and targeted scope checks.
Force calculation fixture extremes only in TEST. Expected risk is established by adopted policy and independently computed inputs; never declare an institution intrinsically high risk from a demonstration seed.

## Stage 4: data-integrity checks before and after

I01 regulator/domain/entity/perimeter identity on every relation.
I02 package/methodology/version and component snapshots present where governance requires.
I03 assessment-dimension-question-answer canonical links, no cross-methodology mismatch.
I04 evidence/fact links reference the correct entity, question, period and authorised source.
I05 stored recommendation reproducible; approval and operative publication distinguished.
I06 approved/frozen values change only through allowed governed lifecycle.
I07 one publication identity; correct movements for retry vs later assessment.
I08 one expected consequence/action/requirement; no duplicate or orphan links.
I09 schedule/SLA stage source and timing match policy; pause audit intact.
I10 notification outbox/delivery/retries correspond to one intended business event.
I11 UI and exports reconcile with canonical backend and scope.
I12 baseline historical hashes and records preserved; test deltas fully explained.

Run SQL with the intended read permissions. Permission-limited census is not a full population census. For restricted audit/integrity checks use an authorised audit identity, separately from business persona tests.
Schema tests in a disposable local database may require a database owner to create fixtures; this is infrastructure setup, never evidence that an officer is authorised.
Scripts that print FAIL rows may still exit zero. Inspect every result table and require zero failed/blocked mandatory gates; command exit code alone is insufficient.

## Existing verification resources

Inspect and reuse:
- scripts/verify-pcomp-r1-effective-policy-spine.sql
- scripts/verify-pcomp-r2a-evidence-policy.sql through scripts/verify-pcomp-r2g-risk-history.sql (separate files)
- scripts/verify-aml-assessment-structural-integrity.sql
- scripts/verify-aml-dimension-linkage.sql
- scripts/verify-aml-evidence-fact-readiness.sql
- scripts/verify-aml-calculation-policy-engine.sql
- scripts/verify-aml-assessment-review-risk-publication.sql
- scripts/verify-aml-supervisory-consequence-linkage.sql
- scripts/verify-aml-risk-monitoring-reassessment.sql
- scripts/verify-aml-portfolio-reporting.sql
- scripts/verify-aml-supervisory-outcome-effectiveness.sql
- scripts/uat-aml-end-to-end.sql
- e2e/cert-v2/06-aml-demo-dataset.spec.ts (existing smoke/persona coverage, not full lifecycle certification)

The reviewed structural SQL sets ON_ERROR_STOP off; override by changing an audited TEST copy or wrapping results with a failure-aware runner before treating it as a gate. Do not blindly execute every verifier on an operational database.
Run the following static verifiers from a complete checkout:
node scripts/verify-aml-monitoring-frontend-boundary.mjs
node scripts/verify-aml-outcome-effectiveness-frontend-boundary.mjs
node scripts/verify-aml-portfolio-frontend-boundary.mjs
node scripts/verify-aml-review-publication-frontend-boundary.mjs
node scripts/verify-aml-supervisory-consequence-frontend-boundary.mjs

Focused classifier regression (Node >=22.18, tested on 24.19):
node --test scripts/aml/authorization-evidence.test.mjs

Use the repository's supported dependency/toolchain for existing Vitest, typecheck and build. Investigate the CI configuration before prescribing a lockfile change; missing logs do not establish the failure cause.
Existing browser smoke invocation after TEST preflight and runtime secrets are configured:
npx playwright test e2e/cert-v2/06-aml-demo-dataset.spec.ts --project=chromium
Do not run this command locally merely because Playwright is installed: the baseURL and backend defaults must first be checked against TEST.
Extend the browser suite to cover E01-E30; API-only execution does not replace the requested frontend journey.

## Same-day sequencing and stop conditions

First checkpoint: preflight and measured backlog. Confirm which D items are actual defects, already-working features, regulator decisions or missing assurance. Estimate effort from that inventory, not from earlier maturity percentages.
Second checkpoint: implement foundational policy/fact/sector/materiality changes; run targeted checks before downstream development.
Third checkpoint: notifications/reporting/operational completion; rerun affected dependencies.
Fourth checkpoint: run E01-E30 and I01-I12, fix defects and repeat affected/full critical journeys.
Final checkpoint: freeze tested commit, rerun required checks and produce release record.

Keep time available for defect correction and retesting. If development exceeds the available window, complete a coherent tested slice and report the remaining gates; do not compress required E2E testing to obtain a same-day label.
Stop mutations if target environment is unclear, baseline integrity fails, policy resolution is ambiguous, a permission bypass succeeds, uncontrolled external delivery is possible, or approved historical data changes unexpectedly.
Do not call regulator-policy-pending work production-ready. A demonstration package can obtain a technical TEST verdict with that limitation explicit.

## Report and completion measurement

Each gate records: run ID, tested commit/deployment, policy version, entity/persona, expected result, UI evidence, backend result, before/after delta, audit reference, PASS/FAIL/BLOCKED/NOT_RUN, defect/decision owner and timestamp.
Coverage: executed applicable gates / all applicable gates.
Pass rate: passed / executed (include failed gates; show blocked and not-run separately).
Production readiness: mandatory approved-policy, integrity, permissions, runtime and operational gates must all pass. Do not substitute a weighted percentage for a blocker.
Outcome options: TECHNICAL TEST PASS (demo limitations explicit), CONDITIONAL with named noncritical exceptions, BLOCKED, or FAIL. ENTERPRISE PRODUCTION PASS requires production-policy and operational gates as well.

Final delivery: changed files/migrations; policy/adoption inventory; D01-D13 closure register; E01-E30 evidence; I01-I12 reconciliation; CI results; actual risk/defect register; deployment/rollback guidance; exact remaining decisions/access.

