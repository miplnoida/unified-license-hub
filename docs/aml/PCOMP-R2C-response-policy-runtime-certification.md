# PCOMP-R2C — Supervisory Response Policy Runtime

Baseline HEAD at start of wave: `39d8cf659d2229303e7cb178c80d3febdc039bf3` (clean tree).

## Scope

RESPONSE_POLICY is the third generic policy family with runtime behaviour, after
EVIDENCE_POLICY (R2A) and JUDGEMENT_POLICY (R2B). The remaining seven areas
(sector overlay, facts, sources, materiality, SLA, dashboard, notification)
remain configuration-only.

No policy values, ratings, published risk, historical assessments, demo records
or active regulator policy content were changed. Nothing is executed
automatically: no supervisory action, finding or enforcement case is ever created
from a rating.

## Server contract

- Response rules are normalised by `supervisory_response_policy_rules`, with
  required `rule_code`, `risk_band`, `action`, `response_level`
  (REQUIRED / RECOMMENDED / PERMITTED / PROHIBITED), a methodology-controlled
  risk vocabulary and the canonical AML-08 action vocabulary. Legacy short-form
  `actions[]` content is interpreted as PERMITTED only.
- `supervisory_response_policy_content_errors` refuses unknown fields, unknown
  actions or levels, duplicate rule references, duplicate risk-band/action pairs,
  contradictions and prohibited-with-deferral.
- Timeframes are advisory (`ADVISORY_UNTIL_SLA_POLICY`); SLA ownership is not claimed.
- `supervisory_response_policy_internal(uuid,text)` is service-role only and
  resolves policy exclusively through the assessment's immutable policy basis,
  returning `EVALUATED`, `NOT_GOVERNED` (no assessment source / no policy basis /
  policy not bound) or `UNAVAILABLE` (pinned policy missing).
- `supervisory_consequence_response_policy_view(uuid,text,uuid)` is the
  authenticated read model, with entity-scope enforcement and historical provenance.
- The canonical `supervisory_consequence_record` operation consults the evaluator,
  refuses prohibited responses and unavailable pinned policies, and permanently
  records the policy code, version, rule reference, level and advisory timeframe
  it was judged against. All existing AML-08 authorisation, prerequisites,
  linkage modes, duplicate handling and idempotency are unchanged.

## Certification evidence

| Gate set | Result |
|---|---|
| `scripts/verify-pcomp-r2c-response-policy.sql` | **66/66 PASS**, rollback-only; components, consequence decisions, assessments, movements, publications and risk digest preserved; no R2CCERT fixture survived |
| `scripts/verify-pcomp-r2b-judgement-policy.sql` | 63/63 PASS |
| `scripts/verify-pcomp-r2a-evidence-policy.sql` | 50/50 PASS |
| `scripts/verify-pcomp-r1-effective-policy-spine.sql` | 51/51 PASS |
| `scripts/verify-aml-supervisory-consequence-linkage.sql` (AML-08) | PASS, clean rollback |
| Frontend `amlResponsePolicyPanel` + `amlSupervisoryConsequence` | 31/31 PASS |

## Inherited verifier corrections made in this wave

- R2A/R2B/R1 capability gates expected eight configuration-only areas; they now
  expect seven and recognise RESPONSE_POLICY as runtime consumed.
- R1's invalid RESPONSE_POLICY fixtures could no longer be authored, because R2C
  moved the vocabulary defence upstream into authoring validation. Those gates now
  assert the governed lifecycle refusal, which is the stronger control.
- The AML-08 rollback census counted every existing consequence decision and
  audit row as a fixture survivor; it now scopes to AML08CERT fixtures, so genuine
  demonstration history is not misreported.

## Capability state

| Area | Runtime consumed |
|---|---|
| EVIDENCE_POLICY | true |
| JUDGEMENT_POLICY | true |
| RESPONSE_POLICY | true |
| SECTOR_OVERLAY, FACT_CONFIG, SOURCE_BINDING, MATERIALITY_POLICY, SLA_POLICY, DASHBOARD_POLICY, NOTIFICATION_POLICY | false |

## Honest limitations

- Timeframes are advisory only until SLA_POLICY runtime (PCOMP-R2D) exists.
- Assessments without a policy basis correctly report `NOT_GOVERNED`; the
  platform's own AML-08 controls continue to apply to them.
- No authenticated browser walkthrough was run in this wave.
- Project-wide security linter findings (~1792) remain, dominated by inherited
  SECURITY DEFINER, search-path and definer-view categories. Not claimed clean.

## Classification

PASS for PCOMP-R2C supervisory response policy runtime. SLA_POLICY, Dashboard
Policy and Notification Policy runtime were not started.
