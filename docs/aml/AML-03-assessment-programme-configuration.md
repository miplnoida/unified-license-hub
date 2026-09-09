# AML-03 — Enterprise Assessment Programme Configuration

Baseline HEAD: `6dbc5bdb2986216611111c09a534cdf4adbcb9f5` (matched expected). AML-00/01/02 preserved.

## 1. Architecture

```
supervisory_assessment_programme_set (versioned, governed, domain + regulator)
  └── supervisory_assessment_programme      (assessment behaviour, period rule, scope)
        └── supervisory_assessment_programme_trigger (permitted triggers, defaults)
  └── supervisory_assessment_programme_event (append-only history)
```

Generic `supervisory_*` naming; AML/CFT is the first consumer and no domain is hardcoded.

## 2. Governance

DRAFT → REVIEW → APPROVED → ACTIVE → SUPERSEDED/RETIRED, rationale ≥ 10 chars, author/submitter cannot
approve, RLS with authenticated SELECT only, direct writes revoked, all writes through governed RPCs,
immutable history, new-version cloning, reference adoption into regulator-owned drafts.

## 3. Policy Profile integration

`ASSESSMENT_PROGRAMME` is now an available policy component with `component_table =
supervisory_assessment_programme_set`. The AML/CFT domain floor requires it for approval and
activation and is locked. `supervisory_policy_profile_adopt_reference` dispatches to
`supervisory_assessment_programme_adopt_reference` in the same transaction and refuses to bind any
MIPL reference component as regulator policy.

## 4. Reference package (no invented policy)

`MIPL-AML-ASSESSMENT-PROGRAMMES 1.0` (DRAFT, MIPL_REFERENCE, no regulator) mechanically reproduces
the behaviour previously hard-coded in `AmlNewAssessmentDialog.tsx`: four assessment types, the five
trigger codes, and a trailing 365-day review period ending one day before the start date. It is bound
to the MIPL reference profile `AML-CFT-POLICY 1.1`. No supervisory policy was invented.

## 5. Runtime convergence

`supervisory_assessment_programme_options_for_entity(entity, domain)` resolves, server-side:
`CONFIGURED` (an ACTIVE regulator-owned package applies), `LEGACY_COMPATIBILITY` (only the reference
package exists — labelled as not approved policy), or `UNAVAILABLE` with the refusal reason.
`supervisory_assessment_create_programmed` re-applies every programme rule (permitted trigger,
required signal, required prior assessment, derived period, override permission, summary requirement)
and stamps `assessment_programme_set_id/_id/_code/_version/_provenance` plus a `PROGRAMME_APPLIED`
event. Existing assessments are untouched; snapshot columns are NULL for them.

The New AML/CFT Assessment dialog no longer contains any assessment type, trigger or 365-day default.

## 6. Screens

`/admin/supervisory-assessment-programmes` (register, server-side filters and regulator scope
contract) and `/:programmeSetId` (programmes, triggers, period rules, policy profile usage, versions,
history, capability-gated lifecycle actions). Registered in `sec_routes`/`sec_navigation_items` and in
the breadcrumb snapshot.

## 7. Security posture

Linter: 1699 findings, 6 types (inherited baseline 1678). The delta is 21 new governed
SECURITY DEFINER RPCs of the pre-existing "signed-in users can execute" class. Anonymous execute was
revoked on every new function; the anon-executable count fell from 21 to 8. The single
`RLS enabled no policy` finding is the inherited `email_provider_secrets` table.

## 8. Open / inherited blockers

`PRE_EXISTING_POLICY_OR_METHODOLOGY_BLOCKER`: CALC-05/06/09/11, AMLH-09, LINK-11 (22 legacy links),
Epic-3 G/H. `INHERITED_NON_AML_REGRESSION`: unapproved `ChartNetwork` nav icon, Detection and
Management Assurance breadcrumb sources.

AML-04 (question applicability / assessment question plan) not started.
