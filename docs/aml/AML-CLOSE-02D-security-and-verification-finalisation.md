# AML-CLOSE-02D — Security Boundaries & Verification Finalisation

Environment: non-production (Lovable Cloud project). Date: 2026-10-03. Scope limited to the three permission findings, the outdated verifier setups and failure classification. AML-CLOSE-03 not started.

## A. Verdict

**PASS**

The whole **AML-CLOSE-02 / 02A / 02B / 02C / 02D governed-runtime foundation is TECHNICALLY CLOSED**. Historical remediation (H) and regulator decisions (R) remain open and are listed separately in §J and §N.

## B. Permission findings at start

| # | Saved check | Observed failure |
|---|---|---|
| P1 | epic-3 closed loop **Z2** | `FAIL Z2: an ordinary AML officer still holds view_confidential` |
| P2 | consequence-linkage **ACTION-06** | `FAIL ACTION-06: the contract does not refuse the missing permission` — the officer was offered, and allowed, `REQUIRE_REASSESSMENT` (needs `aml_supervision.review`) |
| P3 | outcome-effectiveness **EVAL-05** | `FAIL EVAL-05: restricted evidence was cited without authority` — the officer cited restricted evidence in an effectiveness evaluation |

Reproduced before any change: `has_permission(officer,'aml_supervision','review') = true` and `view_confidential = true` for persona `aml_supervision_officer@…` (`b8eaf680…`).

## C. Root cause

All three had **one root cause**, found by analysis before any change:

| Item | Finding |
|---|---|
| Actor / persona | `aml_supervision_officer` TEST persona (ordinary AML officer) |
| Object | `sec_user_roles` row: role **`aml_head`** (Head of AML/CFT), `status=active`, `assigned_by = the officer itself`, created 2026-09-12 14:07 UTC |
| How obtained | Not through the UI or `sec_assign_user_roles` (no `security.assign_user_roles` audit row exists). Fourteen saved verifiers contain fixtures that insert `aml_head` for the officer with `assigned_by = self` ("transaction-scoped, rolled back"). One run committed instead of rolling back, so the fixture grant persisted. |
| Path to data | Permission engine `has_permission → sec_has_permission → sec_user_permissions` (security-definer). `aml_head` carries `view_confidential`, `review`, `approve`, `policy_approve`, `methodology_approve`. Every RPC and RLS policy that checks those permissions then admitted the officer. These were not frontend-only gaps. Views and RPCs (`supervisory_finding_can_read`, the consequence contract `supervisory_consequence_view`/`_record`, the evaluation evidence check) were already correctly guarded. |
| Intended boundary | The existing model, unchanged: confidential AML material, review, approval and policy approval belong to supervisor / Head of AML/CFT roles (`aml_supervision_supervisor`, `aml_head`). The ordinary officer has `view, create, edit, submit, examine, finding_manage, remediation_manage`, plus `manage_config, view` via the methodology-configuration-officer role. |

The cause was a corrupted grant, not a wrong rule. No RLS policy, RPC or role definition needed changing.

**Additional finding revealed once Z2 passed (Z3):** 11 project routines from the AML-CLOSE-01/02 policy work were executable by **anonymous** callers without an allowlist entry: `supervisory_policy_profile_effective`, `_component_capability`, `supervisory_assessment_policy_basis`, `supervisory_policy_profile_compatibility`, `supervisory_policy_vocabulary`, `supervisory_policy_component_content_hash`, plus 5 trigger functions. This was a real technical (T) defect and is fixed below.

## D. Security fixes (database-side)

1. **Revoked the leaked grant** (migration): the officer's `aml_head` row is set to `inactive`, `effective_until=now()`. The row is kept for history and an `audit_logs` entry `security.revoke_self_granted_role` records why. The officer's real roles are unchanged.
2. **Structural self-grant guard**: `BEFORE INSERT OR UPDATE` trigger `trg_sec_user_roles_no_self_grant` refuses any activation where `assigned_by = user_id` unless the assigner is a super administrator (`self_role_grant_refused`, 42501). It applies to every write path: RPC, migration, fixture or raw SQL.
3. **Anonymous boundary**: EXECUTE revoked from `PUBLIC, anon` on the 6 RPCs (still granted to `authenticated, service_role`). EXECUTE revoked from all API roles on the 5 trigger functions. Triggers still fire.
4. **Fixture hygiene** (14 verifier files): TEST role grants are now issued by the TEST super administrator persona, and re-activated inside the transaction with `ON CONFLICT … DO UPDATE` (status, assigner, `effective_until=NULL`). They can no longer self-grant or silently persist an elevation.

## E. Persona matrix (affected AML data)

| Persona | AML list / detail | Confidential findings / restricted evidence | Review / approve / consequence `REQUIRE_REASSESSMENT` | Role self-grant | Policy RPCs |
|---|---|---|---|---|---|
| Ordinary AML officer (assigned) | Allowed, portfolio-scoped | **Refused** | **Refused** (`PERMISSION_MISSING`) | **Refused** | Allowed (authenticated) |
| AML supervisor | Allowed | Allowed (role grants `view_confidential`) | Allowed (maker/checker still applies) | Refused | Allowed |
| Head of AML/CFT (role) | Allowed | Allowed: head of function by design | Allowed | Refused | Allowed |
| Super administrator | Allowed (break-glass by design) | Allowed | Allowed | Permitted (administrative) | Allowed |
| Licensee / entity user | **Refused** (0 rows on 00830/00836/00838 and facts) | Refused | Refused | Refused | — |
| Anonymous | Refused | Refused | Refused | Refused | **Refused** (no EXECUTE) |

Unassigned officer: no second, unassigned AML-officer TEST persona exists. Entity scoping is already covered by the existing portfolio-scope gates (epic-3, dimension-linkage, AML-CLOSE-02C N3). No artificial account was created.

## F. Forged authenticated tests

`scripts/verify-aml-close-02d-security.sql` (rollback-only) — **22/22 PASS**:
- S1–S3: officer, supervisor, external and anonymous privilege sets (as in §E).
- S4: zero active self-granted roles in the whole database.
- S5: officer calls `sec_assign_user_roles(self, …aml_head)` → `not_authorized`.
- S6/S6b: officer inserts or re-activates a row directly in `sec_user_roles` → denied, 0 rows.
- S7: privileged raw update that re-activates the self-grant → `self_role_grant_refused`.
- S8: refusals wrote no audit row and changed no privilege.
- S9: a governed grant by an administrator still works (rolled back).
- S10/S11: no unallowlisted anonymous routine; policy RPCs are authenticated-only.
- S12: the licensee persona sees no AML assessment or fact rows.
- H1–H5: integrity checks (§L, §M).

Browser/API: `e2e/cert-v2/08-aml-least-privilege.spec.ts` (new, 2/2). The real officer login confirms there is no active `aml_head` role, and a forged `sec_assign_user_roles` self-elevation is rejected with no change. The saved checks ACTION-06 and EVAL-05 now pass: the consequence operation and the evaluation command both refuse the officer server-side.

## G. Indirect leakage review

- Every database routine referencing `view_confidential` (5) is permission-guarded (`supervisory_finding_can_read`, `supervisory_domain_actions` mapping, 3 commands).
- Counts, search, dropdowns, dashboards, exports and error messages derive their access from the same `has_permission` engine. Removing the leaked role closes them together, and no separate leak path was found.
- The only additional exposure was the anonymous EXECUTE on the 11 routines (§C), now fixed.

## H. Outdated verifier setups (five aborting, plus the casualties revealed)

| Verifier | Obsolete assumption | New fixture / setup (TEST-only, rolled back) | Invariant still tested | Result |
|---|---|---|---|---|
| review-risk-publication | No active policy profile binds a programme set | TEST sector-scoped profile binding the fixture programme set (more specific than FSRA's regulator-wide profile); grants by TEST super admin | Canonical programmed creation, maker/checker, publication | 47/0 |
| calculation-policy-engine | Same | Same | Calculation policy engine gates | 50/0 |
| evidence-fact-readiness | Same; hard-coded "28 assessments" after rollback | Same; post-run compares with a pre-run census taken outside the transaction | Readiness gates; nothing survives rollback | 58/0 |
| aml12-activation-rehearsal | Same; "live calculation policy must be absent" | Same; post-run proves the live calc-policy and rule population is **unchanged** (FSRA now has a governed one) | Rehearsal leaves zero residue | 18/0 |
| policy-profile-kernel | FSRA has not adopted the MIPL package; approval reaches maker/checker first; free-form test domain; "profile does not bind assessments" | Pristine TEST regulator; adopted TEST components activated in-tx so maker/checker/readiness are reached; registered `CYBER` domain; PROFILE-37 asserts an explicit binding flag and regulator isolation (since 02 the profile **is** the operational authority) | Adoption provenance, ownership, author ≠ approver, approval right, readiness floor, immutability | 32/0 |
| authority-ux-parity *(revealed)* | Creation needs no perimeter | Rolled-back TEST perimeter for the fixture entity | Preview = bound version | 10/0 |
| calc-outcome-fixtures *(revealed)* | Same | Same | Governed calculation outcomes | 14/0 |

No assertion was removed or loosened. Only the PROFILE-37 "configuration-layer only" claim was replaced, because the AML-CLOSE-02 architecture deliberately made it false. It was replaced with the current invariant.

## I. Complete verification results

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| TypeScript (`tsgo`) | pass | 0 | — |
| Vitest (all, incl. AML) | 1758 tests / 180 files | 0 | 0 |
| Screen-boundary scripts | 8 | 0 | 0 |
| Playwright spec 07 + 08 | 7 | 0 | 0 |
| AML-CLOSE-02 / 02B / 02C / 02D harnesses | 23 / 37 / 14 / 22 | 0 | 0 |
| Saved DB verifiers, fully green (17 files) | review-pub 47, calc-engine 50, evidence-fact 58, aml12 18, kernel 32, epic-3 21, consequence 66, outcome 41, ux-parity 10, calc-outcome 14, structural 14, calc-integrity 11, meth-studio 45, v11 18, portfolio 50, route-register 6 | 0 | 0 |
| Saved DB verifiers with H/R items | full-module-hardening (3 H), calculation-governance 13 (1 H), demo-dataset 2 (1 H), risk-monitoring 6 (1 H), dimension-linkage 11 (1 R), w4-a6 4 (stops on R) | 8 (all H/R) | 0 |

## J. Remaining failures

| Check | Class | Explanation |
|---|---|---|
| AMLH-08 (40 overrides without reason) | **H** | Historical approved dimensions predate mandatory override reasons; runtime now requires a reason |
| AMLH-09 (523 without governed outcome) | **H** | Predate governed calculation (AML-06); applies to all historical records only after an authorised backfill (category C of §11) |
| AMLH-17 (1 examination without origin) | **H** | Legacy record |
| CALCGOV-11 (20 historical dimensions recalculated) | **H** | Historical recalculation before the freeze control |
| demo-dataset D-03 (case 01 carries 00735) | **H** | Demo data state; preserved, not rewritten |
| MON-07 (NO_RUN for legacy record) | **H** | Legacy monitoring record |
| dimension-linkage LINK-11 / w4-a6 | **R** | `STR_SAR_GOVERNANCE` absent from methodology 1.0; 22 references untouched; mapping needs an owner decision |

**T = 0, V = 0.**

## K. Historical records

00830, 00836 and 00838 are unchanged (H4). No perimeter determination was created for Helen Digital Assets Ltd. Every perimeter used by fixtures existed only inside rolled-back transactions and is labelled TEST ONLY. No historical decision was fabricated, and none of the 19 publication gaps was touched.

## L. 00838 integrity

The snapshot still pins TEST package `AML_TECH_CERT_POLICY/1`, TEST methodology v2, calculation v1, overlay v1, fact settings v1 and source settings v1. Its stored hash `7e5bed5e…` is unchanged, and `policy_basis_integrity = CONTENT_UNCHANGED`. All **three** facts are present with their original sources: `AML_TECH_CERT_STR_COUNT=12` (RETURN), `AML_TECH_CERT_HAS_FLAG=true` (MANUAL), `AML_TECH_CERT_TIER=TIER_A` (FORM).

## M. FSRA non-impact

FSRA package 1.0 ACTIVE; methodology 1.0 ACTIVE; methodology 1.1 DRAFT; TEST package v1 SUPERSEDED / v2 RETIRED; TEST methodology v1 SUPERSEDED / v2 RETIRED; 00830 snapshot `2363b569…` unchanged. No real regulator configuration was invented. `notification_dispatch_log` shows 0 rows in the work window: no email, SMS, webhook or external message was sent.

## N. Remaining owner / regulator decisions

- `STR_SAR_GOVERNANCE` mapping (22 methodology 1.0 references)
- Real FSRA sector overlays, facts and sources
- Real calculation / rating values
- Methodology adoption (1.1)
- "Applies with modifications" semantics (current interpretation retained)
- Historical publication remediation (19 records) and the H backfills above

## O. Final closure questions

- **Security — all known AML-CLOSE-02 permission/refusal defects closed?** **YES**
- **Current runtime enforces perimeter, governed configuration, version immutability, provenance and least privilege?** **YES**
- **Zero remaining T or V failures?** **YES**
- **Remaining failures only H or R?** **YES**
- **Substantive real FSRA AML/CFT policy certified?** **NO**. No regulator-approved configuration has been provided.

STOP. AML-CLOSE-03 not started.
