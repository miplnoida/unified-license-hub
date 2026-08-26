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
  is_entity_web_user boolean := false;
  profile_role app_role;
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

  -- Entity web user provisioned by an administrator for a regulated entity:
  -- keep the licensee_primary / licensee_secondary external role instead of
  -- collapsing it to 'applicant' (which mislabelled the account and broke
  -- portal role-default capabilities).
  is_entity_web_user :=
    requested_role IN ('licensee_primary', 'licensee_secondary')
    AND COALESCE(requested_user_type, '') IN ('primary', 'secondary');

  IF requested_role = 'pre_licensee' THEN
    INSERT INTO public.pre_license_users (id, full_name, email, entity_name)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.email, ''),
            COALESCE(NEW.raw_user_meta_data->>'entity_name', ''));
  ELSE
    profile_role := CASE
      WHEN is_internal_admin_created AND is_internal_role
        THEN requested_role::app_role
      WHEN is_entity_web_user
        THEN requested_role::app_role
      WHEN requested_role IN ('applicant','pre_licensee')
        THEN requested_role::app_role
      ELSE 'applicant'::app_role
    END;

    INSERT INTO public.profiles (id, full_name, email, user_type, entity_name, role)
    VALUES (NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            COALESCE(NEW.email, ''),
            COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'primary'),
            COALESCE(NEW.raw_user_meta_data->>'entity_name', ''),
            profile_role);
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
    IF is_entity_web_user THEN
      resolved_role := requested_role::app_role;
    ELSIF requested_role IN ('applicant', 'pre_licensee') THEN
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