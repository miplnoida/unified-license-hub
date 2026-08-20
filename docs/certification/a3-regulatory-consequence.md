# A3 — Conduct & Cross-Cutting Regulatory Consequence Certification

Programme: SUPTECH BRD/FRD Conformance & Supervisory Readiness
Persona: Market Conduct Supervisor — Goverdhan Sharma (`a59bf878-edea-420b-9280-16c0dce42843`)
All mutations executed through governed SECURITY DEFINER RPCs (no browser DML, no terminal seeding of outcomes).

## Defects found and fixed during certification

| # | Defect | Fix |
|---|--------|-----|
| 1 | Market Conduct Supervisor role held only `market_conduct.view` — could not run analytics, open investigations, or issue actions | Granted the conduct lifecycle permission set (analytics, monitoring rules, investigation, thematic review, enforcement action, investigation workspace, enforcement_management, escalation_management) |
| 2 | `evaluate-conduct-monitoring` alert insert used invalid `kind: 'monitoring_rule'` / `generated_by: 'system'` — every alert insert failed **silently** (check-constraint violation, error never surfaced) | Corrected to `rule_triggered` / `triage_engine`; alert-insert errors are now surfaced in the run summary; alert now carries `monitoring_result_id`, `rule_version`, `threshold_value`, `rule_snapshot`, `explanation` |
| 3 | Conduct governed RPCs called a non-existent 6-arg `log_compliance_audit(text,text,uuid,jsonb,jsonb,text)` — acknowledge/close/investigation writes aborted | Added the compatibility overload delegating to the canonical enum-typed function |
| 4 | `thematic_review_set_status` allowed a status vocabulary that the `thematic_reviews_status_guard` trigger rejected (`in_progress`, `fieldwork`, `reporting`) — no status transition was possible | RPC vocabulary aligned to the canonical lifecycle (`draft → scoped → evidence_collection → analysis → findings_issued → actions_required → monitoring → closed`), history row written before the update so overrides resolve |
| 5 | Complaint-volume rule evaluation could not be scoped | Engine now supports `licensee_ids`, `complaint_type_id`, `product_id`, `group_by_product` |

## C1 — Complaint cluster to supervisory consequence

Rule `A3-C1-MISSELL-MOTOR` (`669f424a-1cd6-4710-a692-70f4319a23a9`): motor-insurance mis-selling complaints, threshold 4 / 30 days, scoped by complaint type + product.

| Branch | Entity | Observed | Threshold | Matched |
|---|---|---|---|---|
| Positive | Federation Insurance Brokers Ltd (`da99c6e6…`) | 4 complaints | 4 | **yes** |
| Control | Nevis Life Assurance Ltd (`4de6725a…`) | 2 complaints | 4 | no |

Causal chain (all governed, all audited):
1. Detection run → `conduct_monitoring_results` (matched + non-matched rows retained).
2. Alert `46cedccd-8cc9-490f-8c9a-847816b90010` — "Rule triggered: A3-C1 Mis-selling cluster (Motor Insurance)", severity medium, explanation states 4 vs threshold 4 in 30 days.
3. `conduct_alert_acknowledge` → status `acknowledged`.
4. `conduct_investigation_open` → investigation `85f67400-6d32-49af-80f9-79d2f57e1254`, priority/severity high, allegation ≥10 chars enforced.
5. `conduct_evidence_upload` → evidence `ac537221-c655-4397-9af6-0f2334c6271a` linked to alert + investigation.
6. `conduct_action_issue` → remediation directive `0edb1901-b2a7-4d5d-86a7-c5d83216bbd7`, due 2026-10-15, rationale recorded.

## C2 — Thematic review

`TR-2026-0001` (`e52b6424-c19c-44d1-a760-9c5e0496816f`) — motor insurance sales practices, raised off the C1 cluster.
Lifecycle transitions executed and audited: `draft → scoped → evidence_collection → analysis → findings_issued → actions_required`.
Finding `25a3a732-d9ea-4d09-809f-6b4f993d802f` ("Inadequate suitability checks in motor insurance sales", high) issued via `thematic_review_finding_issue` with rationale.

## C4 — AI governance (human-in-the-loop)

- `ai_insight_review` **accepted** insight `13d2e928…` with justification — recorded in `ai_insight_actions`, `review_status = accepted`, reviewer + timestamp stamped.
- `ai_insight_review` **overridden** insight `89de47d5…` — mandatory ≥10-char justification enforced and a rule-override record written.
- No decision in C1/C2 was taken on AI output; AI insights are advisory only and every disposition is attributable.

## Negative controls

| Attempt | Result |
|---|---|
| `anon` → `conduct_action_issue` | `401 / 42501 permission denied for function` |
| Conduct supervisor → `conduct_investigation_open` with <10-char allegation | `22023 Allegation summary required (min 10 characters)` |
| Conduct supervisor → `ai_insight_review` before authority grant | `403 not authorised to review AI insights` |
| Thematic status outside the canonical vocabulary | rejected by RPC and by the lifecycle guard |

## Digital signature status

**Not applied in A3.** Cryptographic signing exists only in `sign-license-certificate` (HMAC-SHA256 over `LICENSE_SIGNING_SECRET`) and is scoped to licence certificates / licensing decision artefacts. Conduct alerts, investigations, thematic findings and supervisory directives are **not** digitally signed today — they are attributable through the governed RPC actor, rationale and `compliance_audit_logs` entries only. Extending signing to conduct outputs is an open item.

## Audit evidence

`compliance_audit_logs` carries, for actor `a59bf878-edea-420b-9280-16c0dce42843`: `CREATE conduct_investigation`, `CREATE conduct_evidence`, `CREATE conduct_action`, `CREATE thematic_review_finding`, `APPROVE thematic_review_finding`, and five `WORKFLOW_TRANSITION thematic_review` rows — plus notification dispatch rows generated by the alert event.
