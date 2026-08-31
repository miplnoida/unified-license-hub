# Saint Lucia FSRA — Demo Screen Value Matrix (count semantics)

HEAD `687a4b892b0752a4448efdf64fff2b1be3f94c0d`, 2026-08-31. Values observed read-only.

| KPI label as displayed | Business definition | Scope | Period basis | Source | Status predicate | Filters apply | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|---|---|
| Current breaches (Executive, Breach Inbox) | authoritative threshold outcomes on the current accepted filing version | portfolio | current only | `v_prudential_current_breaches` | none | no | 47 | 47 | PASS |
| — of which true breaches | `level = 'breach'` | portfolio | current | same view | `level='breach'` | no | 9 | 9 | PASS (not displayed — D5) |
| — of which early warnings | `level = 'warn'` | portfolio | current | same view | `level='warn'` | no | 38 | 38 | PASS (not displayed — D5) |
| Unacknowledged breaches | current outcomes with no acknowledgement | portfolio | current | same view | `acknowledged_at is null` | no | 47 | 47 | PASS |
| Entities with breaches | distinct entities in the current population | portfolio | current | same view | none | no | 3 | 3 | PASS |
| Critical / High (open) tile | `level in ('critical','high')` | portfolio | current | same view | severity values absent from schema | no | n/a | 0 permanently | FAIL (D8) |
| Coral Harbour current outcomes | entity-scoped current outcomes | Coral Harbour | current | same view | none | no | 11 (1 breach + 10 warn) | 11 | PASS |
| Open licensing applications | canonical licensing queue aggregate | portfolio | current | queue RPC | shared open predicate | yes | queue value | matches queue | PASS |
| Open complaints | canonical complaint dashboard aggregate | portfolio | current | dashboard RPC | shared open predicate | yes | dashboard value | matches | PASS |
| Filings in view / SLA-breached / awaiting regulator / unassigned / blocking validations | canonical returns aggregate facets | portfolio | current cycle | returns aggregate | per-facet predicates | yes | aggregate values | consistent across returns screens | PASS |
| Open prudential actions | shared open-state predicate (`open`, `in_progress`) | portfolio / entity | current | `prudential_actions` via shared predicate | shared | yes | consistent | consistent | PASS |
| Overdue actions | open and `due_date < now()` | portfolio / entity | current | same | shared | yes | consistent | consistent | PASS |
| Open escalations | shared escalation open predicate | portfolio | current | escalations reader | shared | yes | consistent | consistent | PASS |
| Unresolved stress events | unresolved `prudential_stress_events` | portfolio | current | table | unresolved | yes | > 0 for demo | **0** | FAIL (D6) |
| Supervisory attention items | open `conduct_attention_items` | portfolio | current | table | open | yes | > 0 for demo | **0** | FAIL (D6) |
| Open examination findings / data requests / workpapers awaiting review / open remediation | examination workspace facets | entity | current | examination readers | per-facet | yes | > 0 for a demo entity | **0 examinations on demo entities** | FAIL (D4) |
| My Work totals | union of canonical personal queues | logged-in officer | current | queue aggregates | shared open predicates | yes | consistent with source queues | consistent | PASS |
| AI assistance prepared | `ai_insights` rows | portfolio | current | `ai_insights` | none | yes | 18 | 18 | PASS |
| Awaiting human review | insights not yet acted on | portfolio | current | `ai_insights` / `ai_insight_actions` | no action row | yes | 18 | 18 | PASS |
| Accepted / modified / rejected AI outputs | attributable human decisions | portfolio | current | `ai_insight_actions` | per action type | yes | ≥ 1 each for demo | **0 rows** | FAIL (D18) |
| Governance refusals / discarded outputs / service failures | governed attempt outcomes | portfolio | current | `ai_governance_activity_attempts` (15), `ai_governance_events` (25) | per outcome | yes | > 0 | present | PASS |

## Label clarity findings

- "Breaches" must be relabelled where the population includes early warnings (D5, D13).
- Alert Center titles every row `Breach: <metric>` including warnings (D5).
- Warning rows display the breach threshold, not the crossed warning threshold (D5).
- Current vs unacknowledged and breach-count vs entity-count are correctly separated in the
  entity contract (`current_breach_count`, `unacknowledged_breach_count`) and must be read that
  way on screen.
