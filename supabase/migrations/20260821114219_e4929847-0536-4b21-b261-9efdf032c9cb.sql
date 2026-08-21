-- EPR-03 certification remediation (P11 Enforcement)
-- Defect 1 (item 14): case numbers were allocated with count(*)+1 -> collision race.
-- Defect 2 (item 8): maker/checker exempted holders of 'decide', i.e. never applied.

CREATE TABLE IF NOT EXISTS public.enforcement_case_number_counters (
  year       integer PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.enforcement_case_number_counters TO authenticated;
GRANT ALL    ON public.enforcement_case_number_counters TO service_role;
ALTER TABLE public.enforcement_case_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS encc_read ON public.enforcement_case_number_counters;
CREATE POLICY encc_read ON public.enforcement_case_number_counters
  FOR SELECT TO authenticated
  USING (public.can_act_on_enforcement(auth.uid(), 'view'));

INSERT INTO public.enforcement_case_number_counters (year, last_value)
SELECT extract(year FROM now())::int,
       coalesce(max(regexp_replace(case_number, '^ENF-\d{4}-', '')::int), 0)
  FROM public.enforcement_actions
 WHERE case_number ~ ('^ENF-' || extract(year FROM now())::int || '-\d+$')
ON CONFLICT (year) DO UPDATE
  SET last_value = GREATEST(public.enforcement_case_number_counters.last_value, EXCLUDED.last_value);

CREATE OR REPLACE FUNCTION public.enforcement_next_case_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_year integer := extract(year FROM now())::int;
  v_next integer;
BEGIN
  -- One atomic upsert: the row lock serialises concurrent allocation, so no two
  -- referrals get the same reference and no valid referral fails on a race.
  INSERT INTO public.enforcement_case_number_counters AS c (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
  RETURNING c.last_value INTO v_next;

  RETURN 'ENF-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforcement_next_case_number() FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS enforcement_actions_case_number_uk
  ON public.enforcement_actions (case_number);

-- Patch the two governed functions in place, asserting the target text exists.
DO $mig$
DECLARE
  v_src text;
  v_new text;
  v_old_num text := '  v_number := ''ENF-'' || to_char(now(), ''YYYY'') || ''-'' || lpad((
    SELECT count(*) + 1 FROM enforcement_actions
     WHERE date_trunc(''year'', created_at) = date_trunc(''year'', now()))::text, 5, ''0'');';
  v_new_num text := '  v_number := public.enforcement_next_case_number();';
  v_old_mc text := '  IF v_t.requires_maker_checker AND v_case.referred_by IS NOT NULL AND v_case.referred_by = v_uid
     AND NOT public.has_permission(v_uid, ''enforcement_management'', ''decide'') THEN';
  v_new_mc text := '  IF v_t.requires_maker_checker AND v_uid IN (
       coalesce(v_case.referred_by, ''00000000-0000-0000-0000-000000000000''::uuid),
       coalesce(v_case.opened_by,   ''00000000-0000-0000-0000-000000000000''::uuid)
     ) THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforcement_referral_create';
  IF position(v_old_num IN v_src) = 0 THEN
    RAISE EXCEPTION 'EPR-03: case-number allocation snippet not found in enforcement_referral_create';
  END IF;
  v_new := replace(v_src, v_old_num, v_new_num);
  EXECUTE v_new;

  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforcement_case_action';
  IF position(v_old_mc IN v_src) = 0 THEN
    RAISE EXCEPTION 'EPR-03: maker/checker snippet not found in enforcement_case_action';
  END IF;
  v_new := replace(v_src, v_old_mc, v_new_mc);
  EXECUTE v_new;
END
$mig$;