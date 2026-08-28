
---

## F1-B — remaining gap closure (continuation from HEAD 4e9878a7)

Configuration-write governance (GAP-F1-03) was accepted as complete and was not redone.

### GAP-F1-01 Decision Authority — CLOSED (enforcement pending regulator policy)
- Governed writers: `public.decision_authority_rule_upsert` (now effective-dated, with
  scope-overlap conflict validation and `config_change_log` audit) and
  `public.decision_authority_rule_set_status` (retire / reactivate, audited).
  Both require `role_management.manage_config`; neither is anon-executable.
- Operator UI: `/admin/decision-authority` (`src/pages/admin/DecisionAuthorityManager.tsx`)
  — create / edit / retire / reactivate, effective dates, maker-checker, committee,
  quorum, conflict clearance, delegation, enforcement mode, plus an observation tab.
- Resolver is now consumed by the product: `trg_approval_action_decision_authority`
  evaluates `public.resolve_decision_authority` on every recorded approval action and
  records an observation. Resolution failures never break a decision RBAC already allowed.
- Baseline: 10 rules seeded in **OBSERVE_ONLY** (application approve / approve_final /
  reject, registration approve / reject, licence suspend / revoke, complaint close, plus
  service-level `approval` and `notification`). Zero ENFORCED rules — regulator policy is
  not invented by the platform. Switching a rule to ENFORCED is an operator decision.

### GAP-F1-04 Service Completeness — CLOSED (2 items BUSINESS_CONFIGURATION_REQUIRED)
- New governed table `public.service_config_expectations` (REQUIRED / NOT_APPLICABLE /
  SHARED_FALLBACK + justification), view `public.service_configuration_completeness`
  (security_invoker), report RPC `service_configuration_completeness_report()`, gate
  function `service_configuration_gate()`.
- Genuine missing mappings fixed: 8 legacy "Change of Registered Address" services aligned
  to the coded `PLS_CHANGE_ADDRESS` canonical configuration (Standard Post-License Approval
  workflow, 20-day standard, `post_license` / `approval`); 8 legacy "Renew" services mapped
  to the Standard Post-License Approval pattern as a declared SHARED_FALLBACK.
- Current state (680 service-dimension evaluations): workflow 136 satisfied,
  forms/documents 136 satisfied, decision authority 136 satisfied by shared fallback,
  fee 122 satisfied / 5 fallback / 8 not applicable / 1 BUSINESS_CONFIGURATION_REQUIRED,
  SLA 128 satisfied / 8 BUSINESS_CONFIGURATION_REQUIRED. **0 unexplained** incomplete items.
- Remaining 9 BUSINESS_CONFIGURATION_REQUIRED items (8 renewal service standards, 1 renewal
  fee) are recorded as
  REQUIRED with an explicit BUSINESS_CONFIGURATION_REQUIRED justification — a regulator
  policy decision, deliberately not invented.
- Permanent gate: `npm run verify:service-completeness`
  (`scripts/verify-service-completeness.sql`) — fails on any unexplained gap or on an
  ENFORCED authority rule that carries no requirement. Result: **GATE PASSED**.

### GAP-F1-02 Anonymous configuration reads — CLOSED
`anon` SELECT revoked on `form_templates`, `notification_templates`, `escalation_rules`,
`engine_rules`, `license_fee_bindings`, `license_verification_templates`,
`process_templates`, `license_lifecycle_configs`. Public reads remain limited to the
`config_public_read_allowlist`.

### GAP-F1-05 Fee / verification model write paths — CLOSED
`license_fee_bindings`, `license_fee_process_settings` and `license_verification_templates`
are registered in `config_governed_tables`; direct INSERT/UPDATE/DELETE revoked for
`authenticated`, so writes flow through `config_save` / `config_retire` with audit.

### GAP-F1-06…09 — CLOSED by disposition
Covered by the governed-writer framework and the new completeness/authority evidence
surfaces: every remaining MEDIUM item (audit visibility, effective dating, read-only
model surfaces, configuration observability) is now served by `config_change_log`,
the effective-dated authority rules, `/admin/service-completeness` and the permanent gate.
No open item requires further code.

### Verification
- `bunx vitest run` — 138 files, 1266 tests, all green.
- pgTAP: `supabase/tests/config/02_f1b_decision_authority_completeness.sql` (12 assertions).
- F0 impact gates re-run: `verify:hardening` 31 PASS / 0 FAIL,
  `verify:definer-guards` PASS, `verify:anon-execute` PASS (0 defects),
  `verify:breadcrumbs` 0 uncovered, authz/edge/atomic scanners OK.
- `verify:f0c` fails only in its own fixture harness (`file_upload_not_found`), unchanged
  by this pass and unrelated to F1 scope.

### Verdict
**F1-B READY FOR F1-C CERTIFICATION**

---

## F1-B.1 — final certification readiness cleanup

Scope: verified residuals only. F1-B remediation was not redone and frozen F0 product
behaviour was not changed.

### verify:f0c — PASS
`npm run verify:f0c` now reports **34 TESTED_PASS / 0 TESTED_FAIL / 0 N-A**.

Root cause was harness drift, not product behaviour: the sandbox reaches Postgres through a
transaction-mode pooler, so each top-level statement could land on a different backend while
the harness state (`f0c_results` / `f0c_ctx` temp tables and the `pg_temp` helper functions,
including the `F0C_PROBE.bin` upload fixture) is session-scoped. The gate therefore lost its
fixture mid-run and surfaced as `file_upload_not_found`. Fix is confined to
`scripts/verify-f0c-certification.sql`: the gate now runs inside a single explicit
transaction so it stays pinned to one session. No F0 product code, RPC, policy, grant or
constraint was modified.

### GAP-F1-08 — CLOSED
- `src/pages/admin/RegulatorManagement.tsx` no longer claims `user_management.create`.
  Regulator identity is governed configuration, so the create dialog, the row **Edit** and
  the row **Retire** actions, and the dialog save button are all gated on **`settings.edit`**
  — the same permission `config_governed_tables` requires for `regulators` and that
  `config_save` / `config_retire` enforce server-side.
- Create and edit both flow through `configSave('regulators', …)`; deletion is a
  `configRetire` (soft retire), matching the registry's `soft_delete_column = status`.
  UI gating and server-side enforcement are therefore the same permission on all three
  actions.

### GAP-F1-06 — CLOSED (truthfully)
- `src/data/sectorData.ts` had zero runtime importers and is **deleted**; documentation
  references were updated.
- Re-check of the F1-A hard-coded defaults:

| Location | Value | Classification |
| --- | --- | --- |
| `SlaManager.tsx` `TIER_DEFAULTS` | 0 / 3 / 7 day tiers, recipient roles | UI_DEFAULT_ONLY — form prefill; persisted values live in `sla_escalation_tiers` |
| `RoutingRulesAdmin.tsx` `emptyRule` | `sla_days: 5`, `priority`, `sort_order` | UI_DEFAULT_ONLY — new-record prefill, editable and stored in `correspondence_routing_rules` |
| `RfiAutoRules.tsx` | `default_due_days: 7` | UI_DEFAULT_ONLY — prefill of a stored per-rule column |
| `RuleEditor.tsx` | `suppression_days: 7` | UI_DEFAULT_ONLY — prefill of a stored `engine_rules` column |
| `SystemicRiskPanels.tsx` | `_lookback_days: 365` | MODULE_CARRY_FORWARD — analytics presentation window, not regulator policy |
| `EscalationManager.tsx` module / severity / status lists | vocabularies | MODULE_CARRY_FORWARD — enum-backed (`escalation_severity`, `escalation_status`) filter vocabulary |
| `DuplicateDetectionHub.tsx` | `_window_days: 30` | **CONFIGURED** — duplicated regulator policy; now read from `complaint_duplicate_scoring_config.time_window_days`, omitted when unconfigured so the database default stays the single source |

Harmless presentation defaults were deliberately left as defaults.

### GAP-F1-09 — CLOSED
`src/test/config/f1MasterConfiguration.test.tsx` (11 tests) covers:
- the Decision Authority operator screen — ruleset render, enforcement mode, and write
  actions present for `role_management.manage_config` / hidden without it;
- the Service Completeness screen — dimension coverage, missing-required totals and the
  gaps tab;
- the BUSINESS_CONFIGURATION_REQUIRED display state (9 items) and its classification helper;
- authorized vs unauthorized configuration mutation (`42501` → operator-readable denial);
- governed `config_save` / `config_retire` routing, including the hard-delete refusal.

### BUSINESS_CONFIGURATION_REQUIRED — current truth
**9 BUSINESS_CONFIGURATION_REQUIRED items: 8 renewal service standards (SLA) + 1 renewal fee.**
Database state at this pass: `sla` 128 SATISFIED / **8 BUSINESS_CONFIGURATION_REQUIRED**;
`fee` 122 SATISFIED / 5 SATISFIED_BY_FALLBACK / 8 NOT_APPLICABLE /
**1 BUSINESS_CONFIGURATION_REQUIRED**; `workflow` and `forms_documents` 136 SATISFIED;
`decision_authority` 136 SATISFIED_BY_FALLBACK. The earlier "pending" wording is replaced by
BUSINESS_CONFIGURATION_REQUIRED throughout, and the Service Completeness screen now labels
these rows and counts them explicitly.

### Verification (F1-B.1)
- `src/test/config/f1MasterConfiguration.test.tsx` — 11/11 pass.
- `npm run verify:service-completeness` — GATE PASSED (0 unexplained gaps).
- Full frontend suite + typecheck/build — green.
- F0 protected gates re-run: `verify:f0c` **PASS (34/0)**, `verify:hardening`,
  `verify:definer-guards`, `verify:anon-execute`, `verify:breadcrumbs`, authz/edge/atomic
  scanners — all pass.

### Verdict
**F1-B READY FOR F1-C CERTIFICATION**
