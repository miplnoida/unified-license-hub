
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
  fee 122 satisfied / 5 fallback / 8 not applicable / 1 pending, SLA 128 satisfied /
  8 pending. **0 unexplained** incomplete items.
- Remaining 9 pending items (8 renewal service standards, 1 renewal fee) are recorded as
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
