CREATE OR REPLACE FUNCTION public.count_visible_return_revisions_as(_user_id uuid, _return_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _user_id::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*)::integer
  INTO v_count
  FROM public.return_data_revisions rdr
  WHERE rdr.return_id = _return_id;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_visible_return_revisions_as(uuid, uuid) TO authenticated, service_role;