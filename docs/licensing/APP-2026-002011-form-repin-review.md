# Review: governed form-version re-pin (APP-2026-002011, v1.0 to v2.0)

Status: **PROPOSED, NOT APPLIED.** Nothing in this document has been staged, deployed or run. APP-2026-002011 stays on v1.0 until the owner approves this review.

## Current state (read-only, 2026-10-22)
- Application `89603d2b-…fbfb`, status `draft`.
- One `application_form_versions` row, `faa6b060-…`: status `active`, reason `latest_at_start`, locked; version `874f6cb8-…` (v1.0).
- 0 `application_form_requirements` rows.
- The function below must also count `form_responses` rows (entity_type `application`) and require that count to be 0.

## Function definition
```sql
create or replace function public.application_form_version_repin(
  _application_id uuid, _expected_current_version_id uuid,
  _target_version_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _app record; _cur record; _tgt record; _new uuid;
begin
  if _uid is null or not public.has_permission(_uid, 'applications', 'manage_form_version') then
    raise exception 'not authorised' using errcode = '42501'; end if;
  if coalesce(length(trim(_reason)),0) < 10 then raise exception 'reason required'; end if;

  select * into _app from applications where id = _application_id for update;
  if not found or _app.status <> 'draft' or _app.submitted_at is not null then
    raise exception 'only unsubmitted draft applications'; end if;

  select * into _cur from application_form_versions
   where application_id = _application_id and status = 'active' for update;
  if not found or _cur.version_id <> _expected_current_version_id then
    raise exception 'current version mismatch'; end if;

  if exists (select 1 from form_responses where entity_type = 'application'
               and entity_id = _application_id)
     or exists (select 1 from application_form_requirements
               where application_id = _application_id and response_id is not null) then
    raise exception 'application has saved answers'; end if;

  -- target must be the latest published version of the same template
  select v.* into _tgt from form_template_versions v
   where v.id = _target_version_id and v.template_id = _cur.template_id and v.status = 'published';
  if not found or exists (select 1 from form_template_versions w
      where w.template_id = _cur.template_id and w.status = 'published' and w.version > _tgt.version) then
    raise exception 'target is not the latest published version of this form'; end if;

  update application_form_versions set status = 'superseded', updated_at = now() where id = _cur.id;
  insert into application_form_versions(application_id, template_id, version_id, assigned_reason,
         assigned_at, assigned_by, locked_at, status)
  values (_application_id, _cur.template_id, _target_version_id, 'governed_repin', now(), _uid, now(), 'active')
  returning id into _new;

  insert into audit_logs(user_id, action, entity_type, entity_id, details)
  values (_uid, 'FORM_VERSION_REPIN', 'application', _application_id::text,
          jsonb_build_object('from', _cur.version_id, 'to', _target_version_id, 'reason', _reason));
  return _new;
end $$;
```
Before staging, the table and column names `form_template_versions` and `audit_logs` must be checked against the live schema.

## Permissions
```sql
revoke all on function public.application_form_version_repin(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.application_form_version_repin(uuid,uuid,uuid,text) to authenticated;
```
- No table grants change and no RLS policy changes.
- The permission check is inside the function, so calling it directly through the API gets the same refusal.
- `manage_form_version` would be a new permission action granted only to licensing supervisors. That grant needs separate approval.

## Safety properties
- **Atomic:** it runs in one transaction. Row locks on the application and the assignment stop races, and any failed check rolls back.
- **Scoped:** it touches exactly the one application ID passed in. The `_expected_current_version_id` check stops stale replays.
- **Not touched:** fees, payments, fee assessments, entity links, applicant and application ID.
- **History kept:** the old assignment is superseded, not deleted, and an audit row is written.

## Rollback
- **Data:** the same function, called with the versions swapped, moves the application back. It only works while the application is still Draft with no answers.
- **Code:** `drop function public.application_form_version_repin(uuid,uuid,uuid,text);`

## Tests required before applying
Each case below needs its own test:
1. Allowed: Draft, no answers, latest published version.
2. Refused when saved answers exist.
3. Refused when the application is submitted or not Draft.
4. Refused when the caller has no permission, including anonymous and applicant callers.
5. Refused when the target is a different template, unpublished, or not the latest.
6. Refused when the expected current version doesn't match.

No test evidence exists yet, because nothing has been applied.
