# Fix: users not assigned to a workflow step can still act on it

## What I verified in the live database and code

`public.user_can_act_on_workflow_step(user, step)` is the single authorization
oracle used by all four transition functions (`perform_workflow_transition`,
`perform_registration_workflow_transition`, `perform_return_workflow_transition`,
`perform_final_workflow_approval`). Three real defects were confirmed by reading
the deployed function bodies:

**1. Internal-staff bypass on Reject and Save Comment (the reported hole).**
The oracle sets `is_internal = true` for *anyone* holding one of
`super_admin, admin, supervisor, licensing_officer, analyst, developer` — with no
reference to the step's configured approver. Both
`perform_workflow_transition` and `perform_registration_workflow_transition`
then do:

```text
IF action = 'reject'       THEN require is_internal only   <-- bypasses role match
ELSIF action = 'save_comment' THEN require is_internal only
ELSIF NOT role_match       THEN 403 WRONG_APPROVER
```

So an `analyst` or `licensing_officer` who is **not** the configured approver for
the current step can reject an application or a registration outright — a
terminal, business-effecting decision. Only the returns function is correct
today: it grants the bypass to `save_comment` and nothing else.

**2. System-role equivalence silently widens the configured role.**
When a step names a specific dynamic role, the oracle also matches on that
role's `system_role` (`SYSTEM_ROLE_EQUIVALENT_MATCH`, `CFG_ROLE_SYSTEM_MATCH`).
Any user carrying the underlying legacy system role therefore satisfies a step
configured for a specific named role, even without that role assignment.

**3. No sector or regulator isolation in the decision.**
The oracle reads only roles. `registrations.sector_id`, `applications.regulator_id`
and `profiles.regulator_id` exist, and the scope framework exists
(`sec_scope_types` includes `sector` and `institution`, 100 role-scope rows) but
`sec_role_scope_values` is empty, so nothing is enforced. An approver holding the
right role can act on any sector's record.

## What will be built

### A. Harden the authorization oracle (`user_can_act_on_workflow_step`)
- Keep the return shape byte-compatible (all existing keys) so no caller breaks.
- Split the two concepts that are currently conflated:
  - `can_act` — actor is the configured approver for this step (unchanged rules,
    minus the widening below).
  - `is_internal` — informational only; never again a basis for a decision.
- Add `role_exact` and a machine-readable `deny_reason`
  (`WRONG_APPROVER`, `SECTOR_MISMATCH`, `NOT_INTERNAL`, `STEP_NOT_FOUND`).
- Make system-role equivalence **opt-in per step** rather than implicit: a step
  matches on `system_role` only when its `approver_config` carries
  `allow_system_role_equivalence: true`. Existing steps that rely on legacy
  `approver_role` (no `approver_role_id`) keep matching exactly as they do now,
  so today's live workflows are unaffected; only the "specific named role" steps
  tighten. A migration marks steps whose current only means of matching is
  equivalence, so no in-flight workflow is left with zero eligible approvers —
  the audit list of those steps will be reported.
- Add optional sector isolation: new arg `_record_sector_id uuid default null`.
  When passed and the step's workflow is sector-scoped, deny with
  `SECTOR_MISMATCH` unless the actor's scope covers it. Because
  `sec_role_scope_values` is empty, enforcement stays inert until scope values
  are configured — it will not lock anyone out today, and the plan reports that
  explicitly rather than claiming sector isolation is live.

### B. Remove the bypass from every transition function
- `reject` now requires `can_act` **plus** `reject` being in the step's allowed
  actions — same rule as approve. No internal-only path.
- `save_comment` stays available to internal staff (it is a non-decisional
  annotation and the UI depends on it), but is recorded distinctly and can never
  move the workflow, change status or close an instance. This is stated as a
  deliberate exception, not hidden.
- Registration, application, returns and final-approval functions all go through
  the same guard block so they cannot drift apart again.
- Every denial writes a security audit row (module `workflow_management`) with
  actor, step, action and deny reason.

### C. Frontend read-only state for unauthorized users
- `WorkflowPanel.tsx` and `ReturnWorkflowPanel.tsx` stop deriving any decision
  control from `can_add_remark`/`is_internal`. Reject/Approve/Send Back/Escalate
  render only when the oracle says `can_act` and the action is in
  `allowed_actions`.
- When `can_act` is false the panel shows an explicit read-only banner naming
  the role that is required, with history and comments still visible.
- Comment box remains for internal staff, labelled as a remark, not an action.

## Verification before this is called fixed

Database-level (pgTAP, added under `supabase/tests/rbac/`):
- an `analyst` not assigned to the step is denied `reject` with `WRONG_APPROVER`
  (this is the exact reported bug, asserted as a regression test);
- the configured approver still approves, rejects, sends back and escalates;
- a step configured for a named dynamic role denies a user who only holds the
  equivalent system role;
- `save_comment` by internal non-approver writes a comment and leaves
  `workflow_instances.current_step_id`, status and record status unchanged;
- denial audit rows exist.

State safety: snapshot of `workflow_instances`, `approval_actions`,
`applications.status`, `registrations.status` compared before/after the
migration to prove no in-flight case moved.

Browser: signed in as an admin, confirm the approver still sees and can use the
configured actions; confirm a non-approver session sees the read-only banner and
no decision buttons.

## Known limitations to be reported, not hidden
- Sector isolation ships as enforced code but is inert until
  `sec_role_scope_values` is populated; no sector data exists to enforce today.
- Verifying the non-approver UI end-to-end needs a second signed-in account. If
  one cannot be established, that assertion is made at the RPC level instead and
  reported as such.
