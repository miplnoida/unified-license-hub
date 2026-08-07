# Phase 8 — Market Surveillance / Conduct Residuals

Phases 6 and 7 are implemented. This plan covers Phase 8 only, then stops for manual verification. Complaints, investigations and enforcement are not rebuilt.

## Verified current state (inspected this turn)

- `conduct_monitoring_rules` (3 rows) holds `name, description, scope, rule_type, definition jsonb, frequency, risk_delta, active`. There is **no** rule code, no first-class threshold/metric/lookback columns, and **no** version table — only `conduct_monitoring_rule_runs` for executions. Later edits to a rule therefore change the meaning of past results.
- `conduct_monitoring_results` (6,128 rows) records `rule_id, entity_id, product_id, evaluated_at, matched, metrics, alert_id`. There is **no** observation period (start/end), no instrument, no rule snapshot, no reviewer, no disposition, no evidence links.
- `conduct_alerts` is the closest existing signal object: it does carry `explanation`, `rule_snapshot`, `source_record_ids`, `window_start/window_end`, `severity`, `triage_rule_id`, `escalation_id`. Its status vocabulary is only `open | acknowledged | closed` — the FRD disposition states `UNDER_REVIEW`, `FALSE_POSITIVE`, `MONITOR`, `ESCALATED` do not exist, and there is no reviewer/disposition rationale field.
- No surveillance workspace route exists. Conduct routes are `/conduct`, `/conduct/alerts`, `/conduct/actions`, `/conduct/entities`, `/conduct/supervision-loop`, `/conduct/investigations`, plus `/admin/conduct/monitoring-rules`.
- `conduct_investigations` has `source_type/source_id`, but the only creation path is the manual dialog in `Investigations.tsx` (`source_type` chosen from a dropdown). Existing rows are `manual`, `thematic`, `complaint`. There is no signal → supervisor review → referral path and no RPC that carries signal provenance into an investigation.

Classification: 8A MISSING (signal disposition lifecycle + workspace), 8B PARTIAL (rules lack code/threshold/lookback/version; results lack observation period and rule snapshot), 8C MISSING (referral with preserved provenance).

## What will be built

### 8A Market Surveillance workspace and signal object
- Extend `conduct_alerts` additively into the surveillance signal record rather than creating a parallel table: add `disposition` (`NEW`, `UNDER_REVIEW`, `FALSE_POSITIVE`, `MONITOR`, `ESCALATED`, `CLOSED`), `disposition_reason`, `reviewed_by`, `reviewed_at`, `observation_start`/`observation_end` (backfilled from `window_start/window_end`), `instrument_ref`, `monitoring_result_id`. Existing `status` is left untouched so current alert screens keep working.
- New `conduct_signal_evidence` (signal, document reference, note, added_by/at) and `conduct_signal_events` (append-only: from/to disposition, actor, reason, timestamp) with an append-only trigger and no client UPDATE/DELETE grants.
- New `set_conduct_signal_disposition` RPC (`SECURITY DEFINER`, `set search_path = public`, actor from `auth.uid()`): validates the transition, requires a reason for `FALSE_POSITIVE`/`CLOSED`, writes the event row. Client cannot write disposition directly.
- New route `/conduct/surveillance` (Market Surveillance workspace) with disposition tabs, severity/rule/entity filters, and a signal detail drawer showing rule fired, threshold crossed, observation period, source records, evidence and disposition history. Copy makes explicit that a signal is not a confirmed misconduct finding.

### 8B Configurable surveillance rules with versions
- Additive migration on `conduct_monitoring_rules`: `code` (unique), `metric`, `source_dataset`, `threshold_value`, `comparison_operator`, `lookback_days`, `current_version` — populated from the existing `definition` jsonb so the 3 live rules keep behaving identically; `definition` remains the execution contract.
- New `conduct_monitoring_rule_versions` (rule, version, snapshot jsonb, effective_from, created_by/at), append-only. A trigger bumps the version and writes a snapshot whenever a rule's definition/threshold/lookback/active state changes.
- Signal generation stamps `rule_version` plus the resolved threshold and matched source record ids so every triggered signal explains what fired, which records caused it, and what threshold was crossed. Existing generation paths are extended, not replaced.
- `MonitoringRules.tsx` gains code/metric/threshold/lookback fields, active toggle, and a version history panel.

### 8C Escalation to formal investigation
- New `refer_conduct_signal_to_investigation` RPC: supervisor permission only, requires the signal to be in `UNDER_REVIEW`, creates the investigation with `source_type='surveillance_signal'` and `source_id=<signal id>`, links back onto the signal, sets disposition `ESCALATED`, and writes the event row. Original signal data is never mutated beyond disposition/linkage.
- Signal drawer gets "Refer to investigation" (gated by permission), and `InvestigationDetail.tsx` shows an originating-signal provenance block linking back to the signal, its rule and its version.

## Tests
- pgTAP `supabase/tests/phase8/`: disposition transition validity and reason enforcement; event log append-only; rule version bump on edit and immutability of old versions; referral gating (non-supervisor refused, wrong-disposition refused) and provenance persistence; RLS persona matrix including direct-ID access by a non-conduct user and a licensee.
- RBAC oracle entries for the two new RPCs.
- Vitest for disposition bucket derivation, threshold explanation formatting and drill-through link mapping.

## Technical notes
- All migrations additive; complaints, investigations, enforcement, triage engine, thematic reviews and supervision loop behaviour unchanged.
- Reused: existing `conduct_alerts` generation/triage engine, escalation tables, document storage, Phase 1 SLA where due dates apply.
- Not built: a second alerting engine, a parallel escalation engine, any relaxation of service-role boundaries.

## Output after completion
Per-requirement table (FRD ID, before, missing gap, change, DB/RLS, automated test, manual test, final state), files changed, migrations, RPCs, policies, assertion counts, known limitations, and click-by-click manual verification steps. Then stop; Phases 9–12 remain untouched.
