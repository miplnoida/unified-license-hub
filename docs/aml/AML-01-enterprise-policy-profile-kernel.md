# AML-01 — Enterprise Configuration Kernel & AML/CFT Policy Profile

Baseline HEAD: `ed142a701781cd7c819ba93cdc64a655a5c980af` (matched expected).
Preservation contract: `docs/aml/AML-00-enterprise-baseline-preservation-lock.md` — unchanged and honoured.

## 1. Architecture

```
MIPL reference package  →  regulator adoption  →  Supervisory Policy Profile
        →  exact versioned component bindings  →  review  →  approval  →  activation
```

The kernel is generic (`supervisory_policy_*`); AML/CFT is its first consumer. It stops at the
configuration layer: operational assessments still resolve through
`supervisory_methodology_resolve`, and `supervisory_policy_profile_resolve` reports
`binds_operational_assessments = false`.

## 2. Model

| Object | Purpose |
| --- | --- |
| `supervisory_policy_component_type` | Component catalogue. METHODOLOGY and CALCULATION_CONFIG available; 11 future types registered unavailable. |
| `supervisory_policy_domain_component_requirement` | **Server-owned requirement floor** per domain/component: requirement, required_for_approval, required_for_activation, is_locked, rationale. Read-only to signed-in users. |
| `supervisory_policy_profile` | Governed container: code, version, domain, regulator, status, origin, lineage, effective dating, maker/checker stamps. |
| `supervisory_policy_profile_binding` | Exact component version bound per component type (one per type). |
| `supervisory_policy_profile_requirement` | Profile-specific requirement request (may only be stricter). |
| `supervisory_policy_profile_event` | Append-only history. |

AML_CFT floor: METHODOLOGY REQUIRED (locked), CALCULATION_CONFIG REQUIRED (locked).
Effective requirement = domain minimum + profile request; a locked floor cannot be edited, an
unlocked floor can only be made stricter (`supervisory_policy_requirement_effective`).

## 3. Adoption orchestration (Correction A)

`supervisory_policy_profile_adopt_reference` now, in one transaction:

1. proves domain + regulator authority (`supervisory_domain_require_manage_for_regulator`);
2. creates the regulator DRAFT profile (`REGULATOR_ADOPTED`);
3. for each reference binding, calls the component's own governed adoption —
   for METHODOLOGY the existing `supervisory_methodology_adopt_reference`;
4. binds the resulting **regulator-owned** methodology and refuses any MIPL-reference binding;
5. records `COMPONENT_ADOPTED` provenance (`via = supervisory_methodology_adopt_reference`) and audit.

Component types with no governed adoption operation raise
`component_adoption_not_implemented`. Failure anywhere leaves no profile and no partial binding.

## 4. Governance

DRAFT → REVIEW → APPROVED → ACTIVE → RETIRED, rationale ≥ 10 chars on approval/activation/retirement;
author cannot approve; submitting reviewer cannot approve; approval requires the dedicated
`aml_supervision.policy_approve` right within the profile's regulator scope (granted to `aml_head`);
approved/active profiles are frozen — change control is a new version that supersedes; activation
supersedes the previous active profile in the same scope and uses the same effective requirement
contract as approval.

## 5. Reference state and readiness (truthful)

MIPL package `AML-CFT-POLICY 1.1` binds `AML-CFT-RBA 1.1` (DRAFT / MIPL_REFERENCE). No calculation
configuration exists, so an adopted AML profile reads:

```
Methodology          PENDING_COMPONENT_APPROVAL (regulator draft, own governance)
Calculation policy   MISSING
Approval             BLOCKED
Activation           BLOCKED
```

No scoring value, band, matrix cell or materiality value was created.

## 6. UI

`/admin/supervisory-policy-profiles` (register) and `/:profileId` (overview, components, compare,
history). Locked domain requirements render as "Required — Domain requirement <reason>" with no
editable control; enforcement is in the RPC, not the screen.

## 7. AML-00 closures

- Eight `/supervision/aml*` routes registered on the existing `aml_supervision.view`; verified by
  `scripts/verify-aml-route-register.sql` (ROUTE-01..06 PASS).
- `scripts/verify-epic-3-aml-closed-loop.sql` fixture repaired: test-only methodology version
  `1.1-EPIC3-CERT`, current dimension vocabulary (`STR_GOVERNANCE`, `SANCTIONS_CONTROLS`).
  Gates A–Z PASS except G/H, reported as
  `BLOCKED (PRE_EXISTING_POLICY_OR_METHODOLOGY_BLOCKER)` because no approved calculation
  configuration exists to produce a calculated rating, and Z3 which lists 11 inherited
  unallowlisted routines (the three new policy guards were fixed).

## 8. Verification

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-policy-profile-kernel.sql` | PROFILE-01..40 + PROFILE-REQ-01..08 PASS (transactional, rolled back) |
| `scripts/verify-aml-route-register.sql` | ROUTE-01..06 PASS |
| `scripts/verify-epic-3-aml-closed-loop.sql` | fixture repaired; A–Z PASS except G/H BLOCKED (policy) and Z3 inherited |
| `tsgo --noEmit` | clean |
| Supabase linter | 1667 findings, 6 types — identical to the pre-AML-01 baseline; no new type or count |

## 9. Preservation

21 approved v1.0 assessments still bound to v1.0; 28 assessments total unchanged; risk of record
unchanged; v1.0 ACTIVE; v1.1 DRAFT/MIPL_REFERENCE with 70 questions, 87 facts and 8 UNAPPROVED
parameters; zero calculation configurations. Nothing dropped, renamed or deleted.

## 10. Open blockers

`PRE_EXISTING_POLICY_OR_METHODOLOGY_BLOCKER`: CALC-05/06/09/11, AMLH-09, LINK-11 (22 legacy links),
Epic-3 G/H. `INHERITED_NON_AML_REGRESSION`: unapproved `ChartNetwork` icon, missing Detection and
Management Assurance breadcrumbs, Portfolio Intelligence action coverage.

## 11. AML-02 readiness

Ready: generic component catalogue, exact bindings, requirement floor, adoption orchestration,
lifecycle and read models. Not started: programme/applicability architecture, runtime binding of
assessments to a policy profile, and any calculation or materiality policy — the latter remains a
supervisory-owner decision.
