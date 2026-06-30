
DO $$
DECLARE
  r record;
  cleaned_roles jsonb;
  cleaned_users jsonb;
  new_cfg jsonb;
BEGIN
  FOR r IN SELECT id, approver_config FROM public.approval_steps WHERE approver_config IS NOT NULL LOOP
    new_cfg := r.approver_config;

    IF jsonb_typeof(new_cfg->'role_ids') = 'array' THEN
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
        INTO cleaned_roles
      FROM jsonb_array_elements_text(new_cfg->'role_ids') AS t(elem)
      WHERE EXISTS (SELECT 1 FROM public.roles ro WHERE ro.id::text = elem);
      new_cfg := jsonb_set(new_cfg, '{role_ids}', cleaned_roles, true);
    END IF;

    IF jsonb_typeof(new_cfg->'user_ids') = 'array' THEN
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
        INTO cleaned_users
      FROM jsonb_array_elements_text(new_cfg->'user_ids') AS t(elem)
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = elem);
      new_cfg := jsonb_set(new_cfg, '{user_ids}', cleaned_users, true);
    END IF;

    IF new_cfg IS DISTINCT FROM r.approver_config THEN
      UPDATE public.approval_steps SET approver_config = new_cfg WHERE id = r.id;
    END IF;
  END LOOP;

  UPDATE public.approval_steps s
     SET approver_role_id = NULL
   WHERE approver_role_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.roles ro WHERE ro.id = s.approver_role_id);
END $$;
