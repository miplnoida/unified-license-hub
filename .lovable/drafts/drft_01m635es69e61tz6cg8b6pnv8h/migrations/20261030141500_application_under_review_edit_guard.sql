-- Application status: submitted applications under regulator review
-- (status 'in_progress' with submitted_at set) are closed to applicant edits.
-- No tables, columns, status values, policies, grants or records change.

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
    'draft', 'in_progress', 'returned', 'info_requested', 'query_raised',
    'resubmission_required', 'pending_payment'
  ) AND NOT public.is_super_admin(v_uid)
    AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE: This application is not currently open for editing.'
      USING ERRCODE = '42501';
  END IF;

  -- Submitted applications advanced by the workflow keep 'in_progress';
  -- they are under regulator review and closed to applicant edits.
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

CREATE OR REPLACE FUNCTION public.can_mutate_application(_user uuid, _application_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user IS NULL OR _application_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'application_management','edit') THEN true
    WHEN public.has_permission(_user, 'application_management','workflow_action') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.applications a
       WHERE a.id = _application_id
         AND (
           -- Under regulator review: closed to every applicant-side user
           -- (applicant, Primary/Secondary, institution members).
           NOT (a.status IN ('in_progress','submitted') AND a.submitted_at IS NOT NULL)
           AND (
             (a.applicant_id = _user AND a.status = ANY (ARRAY[
               'draft','in_progress','resubmission_requested','resubmission_required',
               'query_raised','returned_for_correction','info_requested'
             ]))
             OR public.external_can_access_application(_user, a.id, 'can_submit'::text)
             OR public.external_can_access_application(_user, a.id, 'can_respond_rfi'::text)
           )
         )
    )
  END
$function$;

-- ROLLBACK: re-run the previous definitions below.
-- CREATE OR REPLACE FUNCTION public.application_draft_save(_application_id uuid, _data jsonb, _license_type text DEFAULT NULL::text, _regulator_id uuid DEFAULT NULL::uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_uid uuid := auth.uid();
--   v_app public.applications;
-- BEGIN
--   IF v_uid IS NULL THEN
--     RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to save an application.'
--       USING ERRCODE = '42501';
--   END IF;
-- 
--   SELECT * INTO v_app FROM public.applications WHERE id = _application_id;
--   IF v_app.id IS NULL THEN
--     RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application % does not exist.', _application_id
--       USING ERRCODE = 'P0002';
--   END IF;
-- 
--   IF NOT (
--     public.is_super_admin(v_uid)
--     OR v_app.applicant_id = v_uid
--     OR public.has_permission(v_uid, 'application_management', 'edit')
--     OR EXISTS (
--       SELECT 1 FROM public.entity_user_memberships m
--        WHERE m.user_id = v_uid AND m.status = 'APPROVED'
--          AND m.entity_id = v_app.entity_id
--     )
--   ) THEN
--     RAISE EXCEPTION 'APPLICATION_EDIT_FORBIDDEN: You do not have permission to edit this application.'
--       USING ERRCODE = '42501';
--   END IF;
-- 
--   IF COALESCE(v_app.status, 'draft') NOT IN (
--     'draft', 'in_progress', 'returned', 'info_requested', 'query_raised',
--     'resubmission_required', 'pending_payment'
--   ) AND NOT public.is_super_admin(v_uid)
--     AND NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
--     RAISE EXCEPTION 'APPLICATION_NOT_EDITABLE: This application is not currently open for editing.'
--       USING ERRCODE = '42501';
--   END IF;
-- 
--   UPDATE public.applications
--      SET data = COALESCE(_data, data),
--          license_type = COALESCE(NULLIF(trim(COALESCE(_license_type, '')), ''), license_type),
--          regulator_id = COALESCE(_regulator_id, regulator_id),
--          updated_at = now()
--    WHERE id = _application_id;
-- 
--   RETURN jsonb_build_object('success', true, 'application_id', _application_id);
-- END;
-- $function$;
-- 
-- CREATE OR REPLACE FUNCTION public.can_mutate_application(_user uuid, _application_id uuid)
--  RETURNS boolean
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   SELECT CASE
--     WHEN _user IS NULL OR _application_id IS NULL THEN false
--     WHEN public.is_super_admin(_user) THEN true
--     WHEN public.has_permission(_user, 'application_management','edit') THEN true
--     WHEN public.has_permission(_user, 'application_management','workflow_action') THEN true
--     ELSE EXISTS (
--       SELECT 1 FROM public.applications a
--        WHERE a.id = _application_id
--          AND (
--            (a.applicant_id = _user AND a.status = ANY (ARRAY[
--              'draft','in_progress','resubmission_requested','resubmission_required',
--              'query_raised','returned_for_correction','info_requested'
--            ]))
--            OR public.external_can_access_application(_user, a.id, 'can_submit'::text)
--            OR public.external_can_access_application(_user, a.id, 'can_respond_rfi'::text)
--          )
--     )
--   END
-- $function$;
