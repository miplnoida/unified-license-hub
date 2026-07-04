
CREATE OR REPLACE FUNCTION public.has_any_internal_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin'::app_role, 'admin'::app_role,
                   'supervisor'::app_role, 'licensing_officer'::app_role,
                   'analyst'::app_role)
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_any_internal_role(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  requested_user_type text;
  bootstrap_email text;
  resolved_role app_role;
  is_internal_admin_created boolean := false;
  internal_role_names text[] := ARRAY['admin','super_admin','supervisor','licensing_officer','analyst'];
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'applicant');
  requested_user_type := NEW.raw_user_meta_data->>'user_type';

  is_internal_admin_created :=
    requested_user_type = 'employee'
    OR requested_role = ANY(internal_role_names);

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
              WHEN is_internal_admin_created AND requested_role = ANY(internal_role_names)
                THEN requested_role
              WHEN requested_role IN ('applicant','pre_licensee')
                THEN requested_role
              ELSE 'applicant'
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
    -- create-web-user edge function is the sole authority for internal user_roles.
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
$$;

DROP POLICY IF EXISTS external_applications_select_capability_gate ON public.applications;
CREATE POLICY external_applications_select_capability_gate
  ON public.applications
  AS RESTRICTIVE
  FOR SELECT
  USING (
    (NOT has_external_role(auth.uid()))
    OR has_any_internal_role(auth.uid())
    OR (
      (applicant_id = auth.uid())
      AND (
        has_role(auth.uid(), 'applicant'::app_role)
        OR has_role(auth.uid(), 'pre_licensee'::app_role)
        OR has_role(auth.uid(), 'licensee_primary'::app_role)
        OR has_role(auth.uid(), 'licensee_secondary'::app_role)
      )
    )
    OR external_can_access_application(auth.uid(), id, 'can_view_status'::text)
  );

DROP POLICY IF EXISTS external_applications_update_capability_gate ON public.applications;
CREATE POLICY external_applications_update_capability_gate
  ON public.applications
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    (NOT has_external_role(auth.uid()))
    OR has_any_internal_role(auth.uid())
    OR external_can_access_application(auth.uid(), id, 'can_submit'::text)
    OR external_can_access_application(auth.uid(), id, 'can_respond_rfi'::text)
  );

DROP POLICY IF EXISTS external_applications_insert_capability_gate ON public.applications;
CREATE POLICY external_applications_insert_capability_gate
  ON public.applications
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    (NOT has_external_role(auth.uid()))
    OR has_any_internal_role(auth.uid())
    OR (applicant_id = auth.uid())
  );

DO $$
DECLARE
  affected_users int := 0;
  affected_dyn int := 0;
  applicant_role_id uuid;
BEGIN
  WITH targets AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_type = 'employee'::user_type
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'applicant'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = p.id
          AND ur2.role IN ('super_admin'::app_role,'admin'::app_role,'supervisor'::app_role,'licensing_officer'::app_role,'analyst'::app_role)
      )
  )
  DELETE FROM public.user_roles ur
  USING targets t
  WHERE ur.user_id = t.id AND ur.role = 'applicant'::app_role;
  GET DIAGNOSTICS affected_users = ROW_COUNT;

  SELECT id INTO applicant_role_id FROM public.roles WHERE name = 'Applicant' LIMIT 1;
  IF applicant_role_id IS NOT NULL THEN
    WITH targets AS (
      SELECT p.id
      FROM public.profiles p
      WHERE p.user_type = 'employee'::user_type
        AND EXISTS (SELECT 1 FROM public.user_dynamic_roles udr WHERE udr.user_id = p.id AND udr.role_id = applicant_role_id)
        AND EXISTS (
          SELECT 1 FROM public.user_dynamic_roles udr2
          WHERE udr2.user_id = p.id AND udr2.role_id <> applicant_role_id
        )
    )
    DELETE FROM public.user_dynamic_roles udr
    USING targets t
    WHERE udr.user_id = t.id AND udr.role_id = applicant_role_id;
    GET DIAGNOSTICS affected_dyn = ROW_COUNT;
  END IF;

  RAISE NOTICE 'Phantom applicant cleanup: removed % user_roles rows, % user_dynamic_roles rows', affected_users, affected_dyn;
END;
$$;
