DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'execute_complaint_workflow_action'
    AND pg_get_function_identity_arguments(p.oid) = '_complaint_id uuid, _action_key text, _payload jsonb, _expected_updated_at timestamp with time zone';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'execute_complaint_workflow_action not found';
  END IF;

  v_new := replace(
    v_src,
    'public.has_complaint_perm(v_user, v_complaint)',
    '(public.is_super_admin(v_user) OR public.has_complaint_perm(v_user, ''edit''))'
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'permission-check patch target not found in function body';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.execute_complaint_workflow_action('
    || '_complaint_id uuid, _action_key text, _payload jsonb DEFAULT ''{}''::jsonb, '
    || '_expected_updated_at timestamptz DEFAULT NULL) '
    || 'RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS %L',
    v_new
  );
END $mig$;