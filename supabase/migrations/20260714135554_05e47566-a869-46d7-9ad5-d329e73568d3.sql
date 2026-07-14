CREATE OR REPLACE FUNCTION public.current_workflow_step_for(_entity_type text, _entity_id uuid)
RETURNS TABLE(instance_id uuid, workflow_id uuid, step_id uuid, regulator_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wi.id, wi.workflow_id, wi.current_step_id,
         COALESCE(
           (SELECT a.regulator_id FROM public.applications a WHERE a.id = _entity_id),
           (SELECT c.regulator_id FROM public.complaints c WHERE c.id = _entity_id),
           NULL
         )
    FROM public.workflow_instances wi
   WHERE wi.entity_id = _entity_id
     AND (
       (_entity_type = 'application' AND wi.entity_type = ANY(ARRAY['pre_application','post_application','application']))
       OR (_entity_type <> 'application' AND wi.entity_type = _entity_type)
     )
   ORDER BY
     CASE wi.status
       WHEN 'active' THEN 1
       WHEN 'paused' THEN 2
       WHEN 'completed' THEN 3
       WHEN 'cancelled' THEN 4
       ELSE 5
     END,
     wi.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_review_entity(_user_id uuid, _entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _step uuid;
  _ok boolean;
BEGIN
  IF _user_id IS NULL OR _entity_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_collab_admin(_user_id) THEN
    RETURN true;
  END IF;

  IF _entity_type = 'application' THEN
    SELECT true INTO _ok FROM public.applications WHERE id = _entity_id AND applicant_id = _user_id;
    IF _ok THEN RETURN true; END IF;
  ELSIF _entity_type = 'registration' THEN
    SELECT true INTO _ok FROM public.registrations WHERE id = _entity_id AND user_id = _user_id;
    IF _ok THEN RETURN true; END IF;
  ELSIF _entity_type = 'complaint' THEN
    SELECT true INTO _ok FROM public.complaints WHERE id = _entity_id AND complainant_id = _user_id;
    IF _ok THEN RETURN true; END IF;
  ELSIF _entity_type = 'return' THEN
    SELECT true INTO _ok FROM public.returns_filed r
      WHERE r.id = _entity_id
        AND (r.created_by = _user_id
             OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                         WHERE eua.entity_id = r.entity_id AND eua.user_id = _user_id));
    IF _ok THEN RETURN true; END IF;
  END IF;

  SELECT ctx.step_id INTO _step
    FROM public.current_workflow_step_for(_entity_type, _entity_id) ctx
   LIMIT 1;

  IF _step IS NULL THEN
    RETURN false;
  END IF;

  SELECT true INTO _ok
    FROM public.review_step_permissions rsp
    JOIN public.user_dynamic_roles udr ON udr.role_id = rsp.role_id
   WHERE rsp.step_id = _step
     AND udr.user_id = _user_id
     AND rsp.enabled = true
     AND rsp.can_view = true
   LIMIT 1;

  RETURN COALESCE(_ok, false);
END;
$$;