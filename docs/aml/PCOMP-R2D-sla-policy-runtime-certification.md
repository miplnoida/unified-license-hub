# PCOMP-R2D — Supervisory SLA Policy Runtime

Baseline HEAD at start of wave: `7ee47bb163e0eb0129ac5a7d42ee314e807866d7` (clean tree).

## Scope

SLA_POLICY is the fourth generic policy family with runtime behaviour, after
EVIDENCE_POLICY (R2A), JUDGEMENT_POLICY (R2B) and RESPONSE_POLICY (R2C). Six
areas (sector overlay, facts, sources, materiality, dashboard, notification)
remain configuration-only.

No second SLA engine was created. Deadlines, holds, breach detection and
escalation remain owned by the canonical platform stage engine
(`sla_stage_instances`, `sla_stage_events`, `sla-escalation-sweep`). SLA policy
only supplies the governed duration, day basis, hold permission, warning
threshold, escalation profile and breach severity.

No policy values, ratings, published risk, historical assessments or demo
records were changed. Nothing is executed automatically: no supervisory action,
finding or enforcement case is created, approved or closed by a deadline.

## Server contract

- `supervisory_sla_policy_rules` normalises stage/rule content with required
  `rule_code`, `stage`, `duration_days`, controlled calendar modes
  (`CALENDAR_DAYS` / `BUSINESS_DAYS`), breach severities, the methodology-owned
  risk vocabulary and the canonical AML-08 action map.
- `supervisory_sla_policy_content_errors` refuses missing or invalid stages and
  durations, unknown actions, calendar modes or severities, invalid warning
  thresholds, contradictory hold settings, duplicate rule codes or duplicate
  action/rating deadlines, and control-bypass fields.
- `supervisory_sla_policy_compatibility` validates ratings and actions against
  the methodology and canonical action map; profile compatibility delegates to it.
- `supervisory_sla_policy_internal(uuid,text,text)` is service-role only and
  resolves policy exclusively through the assessment's immutable policy basis,
  returning `EVALUATED`, `NOT_GOVERNED` (no assessment source / no policy basis /
  policy not bound / no matching rule) or `UNAVAILABLE` (pinned policy missing).
- `supervisory_response_sla_obligation` is an immutable, one-per-decision
  provenance record: SLA policy code, version, content hash, profile, rule,
  duration, day basis, calendar resolution, hold permission and reasons, warning
  threshold, escalation profile, breach severity, the advisory response
  timeframe it replaces, the due date and the server-decided outcome
  (`PENDING`, `ON_TIME`, `LATE`, `NOT_APPLICABLE`). Clients have read access only.
- Recording a supervisory consequence opens exactly one governed deadline
  through the canonical stage engine; withdrawal or supersession closes it as
  `NOT_APPLICABLE`. SLA policy can never prevent a consequence being recorded.
- Holds require supervisory scope, review authority, a policy-permitted reason
  and a written rationale. `ON_TIME` / `LATE` is decided by the server from the
  recorded deadline, never by a client.

## Certification evidence

| Gate set | Result |
|---|---|
| `scripts/verify-pcomp-r2d-sla-policy.sql` | **102/102 PASS**, rollback-only; components, consequence decisions, assessments, movements, publications, SLA stages/events/configuration and risk-of-record preserved; no R2DCERT fixture survived |
| Frontend `amlResponseSlaPanel` + `amlResponsePolicyPanel` | 14/14 PASS |

## Corrections made in this wave

- The R2C response evaluator and the new SLA evaluator both read a
  `content_hash` column that does not exist on `supervisory_policy_component`.
  Both now use the canonical content-hash function. This was latent in R2C only
  because no live assessment carries a bound policy snapshot yet.
- Inherited default privileges granted write access on the new provenance table;
  writes are now revoked for `anon` and `authenticated`.
- Three new internal trigger routines were revoked from PUBLIC/anon/authenticated
  and granted to `service_role` only.

## Frontend

`useAmlSlaPolicy` and `AmlResponseSlaPanel` are readers mounted beside the
response policy panel in the supervisory consequence workspace. No deadline
arithmetic, working-day calculation, breach rule or on-time judgement exists in
TypeScript.

## Capability state

| Area | Runtime consumed |
|---|---|
| EVIDENCE_POLICY | true |
| JUDGEMENT_POLICY | true |
| RESPONSE_POLICY | true |
| SLA_POLICY | true |
| SECTOR_OVERLAY, FACT_CONFIG, SOURCE_BINDING, MATERIALITY_POLICY, DASHBOARD_POLICY, NOTIFICATION_POLICY | false |

## Honest limitations

- Business-day arithmetic reuses the existing canonical `sla_add_duration`
  behaviour, which consumes 24-hour working-day chunks. It was deliberately not
  redesigned in this wave.
- No live assessment currently carries a policy basis, so real records report
  `NOT_GOVERNED`. The governed `EVALUATED` path is certified against
  rollback-only synthetic fixtures.
- No authenticated browser walkthrough was run in this wave.
- Project-wide security linter findings (~1796) remain, dominated by inherited
  SECURITY DEFINER, search-path and definer-view categories. Not claimed clean.

## Classification

PASS for PCOMP-R2D supervisory SLA policy runtime. Dashboard Policy,
Notification Policy and Sector Overlay runtime were not started.
