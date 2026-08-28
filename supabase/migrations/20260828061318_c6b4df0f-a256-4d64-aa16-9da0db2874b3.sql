-- GAP-F1-03 — remove direct DML on governed configuration tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM public.config_governed_tables LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated',
      r.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.table_name);
  END LOOP;
END$$;

-- GAP-F1-02 — narrow anonymous configuration reads to an explicit public allowlist.
CREATE TABLE IF NOT EXISTS public.config_public_read_allowlist (
  table_name text PRIMARY KEY,
  journey text NOT NULL,
  justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.config_public_read_allowlist TO authenticated;
GRANT ALL ON public.config_public_read_allowlist TO service_role;
ALTER TABLE public.config_public_read_allowlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal staff can read the public config allowlist" ON public.config_public_read_allowlist;
CREATE POLICY "Internal staff can read the public config allowlist"
  ON public.config_public_read_allowlist FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

INSERT INTO public.config_public_read_allowlist (table_name, journey, justification) VALUES
  ('sectors',                  'Public registration + service catalogue', 'Applicant chooses a sector before signing in'),
  ('sub_sectors',              'Public registration + service catalogue', 'Applicant chooses a sub-sector before signing in'),
  ('categories',               'Public registration + service catalogue', 'Applicant chooses a category before signing in'),
  ('services',                 'Public service catalogue',                'Public catalogue of regulatory services'),
  ('registration_form_configs','Public registration wizard',              'Registration form is rendered before authentication'),
  ('captcha_configurations',   'Login / registration captcha',            'Captcha provider must be resolvable pre-auth'),
  ('complaint_types',          'Public complaint intake',                 'Complaint type list shown on the public intake wizard'),
  ('master_data_types',        'Public registration wizard',              'Registration dropdowns resolve master data pre-auth'),
  ('master_data_items',        'Public registration wizard',              'Registration dropdown values resolve pre-auth'),
  ('regulators',               'Public branding / regulator selection',   'Public pages show regulator identity')
ON CONFLICT (table_name) DO UPDATE
  SET journey = EXCLUDED.journey, justification = EXCLUDED.justification;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT g.table_name FROM public.config_governed_tables g
    WHERE g.table_name NOT IN (SELECT table_name FROM public.config_public_read_allowlist)
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.table_name);
  END LOOP;

  FOR r IN SELECT table_name FROM public.config_public_read_allowlist LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', r.table_name);
  END LOOP;
END$$;