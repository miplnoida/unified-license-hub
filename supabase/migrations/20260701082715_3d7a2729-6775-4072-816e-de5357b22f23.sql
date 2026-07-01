-- Immutability: BEFORE UPDATE/DELETE triggers on all three audit tables
CREATE OR REPLACE FUNCTION public.tg_prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit tables are append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_audit_logs','security_event_logs','audit_logs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_audit_mutation_upd ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_audit_mutation_del ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_prevent_audit_mutation_upd BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_audit_mutation()', t);
    EXECUTE format('CREATE TRIGGER trg_prevent_audit_mutation_del BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_audit_mutation()', t);
  END LOOP;
END $$;

-- Spec parity: expose actor_role on security_event_logs (generated alias of user_role)
ALTER TABLE public.security_event_logs
  ADD COLUMN IF NOT EXISTS actor_role text GENERATED ALWAYS AS (user_role) STORED;