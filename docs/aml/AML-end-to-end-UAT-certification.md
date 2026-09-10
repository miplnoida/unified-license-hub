# AML-UAT-01 — End-to-end acceptance record (in progress)

## Rebaseline and environment
- Expected baseline: `39f110a7a`; actual starting HEAD `c2de587c5` (one commit after: "Logged AML-12A rehearsal start"), tree clean.
- Preview responded HTTP 200; latest build log entry `build OK`.
- Connected environment: Lovable Cloud backend for this project; no live AML/CFT calculation policy exists (`ACTIVE` calculation configurations = 0). DEC-01…DEC-08 remain unsigned.
- Personas: 46 certification users, including AML/CFT supervision officer and supervisor, read-only, auditor and licensee accounts.

## Baseline census (pre-acceptance)
- canonical AML risk digest `8385b6c8f7ba2b4102ab054c8f5ac686`
- assessments total/current 28/25; responses 984; AML risk-of-record rows 21 (22 total); movements 25
- calculation policies 0; live policies 0; calculation runs 0
- methodology v1.0 `ACTIVE / REGULATOR_AUTHORED`; v1.1 `DRAFT / MIPL_REFERENCE`

## Browser acceptance (real login UI, real routes)
- AML/CFT supervision officer signed in through the login form and reached `/dashboard`, then every AML/CFT route (`overview`, `work-queue`, `entities`, `assessments`, `heatmap`, `examinations`, `findings`, `portfolio`) with real server-rendered content and no HTTP failures.
- Administration screens (methodology, policy profiles, programmes, calculation) correctly refused the officer.
- Read-only and licensee personas were refused every AML/CFT and administration route.
- Observed non-AML console noise, recorded as pre-existing and not AML defects: React Router v7 future-flag warnings, a nested-button DOM nesting warning in the supervisory register copy control, a seeded navigation icon key (`ChartNetwork`) outside the approved icon map, and function-ref warnings.

## Backend acceptance journey — `scripts/uat-aml-end-to-end.sql`
One transaction, real authenticated personas, canonical governed operations only, `ROLLBACK` at the end. Result: **29 gates passed, 0 failed**, and zero AMLUAT survivors in methodology, dimensions, questions, assessments, plans, consequence decisions, monitoring decisions, and zero live calculation policies after rollback.

Covered: governed assessment creation and server-owned lifecycle; responses and dimension ratings; synthetic maker-checker calculation policy activation; reproducible server calculation with identical result hash and refusal of a stale run; submission gating; refusal of self-approval; reviewer return, resubmission into a new review round; maker-checker approval; risk-of-record publication, lineage and post-approval immutability; consequence linkage to a governed plan and its server read model; server-owned review-cycle state, governed reschedule and reassessment that creates work without changing the rating; governed finding issuance through the real lifecycle; outcome eligibility decided server-side; portfolio report and governed export reconciliation with formula neutralisation; refusal of unauthorised creation, unauthorised portfolio reads, direct ledger writes and direct risk-of-record edits; audit records produced by the journey.

## Defect corrected
- `UAT_PRODUCT_DEFECT` — portfolio movement trends split one rating into two buckets (`HIGH` and `high`) because a small number of historical movement rows store lower-case rating codes. Corrected server-side: the portfolio report and export now emit canonical upper-case rating codes in movement rows and in the opening/closing distributions. The immutable movement ledger was not modified and no band, threshold, interval or regulator policy was introduced.

## Preservation
- Canonical digest unchanged: `8385b6c8f7ba2b4102ab054c8f5ac686`.
- No live AML/CFT calculation policy created or activated; DEC-01…DEC-08 unsigned; LINK-11 unchanged.
- v1.0 remains `ACTIVE / REGULATOR_AUTHORED`; v1.1 remains `DRAFT / MIPL_REFERENCE`.
- No demo data seeded; no operational assessment, risk-of-record, action or evidence row modified.

## Frontend (real browser) acceptance — AML/CFT supervision supervisor
Persona `aml_supervision_supervisor@mishainfotech.com`, real login UI, no session injection, 1280x1800.
- Every AML/CFT navigation destination rendered for the supervisor with no access denial and no 404: `/supervision/aml`, `/work-queue`, `/entities`, `/assessments`, `/heatmap`, `/portfolio`, `/findings`, `/examinations`.
- Portfolio risk report renders server-calculated content only: entity counts (89 visible / 89 in report / 21 with a risk-of-record / 68 without), provenance buckets (21 legacy, 0 calculated, 0 override, 0 not-calculated), review-status buckets, open supervisory exposure and outcome counters. Server-side filters (review status, provenance, published risk code, as-of and trend dates) and `Export management report` are the only controls; the screen states that filtering is applied by the server.
- Mixed-case regression proven on screen: the published risk distribution shows one canonical `HIGH` (17), `LOW` (1) and `MODERATE` (3) bucket — no duplicated case variants.
- Deep link, hard refresh, browser back and browser forward all preserve `/supervision/aml/portfolio`; narrow viewport (390px) renders without horizontal overflow (scrollWidth 390).
- Examinations screen renders 14 governed AML examinations with provenance, stage and workload.

### Frontend defect corrected
- `UAT_PRODUCT_DEFECT` — the AML examinations read model requested a non-existent `examination_team_members.ended_at` column, producing an HTTP 400 (`42703`) on every AML examinations load and silently discarding case-team data. Corrected in `src/hooks/useAmlSupervision.ts`: canonical membership rows are current members, so the query selects `team_role` and the end-date filter was removed. No governed logic, permission or rating behaviour changed.

### Inherited, non-AML observations (not corrected)
- Pre-authentication `401` on `currencies` and `monetary_config_resolve` (permission denied) — platform monetary bootstrap, unrelated to AML.
- The account menu shows the generic label `Applicant` for internal certification personas — inherited persona labelling, outside AML scope.
- React function-ref and router warnings remain as previously recorded.

## Certification gates re-run after the corrections
| Gate | Result |
| --- | --- |
| `scripts/uat-aml-end-to-end.sql` | 29 passed / 0 failed, 0 survivors, 0 live calculation policies |
| `scripts/verify-aml-portfolio-reporting.sql` (AML-10, incl. new CASE-01..04 mixed-case gates) | 50 passed / 0 failed, rollback proven |
| `scripts/verify-aml-supervisory-consequence-linkage.sql` (AML-08) | 66 / 0 |
| `scripts/verify-aml-risk-monitoring-reassessment.sql` (AML-09) | 43 / 0 |
| `scripts/verify-aml-supervisory-outcome-effectiveness.sql` (AML-11) | 41 / 0 |
| `scripts/verify-aml-full-module-hardening.sql` | 56 PASS; `AMLH-09` remains the documented policy-dependent blocker (565 approved dimensions without a governed calculation outcome because no live policy exists) |
| Frontend boundary verifiers AML-07/08/09/10/11 + calculation | 17/17, 20/20, 27/27, 33/33, 39/0, 12/0 |
| `scripts/verify-rbac-parity.mjs` | RBAC parity OK (18 orphan modules / 259 orphan actions inherited, 46 scope tuples) |
| Typecheck / build | clean |
| Full integration suite, canonical two-worker configuration | 174 files / 1703 tests passed |
| Security linter | 1756 advisories across 6 inherited types (1 RLS-no-policy, 7 definer views, 12 mutable search paths, 3 public extensions, 7 anon-executable, 1726 authenticated-executable) — unchanged inherited baseline, no new type introduced |

## Mixed-case regression gates added
`scripts/verify-aml-portfolio-reporting.sql` now asserts, inside the rollback transaction, that `HIGH`/`high`/`High` and `MODERATE`/`Moderate`/`moderate` collapse into single canonical buckets in both report and export (CASE-01, CASE-02), that the immutable movement ledger keeps its stored values exactly, including pre-existing lower-case rows (CASE-03), and that genuinely different canonical ratings stay separate (CASE-04: HIGH=19, MODERATE=2).

## Preservation recheck after all work
- `aml07_risk_digest = 8385b6c8f7ba2b4102ab054c8f5ac686`; 22 `entity_risk_state` rows (21 AML), 25 movements, 25 rated assessments.
- `calculation_policies_live = 0`; v1.0 `ACTIVE / REGULATOR_AUTHORED`; v1.1 `DRAFT / MIPL_REFERENCE`; all AMLUAT/AMLxxCERT fixture counts 0.

## Verdict
**AML-UAT-01: PASS** for end-to-end frontend and backend acceptance within the unactivated-policy scope. Two genuine defects were found and corrected (portfolio rating-case normalisation, examinations case-team query). No live AML/CFT calculation policy was activated, no demo data was seeded and no video work was started. Policy-dependent gates (`AMLH-09`, CALC-05/06/09/11, LINK-11) remain open pending signed DEC-01…DEC-08.
