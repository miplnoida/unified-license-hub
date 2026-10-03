# AML-CLOSE-01 — Baseline & Closure Register

Date: 2026-10-03. Scope: read-only inspection and documentation only. No migration, policy
change, data change or message was made.

## A. Environment and baseline

| Item | Observed |
| --- | --- |
| Current commit | `89352bf5fbc2a47b2b0ca7227492e02d2f0e4e0c` (2026-09-27). Same as the historical reference; **0 later commits** on this branch. |
| Environment | `app_environment_config.environment = non_production` (read from the table, not inferred from the name). One backend serves preview and published app. |
| Browser access | Available: localhost preview with an injected signed-in session. |
| Certification password | `CERT_V2_DEFAULT_PASSWORD` present, so persona login is possible. |
| PR #5 / execution plan | **BLOCKED.** No GitHub access from this workspace, and `docs/aml/AML-policy-completion-E2E-execution-plan-2026-10-03.md` is not on this branch. PR #5 has not been reviewed or merged here. Its CI status is not available. |

Persona accounts found: `super_admin`, `aml_supervision_officer`, `aml_supervision_supervisor`,
`read_only`, `auditor`, `licensee_primary_user` (external), `prudential_supervisor` (out-of-domain).
**Missing:** a dedicated independent policy approver (`aml_head` holder) and a separate policy
administrator persona.

## B. Policy / runtime readiness matrix

Active package `FSRA-AML-CFT-POLICY 1.0`. Status ACTIVE, origin REGULATOR_AUTHORED, effective
2026-09-12. Reference package `AML-CFT-POLICY 1.1` is DRAFT / MIPL_REFERENCE.

| Family | Bound version | Runtime consumption | Classification |
| --- | --- | --- | --- |
| Methodology | AML-CFT-RBA 1.0 ACTIVE (1.1 DRAFT) | Consumed | Live |
| Assessment programme | MIPL-AML-ASSESSMENT-PROGRAMMES 1.0+FSRA ACTIVE | Consumed | Live |
| Calculation | AML-CFT-RBA/calc v1 ACTIVE | Consumed | Live. Values are demonstration configuration, not signed regulator policy. Needs a regulator decision. |
| Evidence | FSRA-AML-EVIDENCE 1.0 ACTIVE (1.2 DRAFT) | Consumed | Live |
| Judgement / override | FSRA-AML-JUDGEMENT 1.0 ACTIVE | Consumed | Live |
| Response | FSRA-AML-RESPONSE 1.0 ACTIVE | Consumed | Live |
| SLA | FSRA-AML-SLA 1.0 ACTIVE | Consumed | Live |
| Sector overlay | not bound (stray DRAFT `hjhgh`) | Not consumed | Config-only. Applicability itself still works through the programme set. |
| Fact config, source binding, materiality, dashboard, notification | not bound | Not consumed | Config-only. The capabilities exist elsewhere; only the dedicated policy component is not read. |

## C. Rule-to-consumer inventory (summary)

| Section | Authoritative config | Backend owner | Frontend consumer | Gap |
| --- | --- | --- | --- | --- |
| Scope / programmes | programme set | programme/applicability RPCs | New assessment, programme plan | Sector overlay not consumed |
| Methodology | `supervisory_methodology` | `supervisory_methodology_resolve` | Assessment workspace | v1.1 adoption is a regulator decision |
| Facts / sources | methodology facts | evidence/fact readiness RPCs | Evidence & facts panel | FACT_CONFIG / SOURCE_BINDING not consumed |
| Evidence | EVIDENCE_POLICY | `supervisory_evidence_policy_*` | Evidence policy panel | Fixed 2026-09 (wrong column name) |
| Judgement | JUDGEMENT_POLICY | review/override RPCs | Review screen | — |
| Calculation | calc config | `supervisory_calc_compute` only | Calculation workspace | Values need a signed regulator decision |
| Materiality | — | inside the calculation | — | MATERIALITY component not consumed |
| Approval / publication | maker-checker | `..._risk_publication` | Review & publication | See D2 |
| Response / SLA | RESPONSE, SLA | consequence + SLA engines | Response/SLA panels | — |
| Monitoring / effectiveness | AML-09/AML-11 | monitoring + outcome RPCs | Risk monitoring, outcomes | — |
| Reporting / notifications | AML-10 | portfolio RPCs; shared notification engine | Portfolio | DASHBOARD / NOTIFICATION not consumed |

No parallel engines are proposed. Every gap extends the owner named above.

## D. Read-only integrity findings

- **D1 STR_SAR linkage — confirmed.** 22 assessment-dimension rows on methodology 1.0 use
  `STR_SAR_GOVERNANCE`. That code is not in the 1.0 or 1.1 catalogue, which holds `STR_GOVERNANCE`
  and `STR_IDENTIFICATION`. Not repaired: this needs semantic-owner approval and an audited
  correction plan.
- **D2 Publication coverage.** 21 AML assessments are approved, but only 2 have a risk
  publication; 19 do not. This is probably legacy data from before AML-07 publication existed.
  It needs a confirmation from the regulator owner; there is no plan to back-fill it.
- **D3** `SUP-AML_CFT-2026-00830` is preserved: approved, methodology 1.0, approved 2026-09-12.
- **D4** Assessment counts: 21 approved, 6 draft, 3 submitted, 5 superseded, 1 returned. No
  approved assessment is missing a regulator.
- **D5** The stray DRAFT sector overlay `hjhgh` is test litter. It should be retired through
  governance, not deleted.
- No "verify" SQL script was executed. Several of them write fixtures.

## E. Fresh check results (run 2026-10-03)

| Check | Result |
| --- | --- |
| `tsgo --noEmit -p tsconfig.app.json` | PASS |
| `vitest src/test/aml*` | PASS: 18 files, 278 tests |
| AML-07 review/publication boundary | PASS 17/17 |
| AML-08 consequence boundary | PASS 20/20 |
| AML-09 monitoring boundary | PASS 27/27 |
| AML-10 portfolio boundary | PASS 33/33 |
| AML-11 outcome/effectiveness boundary | PASS 39/39 |
| SQL verifiers | NOT RUN (they write fixtures) |
| Playwright cert-v2 / browser E2E | NOT RUN |
| PR #5 CI | BLOCKED (no access) |

Earlier results (AML-UAT-01, AML-LOCK-01) are historical and were not rerun.

## F. Prioritised development closure register

Totals: 13 work items. 0 are complete against explicit acceptance criteria. 6 are ready to
start, 7 are blocked by a decision or by access. The D01–D13 mapping must be reconciled once
PR #5's plan is readable.

| # | Item | Type | Extend | Acceptance | Blocker |
| --- | --- | --- | --- | --- | --- |
| C01 | Read PR #5 and reconcile with this register | Missing assurance | — | Plan items mapped | GitHub access |
| C02 | Consume SECTOR_OVERLAY in applicability | Config-only runtime | programme/applicability RPCs | Overlay changes the plan; trace shown | — |
| C03 | Consume FACT_CONFIG + SOURCE_BINDING | Config-only runtime | evidence/fact readiness | Readiness follows the bound component | — |
| C04 | Consume MATERIALITY in the calculation | Config-only runtime | `supervisory_calc_compute` | Snapshot records the materiality version | Regulator values |
| C05 | Consume NOTIFICATION policy | Config-only runtime | shared notification engine | Recipients/timing from policy; delivery to test inbox | Controlled recipients |
| C06 | Consume DASHBOARD policy | Config-only runtime | portfolio RPCs | Tiles/thresholds from policy | — |
| C07 | Signed calculation values | Regulator decision | calc config lifecycle | Approved by the independent approver | Regulator |
| C08 | STR_SAR_GOVERNANCE correction | Confirmed defect | audited correction RPC | 22 rows mapped, before/after audit | Semantic owner |
| C09 | Publication gap for 19 approved assessments | Decision | publication RPC | Owner decision recorded | Regulator |
| C10 | v1.1 adoption (DEC-01…08) | Regulator decision | adoption orchestration | Signed decisions | Regulator |
| C11 | Independent-approver persona | Missing assurance | cert fixtures | Login + approval works | Persona |
| C12 | Direct-API permission-bypass suite | Missing assurance | `e2e/cert-v2/05` | Denials recorded, no rows created | — |
| C13 | Retire stray overlay `hjhgh` | Data hygiene | component lifecycle | Retired with rationale | — |

## G. Controlled E2E fixture / persona matrix

Fixtures must be isolated and identifiable, with a `CERT-AML-E2E-` reference prefix and a
dedicated test entity, and their evidence must be kept. Journeys:

1. Officer creates and submits an assessment.
2. The independent supervisor approves and publishes it.
3. A response raises required actions with SLA deadlines.
4. Reassessment and effectiveness decisions are recorded.
5. Retry, concurrency and double-submit are refused.
6. `read_only`, `auditor`, `licensee_primary_user` and `prudential_supervisor` attempt the same
   commands directly against the backend, and every attempt is refused.
7. Portfolio and export figures reconcile with the records.
8. Notifications are delivered to controlled test inboxes only.

Real institutional contacts and historical conclusions stay untouched.

## H. Regulator decisions and access blockers

- Signed calculation values (C07).
- Materiality values (C04).
- The STR_SAR mapping (C08).
- The publication gap (C09).
- v1.1 DEC-01…08 (C10).
- GitHub access for PR #5 (C01).
- An independent policy-approver persona (C11).
- Controlled notification recipients (C05).

## I. What can realistically finish today

C02, C03, C06, C12 and C13 can be built and verified without any regulator input. Everything
else waits on the decisions in section H.

## Verdict

**AML-CLOSE-01: READY FOR DEVELOPMENT (partially).** The baseline is clean: type check, 278 AML
tests and 136 boundary gates all pass. Development is not blocked. PR #5 reconciliation and the
regulator-value items are blocked.

**AML-CLOSE-02 scope:** C02 (sector overlay consumption) and C03 (fact/source binding
consumption). Both need server-side consumption, a policy trace, unit tests and one persisted E2E
run on a fixture.

**Mandatory missing information:** PR #5 contents or access, an approver persona, controlled
notification recipients, and the semantic-owner decision on STR_SAR.
