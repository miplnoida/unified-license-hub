# Fix: complaint workflow action fails with "has_complaint_perm(uuid, complaints) does not exist"

## Root cause (verified in the database)

`public.has_complaint_perm` exists with exactly one signature: `(_user_id uuid, _action text)`.

`public.execute_complaint_workflow_action(_complaint_id, _action_key, _payload, _expected_updated_at)` — the function every button on the Complaint Detail "Current step" panel calls — has a bad permission check on line 18 of its body:

```text
SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id FOR UPDATE;
IF NOT public.has_complaint_perm(v_user, v_complaint) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
```

`v_complaint` is declared `public.complaints%ROWTYPE`, so Postgres looks for `has_complaint_perm(uuid, complaints)`, finds nothing, and raises the error the user is seeing. Every configured workflow action on a complaint fails at this line before any workflow logic runs.

No other complaint function or RLS policy has this defect — all the others pass a capability string (`'view'`, `'edit'`, `'triage'`, `'escalate'`).

## The fix

One migration that replaces `public.execute_complaint_workflow_action` with an identical body except for the permission check, which becomes the capability-string call the rest of the module uses:

```text
IF NOT (public.is_super_admin(v_user) OR public.has_complaint_perm(v_user, 'edit')) THEN
  RAISE EXCEPTION 'FORBIDDEN';
END IF;
```

Everything else in the function is preserved byte-for-byte: row lock, `NO_ACTIVE_WORKFLOW`, `STALE_STATE` optimistic-concurrency check, `ACTION_NOT_ALLOWED_AT_STEP`, `allowed_role_slugs` role gate, required-field validation, all `mutation_spec` branches, enforcement handling, history/audit inserts and step advancement.

## Explicitly not changed

- Workflow definitions, steps, actions, `mutation_spec`, role slugs, approval matrices — untouched. The step-level role gate inside the function stays exactly as configured.
- RBAC catalog, `has_complaint_perm` itself, RLS policies, audit logging.
- No frontend changes: the failure is entirely server-side.

## Verification

- Confirm the redefined function's body no longer references `has_complaint_perm(v_user, v_complaint)`.
- Execute a configured action on complaint `84246b63-5a66-407c-9d1c-4f92a52415d7` from the Current step panel and confirm it advances instead of erroring; a user without complaint edit permission must still get `FORBIDDEN`.
