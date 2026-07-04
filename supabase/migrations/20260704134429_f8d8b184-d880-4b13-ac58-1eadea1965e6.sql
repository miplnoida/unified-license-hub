
CREATE OR REPLACE FUNCTION public.has_any_internal_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role NOT IN (
        'applicant'::app_role,
        'pre_licensee'::app_role,
        'licensee_primary'::app_role,
        'licensee_secondary'::app_role
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_any_internal_role(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Applicants read own apps" ON public.applications;
CREATE POLICY "Applicants read own apps"
  ON public.applications
  FOR SELECT
  USING (
    auth.uid() = applicant_id
    OR public.has_any_internal_role(auth.uid())
  );

DROP POLICY IF EXISTS "Update apps" ON public.applications;
CREATE POLICY "Update apps"
  ON public.applications
  FOR UPDATE
  USING (
    (
      auth.uid() = applicant_id
      AND status = ANY (ARRAY['draft','in_progress','resubmission_requested','resubmission_required','query_raised','returned_for_correction','info_requested']::text[])
    )
    OR (
      user_licensee_id(auth.uid()) IS NOT NULL
      AND id IN (SELECT application_ids_for_licensee(user_licensee_id(auth.uid())))
      AND status = ANY (ARRAY['draft','in_progress','resubmission_requested','resubmission_required','query_raised','returned_for_correction','info_requested']::text[])
    )
    OR public.has_any_internal_role(auth.uid())
  )
  WITH CHECK (
    (
      auth.uid() = applicant_id
      AND status = ANY (ARRAY['draft','in_progress','resubmission_requested','resubmission_required','query_raised','returned_for_correction','info_requested']::text[])
    )
    OR (
      user_licensee_id(auth.uid()) IS NOT NULL
      AND id IN (SELECT application_ids_for_licensee(user_licensee_id(auth.uid())))
      AND status = ANY (ARRAY['draft','in_progress','resubmission_requested','resubmission_required','query_raised','returned_for_correction','info_requested']::text[])
    )
    OR public.has_any_internal_role(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  requested_user_type text;
  bootstrap_email text;
  resolved_role app_role;
  is_internal_role boolean := false;
  is_internal_admin_created boolean := false;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'applicant');
  requested_user_type := NEW.raw_user_meta_data->>'user_type';

  BEGIN
    is_internal_role := (requested_role::app_role) NOT IN (
      'applicant'::app_role,
      'pre_licensee'::app_role,
      'licensee_primary'::app_role,
      'licensee_secondary'::app_role
    );
  EXCEPTION WHEN OTHERS THEN
    is_internal_role := false;
  END;

  is_internal_admin_created :=
    requested_user_type = 'employee'
    OR is_internal_role;

  IF requested_role = 'pre_licensee' THEN
    INSERT INTO public.pre_license_users (id, full_name, email, entity_name)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.email, ''),
            COALESCE(NEW.raw_user_meta_data->>'entity_name', ''));
  ELSE
    INSERT INTO public.profiles (id, full_name, email, user_type, entity_name, role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.email, ''),
            COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'primary'),
            COALESCE(NEW.raw_user_meta_data->>'entity_name', ''),
            CASE
              WHEN is_internal_admin_created AND is_internal_role
                THEN requested_role::app_role
              WHEN requested_role IN ('applicant','pre_licensee')
                THEN requested_role::app_role
              ELSE 'applicant'::app_role
            END);
  END IF;

  SELECT trim(both '"' from value::text)
    INTO bootstrap_email
    FROM public.site_settings
   WHERE key = 'super_admin_bootstrap_email'
   LIMIT 1;

  IF bootstrap_email IS NOT NULL
     AND length(bootstrap_email) > 0
     AND lower(bootstrap_email) = lower(COALESCE(NEW.email, '')) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin'::app_role);
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
    VALUES (NEW.id, 'bootstrap_super_admin_assigned', 'user', NEW.id::text,
            jsonb_build_object('email', NEW.email));
  ELSIF is_internal_admin_created THEN
    NULL;
  ELSE
    IF requested_role IN ('applicant', 'pre_licensee') THEN
      BEGIN
        resolved_role := requested_role::app_role;
      EXCEPTION WHEN OTHERS THEN
        resolved_role := 'applicant'::app_role;
      END;
    ELSE
      resolved_role := 'applicant'::app_role;
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, resolved_role);
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  removed_roles int := 0;
  removed_dyn int := 0;
BEGIN
  WITH targets AS (
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE p.user_type = 'employee'::public.user_type
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role = 'applicant'::app_role
      )
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = p.id
          AND ur2.role NOT IN (
            'applicant'::app_role,
            'pre_licensee'::app_role,
            'licensee_primary'::app_role,
            'licensee_secondary'::app_role
          )
      )
  ),
  del_roles AS (
    DELETE FROM public.user_roles ur
    USING targets t
    WHERE ur.user_id = t.user_id AND ur.role = 'applicant'::app_role
    RETURNING 1
  ),
  del_dyn AS (
    DELETE FROM public.user_dynamic_roles udr
    USING targets t, public.roles r
    WHERE udr.user_id = t.user_id
      AND udr.role_id = r.id
      AND (lower(r.name) = 'applicant' OR lower(r.system_role) = 'applicant')
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM del_roles), (SELECT count(*) FROM del_dyn)
    INTO removed_roles, removed_dyn;

  RAISE NOTICE 'Phantom applicant cleanup: removed % user_roles rows, % user_dynamic_roles rows', removed_roles, removed_dyn;
END $$;
