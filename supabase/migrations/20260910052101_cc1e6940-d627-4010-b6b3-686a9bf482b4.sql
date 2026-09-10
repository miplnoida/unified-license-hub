-- AML-08 hardening: the consequence ledger is append-only through the governed
-- operations. Signed-in users must hold read access only; every write flows
-- through supervisory_consequence_record / supervisory_consequence_withdraw.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supervisory_consequence_decision FROM authenticated;
REVOKE ALL ON public.supervisory_consequence_decision FROM anon;
GRANT SELECT ON public.supervisory_consequence_decision TO authenticated;
GRANT ALL ON public.supervisory_consequence_decision TO service_role;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.supervisory_consequence_decision','INSERT')
     OR has_table_privilege('authenticated','public.supervisory_consequence_decision','UPDATE')
     OR has_table_privilege('authenticated','public.supervisory_consequence_decision','DELETE')
     OR has_table_privilege('anon','public.supervisory_consequence_decision','SELECT') THEN
    RAISE EXCEPTION 'AML-08: the consequence ledger still exposes direct writes or anonymous reads';
  END IF;
END $$;