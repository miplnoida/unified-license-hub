CREATE OR REPLACE FUNCTION public.validate_approval_step_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role record;
  v_existing_role_ids jsonb;
BEGIN
  -- Specific-users steps don't need a role; approver_config carries user_ids.
  IF COALESCE(NEW.approver_type, 'role_based_user') = 'specific_users' THEN
    RETURN NEW;
  END IF;

  IF NEW.approver_role_id IS NULL THEN
    RAISE EXCEPTION 'APPROVER_ROLE_ID_REQUIRED: approval steps must reference a configured role (roles.id)'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, is_system, system_role INTO v_role
    FROM public.roles WHERE id = NEW.approver_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVER_ROLE_NOT_FOUND: roles.id=% does not exist', NEW.approver_role_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_role.system_role IS NOT NULL THEN
    NEW.approver_role := v_role.system_role::public.app_role;
  END IF;

  v_existing_role_ids := COALESCE(
    (
      SELECT jsonb_agg(x)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(NEW.approver_config->'role_ids') = 'array' THEN NEW.approver_config->'role_ids'
          ELSE '[]'::jsonb
        END
      ) AS ids(x)
      WHERE x <> NEW.approver_role_id::text
        AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id::text = x)
    ),
    '[]'::jsonb
  );

  NEW.approver_config := jsonb_set(
    COALESCE(NULLIF(NEW.approver_config, 'null'::jsonb), '{}'::jsonb),
    '{role_ids}',
    jsonb_build_array(NEW.approver_role_id::text) || v_existing_role_ids,
    true
  );

  RETURN NEW;
END;
$function$;