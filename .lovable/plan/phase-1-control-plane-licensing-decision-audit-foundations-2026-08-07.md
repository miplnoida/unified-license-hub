# Phase 1 — Control Plane, Licensing Decision & Audit Foundations

Scope: ADM-SLA-001, LIC-DEC-001, LIC-DEC-002, AUD-SEC-001, AUD-OVR-001. Phase 1 only — no Phase 2 work.

## What already exists (confirmed by inspection)

- SLA runtime: `approval_steps.sla_hours`, `sla_warning_threshold_percent`, `escalation_after_hours`; `workflow_instances.paused_at / resumed_at / total_pause_seconds`; shared calculation in `useWorkflowSLA` + `workflowSlaResolver` + `useWorkflowSlaInstances`; badges in application/workflow views.
- SLA pause/resume on RFI: trigger function `rfi_pause_sla` pauses on RFI open, resumes and accumulates pause seconds on responded/closed/cancelled, and writes `workflow.sla.paused` / `workflow.sla.resumed` audit rows.
- Escalation: `sla-escalation-sweep` edge function with `sla_escalation_tiers` and idempotent `sla_escalation_dispatches` (unique instance+tier).
- Admin config: `/admin/sla` (`SlaManager.tsx`) over `sla_configurations`, `sla_escalation_tiers`, `sla_process_team_leads`, `business_calendar_profiles`.
- Security log: `security_event_logs` table (populated), console at `/admin/security-events`, edge helper `logSecurityEvent`.
- Overrides: `rule_overrides` table + `/admin/overrides` register, `OverrideJustificationDialog`, `sufficiency_overrides`.
- Licensing decision: `Decision` tab on application detail (`ApproverDecisionView`), `DecisionDocumentPreview`, `preview-decision-documents` edge function.

So Phase 1 is mostly extension + wiring + evidence, not new modules.

## Confirmed gaps to close

1. **Orphan SLA configuration.** `sla_configurations` (with `calendar_profile_id`, `pause_conditions`, `escalation_recipient`) is referenced only by `SlaManager.tsx` and generated types — no runtime code reads it. Configured stage SLAs therefore do not affect real countdowns.
2. **No first-class SLA event history.** Pause/resume evidence lives only in `audit_logs`; there is no per-stage SLA record with start/due/state, and no persisted breach event, so breach status is recomputed client-side and cannot be reported on historically.
3. **Escalation/breach reporting surface.** `sla_escalation_dispatches` is admin-readable but has no console view; breach audit event on first breach detection is not written by the sweep.
4. **Override coverage unproven.** `rule_overrides` holds a single row; the override points named in the FRD (F&P screening false-positive, sufficiency, workflow/risk, supervisory conclusion) need a coverage audit and wiring of any missing ones into the central registry.
5. **Security event coverage unproven.** Need an audit of denied-access / direct-ID / authorization-failure paths against actual writes, plus explicit RLS persona proof and a no-secrets assertion.
6. **LIC-DEC-001/002 not verified** against the acceptance scenarios (incomplete mandatory gates, RFI-open, unauthorized persona, historical case; issued-artifact immutability).

## Plan

### 1A — SLA engine (extend, do not replace)
- Additive migration:
  - `sla_stage_instances` (process_type, entity_type, entity_id, workflow_instance_id, step_id, stage_name, sla_config_id, started_at, due_at, paused_at, active_seconds, pause_seconds, state: active/paused/breached/completed, breached_at, first_breach_notified_at) — one row per stage occupancy, never overwritten.
  - `sla_stage_events` (stage_instance_id, event_type: started/paused/resumed/breached/escalated/completed, actor_id or system, occurred_at, from_state, to_state, reason, metadata) — append-only, no updates/deletes.
  - GRANTs + RLS: internal read via existing permission helpers; writes only via SECURITY DEFINER functions; no client-side state mutation.
- Resolution helper `resolve_stage_sla(process_type, stage_name, step_id)` that prefers the configured `sla_configurations` row (respecting `sla_unit` and `calendar_profile_id` working days when a profile is attached) and falls back to `approval_steps.sla_hours` — so existing behaviour is preserved where nothing is configured.
- Hook stage start/complete into existing workflow transition paths (`perform-workflow-action`, return/registration action functions) and extend `rfi_pause_sla` to also emit paused/resumed events on the stage instance. Keep `workflow_instances` pause fields as-is for backward compatibility.
- Extend `sla-escalation-sweep` to mark `breached`, write the breach event + audit row, and emit the breach notification exactly once (guarded by `first_breach_notified_at` and the existing dispatch uniqueness).
- Frontend: `workflowSlaResolver` reads the stage instance when present (config-driven due date), so Applications queue, Returns queue, Complaints list and workflow panels show consistent countdown/state with no component rewrites. Add an SLA events timeline section to the workflow panel and an escalation-dispatch view in `SlaManager`.

### 1B — Consolidated decision view (LIC-DEC-001)
- Keep `ApproverDecisionView` as the single cockpit; fill the missing consolidated blocks by reusing existing hooks/panels: submission history, assigned officer, SLA stage state, RFIs and responses, legal/compliance notes, payment state, previous decisions/actions, and audit timeline.
- Add an explicit **Outstanding mandatory gates** block driven by existing sufficiency/decision-gate configuration, and enforce it server-side: the decision RPC/edge path rejects a final decision while a mandatory gate is unmet or an SLA-pausing RFI is open, with a denial audit + security event.
- No invented AI or regulator content: sections render "not configured" / "no data" states.

### 1C — Letter & certificate (LIC-DEC-002)
- Keep the template-driven preview; add required-merge-field validation that blocks issuance with a clear list of missing fields.
- On issuance, persist an immutable artifact version (reuse `license_certificates` / document-version patterns) capturing the rendered template version, merge data snapshot, rationale, conditions, issuing regulator and effective/expiry dates; later template edits create new versions only.
- Audit generation, approval and issuance separately.

### 1D — Security event log (AUD-SEC-001)
- Coverage audit of denied-access paths (route guards, `enforce_action`, RLS-denied client paths, edge authorization failures, direct object-ID access) and wiring of the missing ones through the existing `log_security_event_as_actor` path with correlation ID from `src/platform/http/correlation.ts`.
- Metadata allowlist so no tokens/secrets/credentials are stored; console gains event-type/actor/resource/date filtering and audited export.
- RLS persona test proving non-admin personas cannot read the table.

### 1E — Override registry (AUD-OVR-001)
- Coverage audit of every consequential human override; route them through one helper writing `rule_overrides` with original system value, replacement, mandatory justification, actor, timestamp, source module/object and optional evidence.
- Enforce mandatory justification server-side (not just in the dialog) and make rows append-only (no update/delete policies), so original outputs stay reconstructable.

## Verification (gate before reporting)
- Targeted tests: SLA normal / near-due / RFI pause (elapsed frozen) / resume / breach / single escalation / unauthorized SLA mutation; decision gating; override justification enforcement; security-event RLS.
- pgTAP persona/RLS tests for the new tables; migration validation; build + type check.
- Browser verification in the running preview: application queue countdown, workflow SLA timeline, Decision tab across complete / incomplete / RFI-open / unauthorized / historical cases, letter + certificate preview and issued artifact, security console, override register.
- Deliverable: Phase 1 table — Requirement | Implementation evidence | Runtime test | RLS test | Audit test | Regression test | State — with states limited to VERIFIED / PARTIALLY VERIFIED / NOT VERIFIED / IMPLEMENTED — EXTERNAL VERIFICATION STILL REQUIRED.

Stop after Phase 1.
