DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'cert_seed_wave_d_v1' AND pronamespace = 'public'::regnamespace;
  src := regexp_replace(src,
    'INSERT INTO public\.complaints\s*\(id, entity_id_placeholder_unused[^;]*;', '', 'g');
  EXECUTE src;
END $$;

REVOKE ALL ON FUNCTION public.cert_seed_wave_d_v1() FROM PUBLIC, anon, authenticated;