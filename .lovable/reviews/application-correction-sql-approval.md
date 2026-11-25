# Application correction save — exact SQL for approval

The live `application_draft_save` function already closes submitted applications to applicant editing, but its editable-status list omits `returned_for_correction`. The accepted draft adds only that status to the list.

**Security impact:** retains the existing signed-in actor, ownership/member/staff checks and submitted-under-review lock; creates no roles, grants, policies, tables or records. Existing approved members and staff retain their current authority. This proposal does not fix or widen those existing authority checks.

**Scope:** only allowing existing authorized actors to save answers after the regulator has returned an application for correction. The staged SQL is reproduced byte-for-byte below and will be applied only after approval, followed by rolled-back authorization/state regression tests.

**Rollback:** restore the previously read function definition (identical except for removal of `returned_for_correction` from the editable-status list).

```sql
-- Allow applicants to save form data while an application is returned for correction.
CREATE OR REPLACE FUNCTION public.application_draft_save(_application_id uuid, _data jsonb, _license_type text DEFAULT NULL::text, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.applications;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to save an application.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application % does not exist.', _application_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR v_app.applicant_id = v_uid
    OR public.has_permission(v_uid, 'application_management', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.entity_user_memberships m
       WHERE m.user_id = v_uid AND m.status = 'APPROVED'
         AND m.entity_id = v_app.entity_id
    )
  ) THEN
    RAISE EXCEPTION 'APPLICATION_EDIT_FORBIDDEN: You do not have permission to edit this application.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_app.status, 'draft') NOT IN (
    'draft', 'in_progress', 'returned', 'returned_for_correction', 'info_requested', 'query_raised',
    'resubmission_required', 'pending_payment'
  ) AND NOT public.is_super_admin(v_uid)
    AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE: This application is not currently open for editing.'
      USING ERRCODE = '42501';
  END IF;

  IF v_app.status IN ('in_progress','submitted') AND v_app.submitted_at IS NOT NULL
     AND NOT public.is_super_admin(v_uid)
     AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_UNDER_REVIEW: This application is under regulator review and cannot be edited.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.applications
     SET data = COALESCE(_data, data),
         license_type = COALESCE(NULLIF(trim(COALESCE(_license_type, '')), ''), license_type),
         regulator_id = COALESCE(_regulator_id, regulator_id),
         updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('success', true, 'application_id', _application_id);
END;
$function$;

```
