UPDATE public.roles SET system_role = 'analyst' WHERE system_role IS NULL OR btrim(system_role) = '';

ALTER TABLE public.roles ALTER COLUMN system_role SET DEFAULT 'analyst';
ALTER TABLE public.roles ALTER COLUMN system_role SET NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_user_roles_from_dynamic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_sys_role text;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  FOR v_sys_role IN
    SELECT DISTINCT r.system_role
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    WHERE udr.user_id = v_user_id
      AND r.system_role IS NOT NULL
      AND btrim(r.system_role) <> ''
  LOOP
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, v_sys_role::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_roles_from_dynamic ON public.user_dynamic_roles;
CREATE TRIGGER trg_sync_user_roles_from_dynamic
AFTER INSERT OR UPDATE OR DELETE ON public.user_dynamic_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_roles_from_dynamic();

INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT udr.user_id, r.system_role::public.app_role
FROM public.user_dynamic_roles udr
JOIN public.roles r ON r.id = udr.role_id
WHERE r.system_role IS NOT NULL AND btrim(r.system_role) <> ''
ON CONFLICT (user_id, role) DO NOTHING;