# Supervisory methodology — regulator authority contract

Permanent record of four distinctions that must never be collapsed. Every one of
them is enforced in Postgres and proved by
`scripts/verify-supervisory-regulator-methodology-authority.sql`
(REG-AUTH-01…REG-AUTH-16, 16 PASS / 0 FAIL).

| Distinction | Consequence |
| --- | --- |
| **Domain permission ≠ regulator scope** | Holding `aml_supervision.manage_config` proves *what* an officer may configure, never *for whom*. The regulator supplied to an adoption call is a target; authority is resolved server-side. |
| **Assessment approval ≠ methodology approval** | `aml_supervision.approve` decides an individual assessment. Methodology policy needs `aml_supervision.methodology_approve`. |
| **MIPL reference approval ≠ regulator approval** | A reference template stays `DRAFT`, cannot be approved or activated in place, and can never carry a row in the regulator approval register. |
| **Technical administration ≠ substantive approval** | `is_super_admin` may configure and adopt (technical authority). It is refused as methodology approval authority — there is no break-glass path to regulator policy. |

## 1. Canonical actor → regulator scope

No new scope model was invented. The canonical source is the `sec_*` security
model already in the platform:

```
sec_user_roles → sec_roles → sec_role_permissions → sec_permissions (module.action)
                          └→ sec_role_scopes (role × module × scope_type)
                                 └→ sec_role_scope_values (regulator ids)
```

`sec_scope_types` already registers a `regulator` scope (`value_kind = regulator`).
What was missing was an *enforcement* path: `user_scope_grants_for` treats a role
with no scope row as `all`, which is fail-open for policy authority. Two strict
helpers were added:

| Helper | Contract |
| --- | --- |
| `public.user_regulator_scope_for(uid, module, action)` | Reports the grant's regulator scope as `{qualified, all, unscoped, regulators[]}`. No super-admin short-circuit; an unscoped grant is reported as `unscoped`, never widened to all regulators. |
| `public.user_has_regulator_authority(uid, module, action, regulator_id)` | True only when the user holds `module.action` **and** an explicit scope decision covers that regulator (scope `all`, or the regulator listed). Fail-closed. |

Both are `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, with `EXECUTE`
revoked from `PUBLIC`.

## 2. Adoption

`supervisory_methodology_adopt_reference(reference_id, regulator_id, rationale)`
now resolves authority through
`supervisory_domain_require_manage_for_regulator(domain, regulator)`, which proves,
in order: authentication → the domain's `manage_config` permission → the regulator
exists → authority for **that** regulator. Platform administration may adopt for
any regulator; every other actor may not.

## 3. Approval

`REVIEW → APPROVED` requires all of:

1. the domain's dedicated `methodology_approval_permission`;
2. `user_has_regulator_authority` for the methodology's own `regulator_id`;
3. maker/checker — neither the author nor the submitting reviewer may approve;
4. no super-admin escape.

`APPROVED → ACTIVE` still requires a **current `APPROVED`** row in the register, so
a `REVOKED` current decision cannot satisfy activation.

## 4. Domain authority register

`supervisory_domain_authority` now separates the two approval concepts:

| Domain | `manage_config_permission` | `methodology_approval_permission` | `assessment_approval_permission` (contrast only) |
| --- | --- | --- | --- |
| `AML_CFT` | `aml_supervision.manage_config` | `aml_supervision.methodology_approve` | `aml_supervision.approve` |
| `PRUDENTIAL` | `prudential_supervision.manage_config` | `prudential_supervision.methodology_approve` | `supervisory_spine.approve` |
| `MARKET_CONDUCT` | *(none — gap)* | *(none — gap)* | `supervisory_spine.approve` |

`assessment_approval_permission` is recorded for documentation only and is never
consulted for methodology policy.

## 5. Role template principle

Methodology approval was **not** granted to every holder of assessment approval.

| Role | Assessment approve | Methodology approve |
| --- | --- | --- |
| `aml_supervision_supervisor` | yes | **no** |
| `aml_head` (designated methodology authority) | yes | yes |

Authority is configurable through the permission catalogue and role scopes; no
code performs a role-name check, and no regulator is forced to place the authority
with a particular title.

## 6. Approval register integrity and visibility

`smra_integrity_guard` (BEFORE INSERT OR UPDATE) enforces, in the database:

- the methodology exists and its origin is `REGULATOR_ADOPTED` or `REGULATOR_AUTHORED`;
- a `MIPL_REFERENCE` template can never carry an approval;
- `approval.regulator_id` equals `methodology.regulator_id` (NULLs included);
- `decided_by` holds the domain's methodology approval permission **within that
  regulator's scope**, and is not the submitter;
- `authority_permission` is stamped by the database, not by the caller;
- a recorded decision is immutable — record a new decision instead.

Read visibility (`supervisory_methodology_regulator_scope_readable`):

| Actor | Reads |
| --- | --- |
| Regulator-scoped AML/prudential user | only their own regulator's rows |
| Enterprise oversight (`audit_management.view`, `executive_oversight.view_cross_module_audit`) | all regulators |
| Super administrator | all regulators (platform administration) |
| Everyone else / anonymous | nothing |

The same rule narrows `supervisory_methodology` itself: versions carrying a
`regulator_id` follow regulator visibility, while domain-neutral versions and MIPL
reference templates stay visible to domain viewers.

## 7. Revocation — current behaviour

`decision ∈ {APPROVED, REVOKED}` with one `is_current` row per version. Recording a
`REVOKED` current decision blocks activation. It does **not** deactivate an already
`ACTIVE` methodology; no such business rule is approved. Automatic deactivation,
grace periods and in-flight assessment treatment are a **policy/governance
decision**, not an engineering default.

## 8. Known gap (platform backlog, not AML-blocking)

Market conduct has neither `market_conduct.manage_config` nor a methodology
approval permission. Methodology configuration for that domain is
super-administrator-only and methodology approval is refused outright. This is a
generic platform backlog item and does not block AML/CFT v1.1 review.
