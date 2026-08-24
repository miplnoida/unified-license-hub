# Regulatory Assignment Gap Register

Status vocabulary: a gap is **CLOSED** only when database authority, UI, tests
and evidence all agree. A screen alone never closes a gap.

Legend for the per-gap fields: CURRENT / TARGET / IMPLEMENTED / TESTED /
EVIDENCE / RESIDUAL.

---

## GAP-ROS-001 — Scope engine lacks regulator, sub-sector and team

- **CURRENT (before):** `sec_scope_types` supported only `all`, `assigned`,
  `sector`, `institution`, `own`.
- **TARGET:** `regulator`, `sub_sector` and `team` coverage types enforced in
  the database before any UI selector exists.
- **IMPLEMENTED:** Yes — the three types are seeded into `sec_scope_types`
  (`is_enforced = true`) and resolved by `public.user_scope_grants_for` /
  `public.regulatory_scope_allows`.
- **TESTED:** No — pgTAP suite pending.
- **EVIDENCE:** migration `Regulatory Operating Structure — Phase 1`;
  `sec_scope_types` rows `regulator` / `sub_sector` / `team`.
- **RESIDUAL:** No UI selector yet (intentional — backend first). RecordScopePanel
  work is deferred to the UI phase.

## GAP-ROS-002 — `user_scope_for()` collapses independent grants

- **CURRENT:** returns a single dominant scope, discarding parallel grants.
- **TARGET:** preserve independent grants; keep the old function as a
  compatibility facade.
- **IMPLEMENTED:** Yes — `public.user_scope_grants_for(user, module, action)`
  returns `{all, sectors[], sub_sectors[], institutions[], regulators[],
  assigned, team, own, qualified, source}`. `user_scope_for()` is unchanged and
  is used as the legacy fallback when no `sec_*` grant qualifies.
- **TESTED:** No.
- **EVIDENCE:** function definition in the Phase 1 migration.
- **RESIDUAL:** Existing callers still use `user_scope_for()`; migration of
  callers is a later phase and must not change certified behaviour.

## GAP-ROS-003 — Regulator ownership modelled only by `sectors.regulator_id`

- **CURRENT:** sector→regulator column is the only authority model.
- **TARGET:** governed `regulator_mandates` as the authority model, with the
  legacy column preserved for compatibility.
- **IMPLEMENTED:** Partially — `regulatory_functions` and `regulator_mandates`
  exist and are enforced by `regulator_mandate_supports()`. No mandate rows are
  backfilled yet, so mandates are currently inert (migration-safe).
- **TESTED:** No.
- **EVIDENCE:** tables `regulatory_functions` (12 seeded functions),
  `regulator_mandates`.
- **RESIDUAL:** Deterministic backfill from `sectors.regulator_id` pending;
  anything not deterministically derivable must be written as
  `requires_admin_review`.

## GAP-ROS-004 — `profiles.regulator_id` treated as business authority

- **CURRENT:** home regulator used as if it were authority.
- **TARGET:** home regulator only; authority from mandate + portfolio.
- **IMPLEMENTED:** Partially — `staff_portfolios` /
  `staff_portfolio_scopes` exist and narrow authority in
  `regulatory_scope_allows()`. Column untouched.
- **TESTED:** No.
- **RESIDUAL:** Callers that infer authority from `profiles.regulator_id` are
  not yet migrated.

## GAP-ROS-005 — `entity_supervision_assignments` uses free text and broad writes

- **CURRENT:** `team`, `supervisor_name` free text; `esa_write` policy allows
  any holder of `prudential_supervision.edit` to write directly.
- **TARGET:** canonical `regulator_id`, `regulatory_function_id`, `team_id`,
  `lead_supervisor_user_id`, `alternate_supervisor_user_id`, assignment reason;
  governed routines `assign_entity_supervision`,
  `transfer_entity_supervision`, `end_entity_supervision_assignment`; direct DML
  revoked after UI callers migrate.
- **IMPLEMENTED:** No. A compatibility bridge exists
  (`user_team_covers_entity` matches `esa.team` against
  `regulatory_teams.code`) so team grants function before the column migration.
- **TESTED:** No.
- **RESIDUAL:** Whole item open — next phase.

## GAP-ROS-006 — Appeal panel configuration writes directly from the client

- **CURRENT:** client performs direct table writes on panel/member tables.
- **TARGET:** governed RPCs (`appeal_panel_create`, `appeal_panel_update`,
  `appeal_panel_member_add`, `appeal_panel_member_update`,
  `appeal_panel_member_stand_down`) with audit.
- **IMPLEMENTED:** No.
- **RESIDUAL:** Open.

## GAP-ROS-007 — `record_appeal_decision` does not require panel membership

- **CURRENT:** checks global `decide` permission and roster quorum only.
- **TARGET:** recorder must belong to the current panel snapshot; quorum from
  actual participating, non-recused voting members; `decision_rule` satisfied;
  conflicted/recused members cannot vote or finalise.
- **IMPLEMENTED:** No.
- **RESIDUAL:** Open. Requires participation / conflict / vote evidence tables
  and `appeal_member_record_*` + `appeal_finalize_decision` RPCs.

## GAP-ROS-008 — Examination authorization is global-only

- **CURRENT:** checks generic `inspection_management` /
  `prudential_supervision` permissions without binding to the examination's
  entity, scope or team.
- **TARGET:** examination-aware authorization (permission + scope + case/team
  authority), with separate explicit "manage all examinations" permission, and
  preparer ≠ reviewer / preparer ≠ approver preserved.
- **IMPLEMENTED:** No.
- **RESIDUAL:** Open.

## GAP-ROS-009 — F&P committee administration is not regulator-aware

- **CURRENT:** backend supports `fp_committees.regulator_id`; the admin UI does
  not configure it, and candidate lists are not server-validated.
- **TARGET:** regulator, effective status, quorum, approval threshold, member
  roles and server-side eligibility, using the existing `fpCommittee` governed
  RPCs.
- **IMPLEMENTED:** No.
- **RESIDUAL:** Open.

## GAP-ROS-010 — No Regulatory Operating Structure administration area

- **TARGET:** Administration → Regulatory Operating Structure with Regulators &
  Mandates, Teams & Responsibilities, Staff & Portfolios, Entity Supervision,
  Panels & Committees, Coverage & Conflicts; plus Staff 360 and the coverage /
  conflict checks.
- **IMPLEMENTED:** No.
- **RESIDUAL:** Open — scheduled after backend enforcement and tests, per the
  execution mode.

## GAP-ROS-011 — Negative security tests absent

- **TARGET:** database/integration tests for: same role + different portfolio,
  sector ≠ sub-sector, portfolio/team cannot grant a missing permission, wrong
  regulator, wrong entity, expired portfolio, expired team membership, normal
  admin cannot bypass, break-glass explicit, non-panel finalisation denied,
  recused member cannot vote, quorum by participation, wrong-regulator panel
  member denied, unassigned examiner denied, maker-checker holds.
- **IMPLEMENTED:** No.
- **RESIDUAL:** Open.

---

## Conflicts recorded (behaviour preserved, not rewritten)

| ID | Conflict | Resolution |
| --- | --- | --- |
| CONF-ROS-01 | Certified P01-P15 flows run without mandates or portfolios configured. Enforcing them immediately would lock out certified behaviour. | Both narrowing checks are inert until configured (`regulator_mandate_supports` and `staff_portfolio_allows` return `true` when nothing is recorded). Existing behaviour preserved; recorded here rather than silently changed. |
| CONF-ROS-02 | `entity_supervision_assignments.team` is free text and is relied on by existing screens. | Kept, and bridged by `user_team_covers_entity` matching `regulatory_teams.code`, until the canonical `team_id` column and governed routines land. |
