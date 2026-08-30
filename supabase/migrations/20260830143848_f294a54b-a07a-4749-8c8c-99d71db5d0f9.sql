CREATE OR REPLACE FUNCTION public.entity_appointment_resolve_fp_bridge(_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_src text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'entity_appointment_resolve_fp_bridge_impl_placeholder';
  RETURN NULL;
END
$fn$;

DROP FUNCTION IF EXISTS public.entity_appointment_resolve_fp_bridge(uuid);

DO $mig$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'entity_appointment_resolve_fp_bridge';
  IF v_def IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected remaining definition';
  END IF;
END
$mig$;