## Root cause

`audit_logs` columns are: `entity_type, entity_id, action, user_id, old_value, new_value, metadata` (this is the canonical schema used by `write_audit` and the rest of the app).

Two recent migrations rewrote the `public.submit_application(_application_id, _ack_text)` RPC and added an INSERT into `audit_logs` using non-existent columns:

```sql
INSERT INTO public.audit_logs (table_name, record_id, action, user_id, new_values)
VALUES ('applications', _application_id, v_audit_action, v_uid, jsonb_build_object(...));
```

Columns `table_name`, `record_id`, and `new_values` do not exist on `audit_logs` — they look like a different audit schema the author confused with ours. As soon as a user clicks Submit, the RPC fails with:

> column "table_name" of relation "audit_logs" does not exist

It "worked earlier" because the previous version of `submit_application` either didn't write to `audit_logs` directly (the trigger `tg_applications_audit` handled it) or used the correct columns. The latest rewrite regressed it.

Files involved:
- `supabase/migrations/20260610082611_*.sql` — first regression
- `supabase/migrations/20260611065002_*.sql` — second regression (current definition)

## Fix

Single new migration that replaces `public.submit_application` with the same body but a corrected `audit_logs` INSERT:

```sql
INSERT INTO public.audit_logs (
  entity_type, entity_id, action, user_id, new_value, metadata
) VALUES (
  'application',
  _application_id::text,
  'application.' || v_audit_action,           -- 'application.submitted' / 'application.resubmitted'
  v_uid,
  jsonb_build_object('status', v_app_status_target),
  jsonb_build_object(
    'source', 'submit_application_rpc',
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'workflow_id', v_workflow_id,
    'first_step_id', v_first_step_id,
    'is_resubmission', v_is_resub,
    'previous_status', v_app.status
  )
);
```

This matches the conventions in `docs/audit-log-coverage.md` (entity_type=`application`, action=`application.submitted`/`application.resubmitted`, metadata-driven payload) and aligns with `write_audit` / `tg_applications_audit`. Note: `tg_applications_audit` already logs `application.submitted` on the status change, so the RPC's direct insert is somewhat redundant — but keeping it (with correct columns) is the smallest, safest fix and preserves the extra metadata the RPC adds.

Everything else in `submit_application` stays unchanged. No frontend changes. No table/policy changes.

## Verification

1. Reapply migration, retry application submission for the failing user — submission succeeds.
2. `select action, metadata from audit_logs where entity_id = '<app id>' order by created_at desc` shows `application.submitted` (or `application.resubmitted`) from both the trigger and the RPC, with no errors.
3. Existing tests (`applicationPaymentResolution`, `reviewAcknowledgement`, etc.) still pass.
