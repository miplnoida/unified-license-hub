# AML/CFT full-module hardening — defect register and verdict

Verifier: `scripts/verify-aml-full-module-hardening.sql` (16 gates: 12 PASS, 4 FAIL).

**Verdict: AML FULL MODULE HARDENING — NOT CERTIFIED.**

Nothing in W6 was touched. W6 remains certified (24/24 gates).

## Defects fixed this wave

| Id | Severity | Defect | Fix |
| --- | --- | --- | --- |
| A | P2 | The new-assessment dialog offered a trigger vocabulary that did not match the canonical one, so a supervisor could pick a trigger the spine rejects. | Options are now exactly `PERIODIC`, `REASSESSMENT`, `EVENT_DRIVEN`, `FOLLOW_UP`, `THEMATIC` (`AmlNewAssessmentDialog.tsx`). |
| B | P1 | Any internal user reaching the AML assessment register was offered the "New assessment" dialog; only the server refused the write. | The dialog now renders only for `aml_supervision.create` (`useCan`), and the server check is unchanged. |
| C | P1 | AML finding counters were read from the historical `examination_findings` store, so open/critical counts diverged from the canonical register. | AML hooks now count `supervisory_finding` scoped to `domain_code = 'AML_CFT'`, excluding closed/withdrawn/superseded (`useAmlSupervision.ts`). |
| D | P1 | An AML assessment header was fetched by id alone, so an id from another domain rendered inside the AML workspace. | The header query is scoped to `domain_code = 'AML_CFT'` (`useAmlSupervision.ts`). |
| E | P0 | `entity360_overview` still read two retired AML tables, one of which no longer exists — the Entity 360 overview raised `relation "aml_findings" does not exist` for every user allowed the AML section. | The legacy AML block is retired exactly as it already was in `entity360_section`; AML truth is served only by `aml_entity_panel()`. Examination open-findings now counts `supervisory_finding`. |

## Open blockers (why certification is withheld)

| Gate | Blocker | Nature |
| --- | --- | --- |
| AMLH-02 | 27 of 27 AML assessments sit on entities with no recorded applicable AML/CFT perimeter determination (one perimeter row exists in total, and it is not applicable). | Data/governance. An assessment without a perimeter basis has no recorded reason to exist. Needs a supervisory decision on whether the perimeter is back-recorded or the assessments are re-based; not a change an implementer may make silently. |
| AMLH-03 | 24 of 27 AML assessments carry no methodology version binding. | Data/governance. Ratings cannot be attributed to a methodology, so calculated-vs-judged discipline is unauditable for those cases. |
| AMLH-09 | 77 of 80 approved AML dimensions carry no methodology-calculated residual rating. | Consequence of AMLH-03. Override discipline cannot be evidenced. |
| AMLH-31 | `entity360_section` still counts examination open findings from `examination_findings`. | Code. Single subquery in a 16 KB `SECURITY DEFINER` function; the equivalent fix is already applied in `entity360_overview`. |

## Not executed, therefore not claimed

The following phases of the requested scope were not run and no result is asserted for them: driven end-to-end persona journeys (assessment → approval → attention → plan → intervention → examination → finding → response → remediation → validation → escalation → reassessment), the >300-record scale test against the 300-row client truncation in the AML registers, the authorization matrix and attack suite, performance and accessibility passes, and the Playwright AML suite. The 300-record truncation in `AmlSupervisedEntities`, `AmlRiskHeatmap`, `AmlAssessments`, `AmlExaminations`, `AmlFindings`, `AmlWorkQueue` and `AmlNewAssessmentDialog` remains an open defect.
