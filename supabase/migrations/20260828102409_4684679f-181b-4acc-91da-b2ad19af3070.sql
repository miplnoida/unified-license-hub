-- F2-B.1 — final identity constraint cleanup
-- 1. Legal-name equality is NOT entity identity: remove the global unique index.
DROP INDEX IF EXISTS public.licensees_name_lower_uidx;

-- 2. No fabricated identity. A valid entity requires a real name; the binding
--    trigger fails explicitly instead of inventing an "Unnamed entity" party.
CREATE OR REPLACE FUNCTION public.licensees_ensure_party_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_party uuid; v_name text;
BEGIN
  v_name := NULLIF(btrim(NEW.name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Entity legal name is required: an entity cannot be created without a name'
      USING ERRCODE = '23514';
  END IF;
  NEW.name := v_name;

  IF NEW.party_id IS NULL THEN
    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('ORGANIZATION', v_name)
    RETURNING id INTO v_party;
    NEW.party_id := v_party;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.licensees_ensure_party_binding() FROM PUBLIC, anon, authenticated;

-- 3. Structural guarantee that no blank-named entity can be stored at all.
ALTER TABLE public.licensees DROP CONSTRAINT IF EXISTS licensees_name_present_chk;
ALTER TABLE public.licensees
  ADD CONSTRAINT licensees_name_present_chk CHECK (btrim(name) <> '') NOT VALID;
ALTER TABLE public.licensees VALIDATE CONSTRAINT licensees_name_present_chk;
