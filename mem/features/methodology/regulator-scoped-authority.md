---
name: Methodology regulator-scoped authority
description: Four never-collapse distinctions for supervisory methodology authority — regulator scope, methodology vs assessment approval, reference vs regulator approval, technical vs substantive authority
type: feature
---

Enforced in Postgres, proved by `scripts/verify-supervisory-regulator-methodology-authority.sql`
(REG-AUTH-01..16). Full contract: `docs/architecture/supervisory-methodology-regulator-authority.md`.

- **Regulator scope**: a domain permission (`aml_supervision.manage_config`) says *what*,
  never *for whom*. Adoption/approval resolve the regulator server-side through
  `user_has_regulator_authority` (built on `sec_role_scopes` / `sec_role_scope_values`,
  scope kind `regulator`). Fail-closed — never widen an unscoped grant to all regulators.
- **Methodology vs assessment approval**: `<domain>.methodology_approve` approves methodology
  policy; `<domain>.approve` approves an individual assessment. Never interchangeable.
  Recorded per domain in `supervisory_domain_authority.methodology_approval_permission`
  vs `assessment_approval_permission`.
- **Reference vs regulator approval**: a `MIPL_REFERENCE` version stays DRAFT, cannot be
  approved/activated in place, and can never carry a `supervisory_methodology_regulator_approval` row.
- **Technical vs substantive**: super admin may configure/adopt but is refused methodology
  approval — no break-glass into regulator policy. Maker/checker: neither author nor submitting
  reviewer may approve.
- Approval register rows are immutable and regulator-scoped on read; enterprise oversight
  (`audit_management.view`, `executive_oversight.view_cross_module_audit`) reads across regulators.
- Revocation blocks activation only; it does not deactivate an already ACTIVE methodology (open policy decision).
