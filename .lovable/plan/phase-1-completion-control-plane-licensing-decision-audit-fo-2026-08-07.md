# Phase 1 Completion — Control Plane, Licensing Decision, Audit Foundations

Scope: ADM-SLA-001, LIC-DEC-001, LIC-DEC-002, AUD-SEC-001, AUD-OVR-001. No Phase 2 work. Existing SLA Manager commits are extended, not replaced.

## Gap map (from inspection of current main)

| FRD ID | State today | Evidence found |
|---|---|---|
| ADM-SLA-001 | Implemented, unverified | `sla_stage_instances` / `sla_stage_events` tables, `sla_stage_open/pause/resume/complete` (privileges revoked from clients), workflow-instance + application-RFI triggers, stage-driven escalation sweep, SLA Manager with runtime pickers and Live Stages tab. No automated tests, no persisted breach audit proof, RFI pause wired for applications only. |
| LIC-DEC-001 | Partially implemented | `ApproverDecisionView` composes sufficiency, twin-peaks, AI assessment, readiness summary, consolidated case, document preview. No server-side gate enforcement: `perform-workflow-action` contains no sufficiency/RFI gate checks. |
| LIC-DEC-002 | Partially implemented | `preview-decision-documents` edge function + `DecisionDocumentPreview`; no required-merge-field validation, and no immutable issued-artifact record for the decision letter (only `license_certificates` for signed certificates, without template/data snapshot). |
| AUD-SEC-001 | Partially implemented | `security_event_logs` + `/admin/security-events` console + `log_security_event(_as_actor)`. Table has no severity, module, action, object id or correlation id columns; coverage of denial paths unproven. |
| AUD-OVR-001 | Partially implemented | `rule_overrides` + `log_rule_override` RPC (10-char reason check client-side) + `/admin/overrides`. Server-side justification enforcement, append-only guarantee and evidence/correlation linkage need confirmation and, where absent, additive hardening. |

## Work plan

### 1A — SLA engine hardening
- Extend RFI pause/resume coverage to complaint RFIs and return edit/RFI waiting states using the same `sla_stage_pause/resume` routines (additive triggers only).
- Write an audit row plus a `breached` stage event on first breach detection in `sla-escalation-sweep`, guarded by `first_breach_notified_at` so escalation and notification fire exactly once.
- Add pgTAP suite `supabase/tests/sla/`: open, near-due, pause (elapsed frozen), resume (consumed time retained, due recalculated), breach, single escalation, completion, unauthorized config mutation, unauthorized direct RPC call, audit-row assertions.

### 1B — Decision cockpit gate enforcement
- Add a `decision_gate_status(application_id)` SQL helper returning passed gates, outstanding mandatory gates, open RFIs and payment prerequisites from existing configuration.
- Enforce it inside the decision transition path (`perform-workflow-action` and the manual decision action) — final decisions rejected server-side when a mandatory gate is unmet or a pausing RFI is open, with denial audit + security event.
- Surface the same helper in `ApproverDecisionView` as an explicit "Decision readiness" block (passed / outstanding / blocking), and disable actions in UI as a secondary guard only.
- Persist actor, timestamp, decision, rationale, stage, source object and conditions on the decision action (reuse existing approval-action columns; add only what is missing).

### 1C — Letter and certificate integrity
- Required-merge-field validation in `preview-decision-documents`: return a structured list of missing mandatory fields and block issuance instead of rendering blanks.
- New additive table `decision_artifacts` (application/license ref, artifact kind, template id + version, rendered file path, merge-data snapshot, rationale, conditions, issuing regulator, effective/expiry dates, issued_by, issued_at) — append-only, so later template edits never mutate historic issued documents.
- Audit generated / previewed / approved / issued / reissued separately; RLS so applicants read only their own issued artifacts and internal drafts never leak.

### 1D — Security event log
- Additive columns on `security_event_logs`: `severity`, `module`, `action`, `object_id`, `correlation_id`, plus a metadata allowlist in the logging functions so tokens, headers and credentials can never be persisted.
- Coverage pass over denial paths: route guards, `enforce_action`, edge-function authorization failures, direct object-ID denials — routed through the existing `log_security_event(_as_actor)` helpers with the correlation ID from `src/platform/http/correlation.ts`.
- Console gains severity / module / event-type / actor / date filters, search and a detail drawer; audited export.
- pgTAP RLS proof that non-security personas cannot select the table.

### 1E — Override registry
- Confirm and, if missing, enforce server-side in `log_rule_override`: non-blank justification (min length), append-only (no update/delete policies), original value immutable, second override creates a new row rather than overwriting.
- Add optional `evidence_refs` and `correlation_id`/audit-link columns; route the existing consequential override points (F&P screening, sufficiency, risk/assessment, workflow recommendation, supervisory conclusion) through the single helper. No new override buttons elsewhere.
- Object-context history view reusing existing history components, plus the admin register; source-object RLS respected so the registry never leaks restricted data.

### Cross-cutting verification (gate before any VERIFIED claim)
- Persona matrix (applicant, licensing officer, supervisor, approver, admin, unauthorized internal) across route access, select/insert/update/delete, RPC, edge function and direct-ID access for every Phase 1 object.
- Notification checks for breach, escalation, decision and issuance: trigger, recipient resolution, template, dispatch status, failure provenance — a failed provider must never read as delivered.
- Regression smoke: login, registration, applicant dashboard, application create/resume, dynamic forms, uploads, submission, queue, workflow execution and versioning, approvals, notifications, payments, license register, returns, complaints, reporting, audit logs, admin hub, route guards.
- Typecheck, production build, existing test suites, new tests, migration validation, lint.

### Final output
Evidence matrix with one row per FRD ID (code / DB / runtime / RLS+direct-ID / audit / notification / regression / final state), then files changed, database changes, tests added, failed or unverifiable tests, remaining risks, regression confirmation. Closure statement is PHASE 1 VERIFIED only if all five IDs are individually VERIFIED; otherwise PHASE 1 NOT YET VERIFIED.

Stop after Phase 1.
