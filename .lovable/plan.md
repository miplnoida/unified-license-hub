
# NOT-ESC-001 — Escalation & Alert Manager

## Consolidation approach

Today escalations live in five disconnected places: `complaint_escalation_cases` / `complaint_escalation_rules` / `complaint_escalation_log` (with the `complaint-escalation-sweep` job), `prudential_escalations` (2 live rows), `coordination_escalations` (empty), `conduct_alerts` + `conduct_alert_thresholds` (11 rows), and workflow SLA tiers driven by `sla-escalation-sweep` / `sla_escalation_dispatches`. Each has its own UI (`/complaints/escalations`, `/prudential/escalations`) and its own status vocabulary.

The approach is **one shared spine, module tables kept as satellites**:

1. New canonical tables `escalations`, `escalation_tier_events`, `escalation_ownership_events`, `escalation_notification_events`, `escalation_rules`.
2. Every existing module table gets a nullable `escalation_id` pointing at the spine. Module sweeps stop writing status/tier logic themselves and instead call one RPC, `escalation_raise(...)`, which creates or reuses the spine record and links back.
3. Module screens (`EscalationHub`, prudential `EscalationsList`) keep their layout but read tier/status/ownership from the spine through a compatibility view (`v_module_escalations`), so nothing existing breaks visually while there is a single source of truth.
4. The new central manager at `/admin/escalations` is a view over the spine — not a new silo.

## Shared model

`public.escalations`
- identity/source: `escalation_ref` (ESC-YYYY-NNNNNN), `source_module`, `source_event`, `source_rule_id`, `source_entity_type`, `source_entity_id`, `source_reference`, `correlation_id`, `metadata jsonb`
- classification: `escalation_type` (enum below), `severity` (critical/high/medium/low), `current_tier` (0–3), `status` (open, acknowledged, in_progress, escalated, resolved, closed)
- ownership: `assigned_role`, `assigned_user_id`
- timing: `created_at`, `acknowledgement_deadline`, `acknowledged_at/by`, `resolution_deadline`, `resolved_at/by`, `auto_escalate_paused_at`, `next_auto_escalation_at`
- outcome: `root_cause`, `resolution_narrative`

Enum `escalation_type`: `sla_warning`, `sla_breach`, `threshold_breach`, `fp_adverse_finding`, `pattern_alert`, `overdue_condition`, `investigation_delay`, `workflow_blockage`, `integration_failure`, `scheduler_failure`, `notification_delivery_failure`, `system_health_alert`.

History tables are append-only (BEFORE UPDATE/DELETE guard trigger raising an exception), covering tier history, ownership history, and notification history (each notification dispatch row id + channel + tier + outcome).

## Rules & routing configuration (`escalation_rules`)

Per rule: `source_module`, `escalation_type`, `initial_recipient_role`, `tier1/2/3_recipient_role`, `tier1/2/3_ack_threshold_minutes`, `tier1/2/3_template_id`, `tier1/2/3_channels text[]`, `business_hours_only`, `business_calendar_profile_id` (reuses existing `business_calendar_profiles`), `create_task`, `create_case`, `is_active`.

Constraints enforced in DB:
- every configured tier must have a recipient role (trigger validation, not CHECK, since it spans columns/tiers);
- all thresholds strictly positive;
- resolution narrative ≥ 50 characters on resolve (RPC + trigger);
- acknowledgement sets `auto_escalate_paused_at` and clears `next_auto_escalation_at` where the tier config requires pause-on-ack;
- unresolved escalations past `next_auto_escalation_at` advance one tier (max 3) via sweep;
- resolve notifies every recipient recorded in tier history;
- history immutable; resolving/closing never touches the source alert row.

Deadline maths uses the existing business-calendar helpers when `business_hours_only` is on (add `escalation_business_deadline(profile_id, from_ts, minutes)` on top of `business_calendar_profiles`).

## RPCs (all SECURITY DEFINER + `enforce_permission`)

`escalation_raise`, `escalation_acknowledge`, `escalation_take_ownership`, `escalation_escalate_tier` (manual), `escalation_resolve`, `escalation_close`, `escalation_feed` (filters + keyset paging), `escalation_detail` (record + tier/ownership/notification history + source event + related `notification_dispatch_log` rows), `escalation_sweep` (auto tier progression + deadline evaluation), `escalation_health_report`.

New permission module `escalation_management` with actions `view`, `acknowledge`, `own`, `escalate`, `resolve`, `configure`, `view_system_health`; granted to super_admin/admin/supervisor by default. Module isolation: non-admins only see escalations for modules they hold permission on plus records assigned to them (reuses `user_scope_for` / `is_record_assigned_to_user`).

## Central manager screen

Route `/admin/escalations` (sidebar under Admin), `EscalationManager.tsx`:
- KPI strip (open, unacknowledged past deadline, tier 3, breached resolution);
- active escalations table: ref, module, type, severity, tier, source reference (deep link to the case screen), owner, age (hours < 48, else days), acknowledgement status chip, resolution status chip;
- filters: module, type, severity, tier, status, owner, date range, plus text search on reference;
- detail drawer `EscalationDetailDrawer.tsx`: source event details, full tier history, ownership history, related notification delivery records, root-cause textarea, resolution narrative (with live 50-char counter), and the four actions — Take Ownership, Acknowledge, Escalate to Next Tier, Resolve — each permission-gated;
- tabs: **Active**, **Resolved**, **Rules** (`EscalationRulesAdmin` — full R-01 config form), **System Health** (R-01 only).

## System health

`escalation_health_signals` view aggregating existing signals: `integration_logs` failures, `job_queue` failed rows, `notification_outbox`/`notification_dispatch_log` failures (repeated email failures, SMS provider failures), scheduler misses from sweep run tables. `escalation_raise` is called with `severity='critical'` for these, dispatching immediately (bypassing digest deferral) via `dispatch-notification-event`, and a configured IT-leadership role receives the tier escalation when a critical health alert stays unresolved beyond its threshold.

## Migration & compatibility

- Backfill: 2 `prudential_escalations`, 11 `conduct_alerts`, 0 complaint cases, 0 coordination rows → spine rows with mapped type/severity/tier/status, `source_module` set accordingly, `escalation_id` written back.
- `v_module_escalations` compatibility view + adapter hooks so existing module screens read from the spine.
- `complaint-escalation-sweep`, `prudential-monitoring-sweep`, `sla-escalation-sweep`, `overdue-action-sweep`, `notification-failure-sweep` updated to call `escalation_raise` instead of writing bespoke escalation rows; a new `escalation-sweep` function (pg_cron every 15 min) handles tier progression and deadline evaluation.

## Tests

pgTAP `supabase/tests/escalations/`: auto tier progression, acknowledgement, timer pause, manual tier escalation, ownership transfer, resolution validation (<50 chars rejected), resolution notifications to all tier recipients, RBAC per persona, module isolation, system-health alert creation + IT escalation, business-calendar timing, and compatibility regressions for complaint + prudential flows. Vitest unit tests for the frontend filter/age helpers.

## Technical notes

- Enum values are additive; no existing enum is altered.
- History immutability via triggers keeps `audit_logs` writes as-is (new actions: ESCALATION_RAISED / ACKNOWLEDGED / OWNED / TIER_ADVANCED / RESOLVED / CLOSED).
- Every new public table ships with GRANTs + RLS in the same migration.
- Known risks: sweep double-firing during the cutover window (mitigated by a unique key on `source_module + source_event + source_entity_id + source_rule_id + current_tier` for open records), and business-hours deadline drift for profiles without holidays configured.
