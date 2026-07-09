CREATE OR REPLACE FUNCTION public.get_return_revisions(_return_id uuid)
RETURNS SETOF public.return_data_revisions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rdr.*
  FROM public.return_data_revisions rdr
  WHERE rdr.return_id = _return_id
    AND public.can_view_return_filed(auth.uid(), rdr.return_id)
  ORDER BY rdr.revision_number ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_return_revisions(uuid) TO authenticated, service_role;