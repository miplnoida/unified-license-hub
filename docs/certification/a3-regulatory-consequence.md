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

## C2 — Thematic review (remediation, monitoring, closure)

`TR-2026-0001` (`e52b6424-c19c-44d1-a760-9c5e0496816f`) — motor insurance sales practices, raised off the C1 cluster.
Lifecycle transitions executed and audited: `draft → scoped → evidence_collection → analysis → findings_issued → actions_required → monitoring → closed`.
Finding `25a3a732-d9ea-4d09-809f-6b4f993d802f` ("Inadequate suitability checks in motor insurance sales", high) issued via `thematic_review_finding_issue` with rationale.

Remediation and closure chain (all governed RPCs):
1. `thematic_review_entities` scope link → Federation Insurance Brokers Ltd (`da99c6e6-b8a0-4d6c-8c20-da5caa62480e`).
2. `thematic_review_action_save` → remediation action on the finding, owner + due date recorded.
3. `thematic_action_set_follow_up` → follow-up monitoring window set.
4. `thematic_review_action_complete` → licensee remediation recorded.
5. `thematic_action_record_verification` → supervisor verification of effectiveness recorded (separate act from completion).
6. `thematic_review_set_status` → `monitoring`.
7. `thematic_report_draft → submit → approve → publish` → thematic report versioned and published.
8. Closure requested by Goverdhan Sharma and approved by a **different** approver (Mohit Rana) — segregation of duties enforced.

Final state: `status = closed`, `closure_state = approved`, `closed_at = 2026-08-20 19:42:31Z`; full transition history retained in `thematic_review_status_history`.

## C3 — Licensing decision artefact, certificate and signature

Application `CERT-APP-01` (`9b77a739-7fa4-4292-86ce-82f50bd2ccd0`) — Atlantic Commercial Bank Ltd, Commercial Bank Licence.

| Step | Mechanism | Evidence |
|---|---|---|
| Decision letter artefact (v2, immutable) | `issue_decision_artifact` as Licensing Officer (Vidya Rani) | `af7fe151-15c3-4a86-b44d-040eb0f64c38` — rationale + condition (CAR ≥ 10%) captured, checksum stored |
| Licence certificate artefact | `issue_decision_artifact` (`license_certificate`) | `c30da144-5abc-46b9-9689-015a7a3a328b` |
| Certificate PDF | `generate-license-certificate` edge function | certificate `d02f630e-603f-4eee-94ad-c43976bff4f6` |
| Digital signature | `sign-license-certificate` — HMAC-SHA256 over `LICENSE_SIGNING_SECRET` | signature `7eabdd94-e290-42de-a83b-c9b5fe359012` |
| Correspondence dispatch | `send-correspondence` governed function | dispatch `24b8c166-8d25-49f2-b70f-1dffdb0e617a` |

Artefacts are append-only: `tg_decision_artifacts_append_only` rejected an attempted `DELETE` of a superseded artefact (`decision_artifacts is append-only: issue a new version instead of modifying version 1`), so correction is by new version only.

## C4 — AI governance (human-in-the-loop)

- `ai_insight_review` **accepted** insight `13d2e928…` with justification — recorded in `ai_insight_actions`, `review_status = accepted`, reviewer + timestamp stamped.
- `ai_insight_review` **overridden** insight `89de47d5…` — mandatory ≥10-char justification enforced and a rule-override record written.
- No decision in C1/C2/C3 was taken on AI output; AI insights are advisory only and every disposition is attributable. AI-binding decisions: **0**.

## Negative controls

| Attempt | Result |
|---|---|
| `anon` → `conduct_action_issue` | `401 / 42501 permission denied for function` |
| `anon` → licensing/signing edge functions | `401` |
| Conduct supervisor → `conduct_investigation_open` with <10-char allegation | `22023 Allegation summary required (min 10 characters)` |
| Conduct supervisor → `ai_insight_review` before authority grant | `403 not authorised to review AI insights` |
| Conduct supervisor → `sign-license-certificate` | `403 not authorised` |
| Conduct supervisor → `issue_decision_artifact` | `P0001 not authorised to issue decision artifacts` (after fix #6 below) |
| `DELETE` on `decision_artifacts` | rejected by append-only trigger |
| Thematic status outside the canonical vocabulary | rejected by RPC and by the lifecycle guard |

### Defect #6 (found by negative control, fixed)

`issue_decision_artifact` authorised on `can_mutate_application` alone, which the legacy internal-supervisor mapping satisfied — a Market Conduct Supervisor was able to issue a licensing decision artefact. Added `public.can_issue_decision_artifact()` requiring explicit licensing decision authority (`license_management.manage_certificates` / `license_management.approve` / `application_management.approve`), enforced inside the RPC with an `ACCESS_DENIED` security event. Re-test: conduct supervisor denied, licensing officer permitted.

## Digital signature status

**PASS (licensing boundary).** `sign-license-certificate` produced signature `7eabdd94-e290-42de-a83b-c9b5fe359012` using HMAC-SHA256 over `LICENSE_SIGNING_SECRET`, and the signing boundary is authority-checked (conduct supervisor rejected 403).
Conduct alerts, investigations, thematic findings and supervisory directives are **not** digitally signed today — they are attributable through the governed RPC actor, rationale and `compliance_audit_logs` only. Extending signing to conduct outputs remains an open item.

## Correspondence and timeline

- Platform dispatch is certified: threads/messages created through governed correspondence RPCs, `correspondence_dispatches` row written, `correspondence_events` audit trail generated, and attachment linkage to the signed certificate retained.
- **External delivery confirmation is NOT CERTIFIED**: no production email/postal provider is bound in this non-production environment, so delivery receipts cannot be evidenced.
- Timeline: every C1–C3 act is queryable per entity and per application (`compliance_audit_logs`, `conduct_*`, `thematic_review_status_history`, `decision_artifacts`, `correspondence_events`) in chronological order.

## Audit evidence

`compliance_audit_logs` carries, for actor `a59bf878-edea-420b-9280-16c0dce42843`: `CREATE conduct_investigation`, `CREATE conduct_evidence`, `CREATE conduct_action`, `CREATE thematic_review_finding`, `APPROVE thematic_review_finding`, and the `WORKFLOW_TRANSITION thematic_review` rows through closure — plus, for the licensing actor, `APPROVE decision_artifact` rows for both artefact versions and the dispatch audit entries.

