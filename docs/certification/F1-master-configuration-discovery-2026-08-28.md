# F1-A — Master Configuration Discovery & Enterprise Gap Register

Track: A (Enterprise Foundation) · Pass: **A — Discovery only, no remediation**
Baseline: HEAD at time of run (post F0 freeze, `docs/certification/F0-platform-foundation-final-certification-2026-08-28.md`)
Method: database introspection (catalogue, grants, RLS, RPC census) + source census of `src/pages/admin`, `src/pages/settings`, `src/routes`.
No schema, data, policy, or source change was made in this pass.

---

## 1. Scope and definition of "Master Configuration"

Master Configuration is the set of governed, tenant-level reference and rule data that
determines how the platform behaves for a regulator, without code change:

| Domain | Primary configuration tables |
| --- | --- |
| Regulatory identity | `regulators`, `regulatory_functions`, `regulator_operating_scopes` |
| Classification / taxonomy | `sectors`, `sub_sectors`, `categories`, `classification_schemes`, `classification_values`, `classification_aliases`, `common_sector_families` |
| Authorization model | `authorization_schemes`, `authorization_classes`, `authorization_class_activities` |
| Services catalogue | `services` (136 rows) |
| Process / workflow | `approval_workflows`, `approval_steps`, `approval_workflow_types`, `process_templates`, `license_verification_templates` |
| Decision authority | `decision_authority_rules`, `decision_authority_observations` |
| Forms | `form_templates`, `form_applicability_rules`, `registration_form_configs`, `return_configurations` |
| Fees | `fee_types`, `fee_configurations`, `fee_components`, `fee_rules`, `late_fee_structures`, `late_fee_penalty_tiers`, `license_fee_bindings`, `license_fee_process_settings` |
| Time / SLA | `sla_configurations`, `business_calendar_profiles`, `business_calendar_holidays`, `prudential_process_sla_config` |
| Escalation | `escalation_rules`, `complaint_escalation_rules`, `integration_alert_rules`, `onboarding_alert_rules` |
| Notifications | `notification_event_configs`, `notification_event_channel_templates`, `notification_templates`, `correspondence_templates`, `correspondence_routing_rules` |
| Supervisory rules | `engine_rules`, `prudential_ewi_rules`, `group_ewi_rules`, `prudential_thresholds`, `conduct_triage_rules`, `conduct_monitoring_rules`, `conduct_alert_thresholds`, `fp_screening_configs`, `fp_screening_execution_rules`, `fp_sector_decision_rules` |
| Master data | `master_data_types` (6), `master_data_items` (20,950) |
| Environment / platform | `app_environment_config`, `payment_oversight_config`, `captcha_configurations`, `site_settings` |

## 2. Current-state population census

| Table | Rows | Reading |
| --- | --- | --- |
| `regulators` | 3 | populated |
| `regulatory_functions` | 12 | populated |
| `sectors` / `sub_sectors` / `categories` | 21 / 40 / 13 | populated |
| `services` | 136 | populated; **16 with `workflow_id IS NULL`**, **14 with no `fee_configurations` row** |
| `authorization_schemes` / `authorization_classes` | 20 / 30 | populated |
| `approval_workflows` (active) / `approval_steps` | 10 / 55 | consolidated (post-PLS consolidation) |
| `form_templates` | 197 | populated |
| `form_applicability_rules` | **0** | empty — applicability resolved elsewhere |
| `fee_configurations` / `fee_types` | 143 / 25 | populated |
| `fee_rules` | **0** | empty |
| `license_fee_bindings` | 10 | thin relative to 136 services |
| `sla_configurations` | **2** | effectively unconfigured for the process estate |
| `escalation_rules` | 14 | populated |
| `notification_event_configs` / `notification_templates` | 255 / 430 | populated |
| `decision_authority_rules` | **0** | empty (see GAP-F1-01) |
| `decision_authority_observations` | **0** | no evaluations recorded |
| `license_lifecycle_configs` | **0** | empty |
| `license_verification_templates` | 7 | populated |
| `process_templates` | 3 | thin |
| `classification_schemes` / `classification_values` | 5 / 8 | thin |
| `business_calendar_profiles` | 3 | populated |
| `engine_rules` | 1 | effectively unconfigured |
| `registration_form_configs` | 2 | populated |
| `return_configurations` | 4 | thin |
| `master_data_types` / `master_data_items` | 6 / 20,950 | populated |
| `application_form_requirements` | **0** | empty |

## 3. Configuration surface inventory (source)

`src/pages/admin` holds 60+ configuration screens and `src/pages/settings` 13, including
`OperatingStructure.tsx`, `MasterConfiguration.tsx` (mounted at `/admin/masters/sectors`,
`/sub-sectors`, `/categories`, `/services`), `RegistrationFormBuilder.tsx`, `SlaManager.tsx`,
`EscalationManager.tsx`, notification template/event configuration, F&P screening
configuration and reference-data screens.

Table-to-UI reachability (source references excluding generated `types.ts` and tests):

| Configuration table | UI reference count | Status |
| --- | --- | --- |
| `decision_authority_rules` | 0 | **no UI** |
| `license_verification_templates` | 0 | **no UI** |
| `license_fee_bindings` | 0 | **no UI** (read only via `license_fee_configuration_overview`) |
| `license_fee_process_settings` | 0 | **no UI** |
| `app_environment_config` | 0 | **no UI** |
| `business_calendar_profiles` | 1 | thin |
| `sla_configurations` | 1 | single surface |
| `fee_rules`, `form_applicability_rules`, `regulatory_functions`, `authorization_classes`, `payment_oversight_config` | 1 each | thin |
| `master_data_types`, `process_templates`, `license_lifecycle_configs`, `complaint_intake_rules`, `prudential_ewi_rules`, `authorization_schemes` | 2 each | present |
| remaining tables above | 3–7 | present |

## 4. Enterprise gap register (F1-A)

### GAP-F1-01 — Decision authority is installed but never configured or surfaced (closes RES-F0-DA-01)
- `public.resolve_decision_authority(...)` exists and is exercised by
  `supabase/tests/convergence/01_checkpoint_b_decision_authority.sql`.
- A governed writer already exists: `public.decision_authority_rule_upsert(...)` (SECURITY DEFINER,
  16 arguments incl. `_enforcement_mode`).
- `decision_authority_rules` has **0 rows**; `decision_authority_observations` has **0 rows**;
  the table is referenced from **no** source file outside generated types/tests.
- Consequence: every decision type resolves `mode=OFF`, `allowed=true`, `requires_review=true`.
  The control is fail-open-with-flag and, because nothing writes observations in product paths,
  the observation register cannot evidence supervisory decision authority.
- Severity: **HIGH** (certification-relevant control with no operator path).
- Disposition for F1-B: build the configuration surface over the existing RPC, seed a baseline
  ruleset in `OBSERVE_ONLY`, then promote per decision type.

### GAP-F1-02 — Anonymous read exposure of configuration tables
`has_table_privilege('anon', ...)` returns SELECT for, among others, `regulators`, `services`,
`sectors`, `sub_sectors`, `categories`, `fee_types`, `fee_configurations`, `fee_rules`,
`form_templates`, `notification_templates`, `notification_event_configs`, `sla_configurations`,
`escalation_rules`, `engine_rules`, `master_data_types`, `master_data_items`,
`license_fee_bindings`, `license_verification_templates`, `process_templates`,
`registration_form_configs`, `business_calendar_profiles`, `license_lifecycle_configs`.
Most are protected in practice by RLS (policies target `authenticated`), but
`master_data_items` carries `Public read master data items` with `qual = true` for role `public`,
so the grant is live for anonymous callers. The grant surface is far wider than the intended
public catalogue and is not backed by an allow-list equivalent to
`sec_anon_execute_allowlist` used for routines in F0-B5.
- Severity: **MEDIUM** (grant/RLS defence-in-depth divergence, one confirmed live anon read path).

### GAP-F1-03 — Configuration writes bypass a governed writer on high-impact tables
`authenticated` holds INSERT/UPDATE/DELETE directly on `fee_configurations`, `fee_types`,
`fee_rules`, `form_templates`, `notification_templates`, `notification_event_configs`,
`sla_configurations`, `escalation_rules`, `engine_rules`, `master_data_types`,
`master_data_items`, `services`, `regulators`, `license_fee_bindings`, `process_templates`,
`license_verification_templates`, `license_lifecycle_configs`, `registration_form_configs`,
`return_configurations`, `business_calendar_profiles`, `categories`. Protection is RLS-only,
typically `has_role(super_admin) OR has_role(admin)` — coarse legacy role checks rather than the
RBAC permission model (`has_permission` / `has_scoped_permission`) used by `form_templates`,
`escalation_rules` and `engine_rules`. Several of these tables carry **no** audit trigger
(`fee_configurations`, `fee_types`, `fee_rules`, `form_templates`, `license_fee_bindings`,
`process_templates`, `license_verification_templates`, `return_configurations`,
`registration_form_configs`, `sectors`, `sub_sectors`, `categories`), so configuration change
history is not provable.
- Severity: **HIGH** (configuration is regulatory evidence; no before/after record).

### GAP-F1-04 — Configuration coverage holes in the service estate
16/136 services have no `workflow_id`; 14/136 have no fee configuration; `application_form_requirements`,
`form_applicability_rules` and `fee_rules` are empty; `sla_configurations` holds 2 rows and
`engine_rules` 1. There is no completeness view or gate that reports "service X is not fully
configured", so gaps surface only at runtime as unrouted or unpriced matters.
- Severity: **HIGH** (operational correctness).

### GAP-F1-05 — Read-only fee/verification model with no operator write path
`useLifecycleConfigurationOverview` / `license_fee_simulate` / `process_preview` expose the P04
model read-only by design, but `license_fee_bindings`, `license_fee_process_settings` and
`license_verification_templates` have **no** configuration UI at all, so the model can only be
changed by migration.
- Severity: **MEDIUM**.

### GAP-F1-06 — Residual hard-coded taxonomy in source
`src/data/sectorData.ts` (98 lines) still exports `sectors`, `subSectors`, `categories`,
`countries` and `services` literals. It has **zero importers** — dead legacy configuration that
duplicates database truth and invites regression.
- Severity: **LOW** (hygiene / legacy retirement).

### GAP-F1-07 — Thin classification and process template baselines
`classification_schemes` (5) / `classification_values` (8) and `process_templates` (3) are too thin
to drive the 136-service, 21-sector estate; process behaviour therefore still depends on workflow
rows rather than versioned process templates.
- Severity: **MEDIUM**.

## 5. RES-F0-DA-01 disposition

RES-F0-DA-01 ("empty decision authority ruleset") is **reclassified as GAP-F1-01** with a concrete
remediation path: the writer RPC already exists and is tested, so the gap is a configuration-surface
and baseline-seed gap, not a schema gap. It remains **OPEN** at the end of F1-A.

## 6. F1-A verdict

Discovery complete. **7 gaps** registered (2 HIGH-severity control gaps, 1 HIGH operational gap,
3 MEDIUM, 1 LOW). No remediation performed in this pass, per charter.

Recommended F1-B sequencing:
1. GAP-F1-03 (governed writer + audit triggers on configuration tables) — everything else records against it.
2. GAP-F1-01 (decision authority configuration surface + OBSERVE_ONLY baseline).
3. GAP-F1-04 (configuration completeness view and gate).
4. GAP-F1-02 (anon grant allow-list for configuration tables).
5. GAP-F1-05, GAP-F1-07, GAP-F1-06.
