
CREATE OR REPLACE FUNCTION public.cert_reset_force_delete(_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE t text; res jsonb := '{}'::jsonb; n bigint;
BEGIN
  FOREACH t IN ARRAY _tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
      EXECUTE format('DELETE FROM public.%I', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
      res := res || jsonb_build_object(t, format('deleted %s', n));
    EXCEPTION WHEN others THEN
      res := res || jsonb_build_object(t, 'ERROR: ' || SQLERRM);
    END;
  END LOOP;
  RETURN res;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cert_reset_force_delete(text[]) FROM anon, authenticated, PUBLIC;
