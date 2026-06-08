CREATE OR REPLACE FUNCTION public.get_application_list_stats(
  _licensee_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_total int;
  v_approved int;
  v_rejected int;
  v_pending int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH base AS (
    SELECT x.status
    FROM public.get_application_list_page(
      0,
      5000,
      NULL,
      'contains',
      NULL,
      NULL,
      'created_at',
      'desc',
      _licensee_id,
      _sector_id,
      NULL,
      NULL
    ) x
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'approved'),
    count(*) FILTER (WHERE status = 'rejected'),
    count(*) FILTER (WHERE status NOT IN ('approved', 'rejected', 'cancelled'))
  INTO v_total, v_approved, v_rejected, v_pending
  FROM base;

  RETURN jsonb_build_object(
    'total', v_total,
    'approved', v_approved,
    'rejected', v_rejected,
    'pending', v_pending
  );
END;
$function$;