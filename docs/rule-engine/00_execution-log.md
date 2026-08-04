# Rule Engine — tester parity execution log

Scope: ADM-RE-003 (Rule Tester) parity with the production runtime paths.

## What changed

The specialised tester previously reimplemented parts of the runtime decision
logic. Two decisions have been extracted into shared helpers so there is exactly
one implementation each, used by both production and the tester:

| Decision | Shared helper | Production caller | Tester caller |
| --- | --- | --- | --- |
| Complaint intake acceptance, severity/priority/intake-source derivation | `public.complaint_intake_decide(text, uuid, jsonb)` | `public.create_complaint(text, jsonb)` | `public.rule_module_test('complaint_triage', …)` |
| Correspondence routing precedence, unit/officer/priority/SLA/status outcome | `public.correspondence_route_decide(text, text, text, text)` | `public.create_correspondence_thread(…)` (17-arg) | `public.rule_module_test('correspondence', …)` |

Two further families now call the existing runtime helpers directly instead of
approximating them:

| Family | Runtime helpers now used by the tester |
| --- | --- |
| `prudential` | `resolve_effective_threshold()` (which threshold row actually applies for the supplied entity/sector/return config/date) and `classify_ratio_risk()` (risk band) |
| `escalation` | `escalation_deadline()` → `escalation_business_deadline()` (tier due times under the rule's business calendar and holidays) |

Test runs remain read-only: the only row written is the `module_rule_tests`
history row.

## Executed verification

Against the live development database:

- `complaint_intake_decide('public', NULL, {subject:"ab", description:"short"})`
  → 3 errors (subject min length, description min length, email required unless
  anonymous), `severity=low`, `priority=p3`, `intake_source=consumer_portal`.
- `complaint_intake_decide('public', NULL, {complete anonymous submission})`
  → `errors: []`.
- `correspondence_route_decide('General','email','Complaint about fees',NULL)`
  → matched rule "General enquiries to Registry", unit `Registry`,
  `sla_days=10`, `status=assigned`, precedence via `sort_order=5`.
- Delegation asserted directly on the catalog: `create_complaint` references
  `complaint_intake_decide`, `create_correspondence_thread` references
  `correspondence_route_decide`, and `rule_module_test` references all four
  helpers.

## Regression guard

`supabase/tests/rule_engine/330_tester_parity.sql` (12 assertions) fails if a
production function stops delegating, if either function reintroduces its own
copy of the rule query, or if the tester stops using the production helpers. The
file is also asserted present by the `rule-engine` CI job.

## Not covered by this step

- Return-validation expression arithmetic is still evaluated by
  `evaluate_return_validations()` at submission time; the tester reports
  field-level comparisons and the user-facing message.
- Conduct, sufficiency and RFI families evaluate their own stored rule
  definitions; their runtime evaluators live in edge functions and have not yet
  been reduced to shared decision helpers.
