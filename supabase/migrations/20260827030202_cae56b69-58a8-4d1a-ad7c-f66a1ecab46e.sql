-- MC-11: management reporting registers must be readable only by signed-in
-- regulator staff (subject to RLS) and writable only through governed RPCs.
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'conduct_mi_definitions',
    'conduct_evidence_packs',
    'conduct_evidence_pack_versions',
    'conduct_evidence_pack_exports',
    'conduct_reporting_adopted_narratives',
    'release_debt_register'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', _t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', _t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
  END LOOP;
END $$;
