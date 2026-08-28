-- F2-B Stage 1 — GAP-F2-01: governed privilege closure for the identity estate.
-- Canonical contract:
--   anon           : no privileges, except allowlisted SELECT
--   authenticated  : minimum required SELECT; direct writes only where no
--                    canonical governed writer exists; never DELETE/TRUNCATE/
--                    REFERENCES/TRIGGER/MAINTAIN
--   service_role   : ALL (unchanged)

CREATE TABLE IF NOT EXISTS public.identity_governed_tables (
  table_name text PRIMARY KEY,
  domain text NOT NULL CHECK (domain IN ('USER_IDENTITY','ENTITY_IDENTITY','LINKAGE','REGISTRATION','ONBOARDING')),
  canonical_write_path text NOT NULL,
  anon_select_allowed boolean NOT NULL DEFAULT false,
  anon_select_justification text,
  authenticated_select_allowed boolean NOT NULL DEFAULT false,
  authenticated_writes text[] NOT NULL DEFAULT '{}'::text[],
  write_retention_justification text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_governed_tables_writes_chk
    CHECK (authenticated_writes <@ ARRAY['INSERT','UPDATE']::text[]),
  CONSTRAINT identity_governed_tables_anon_justified_chk
    CHECK (anon_select_allowed = false OR COALESCE(btrim(anon_select_justification),'') <> ''),
  CONSTRAINT identity_governed_tables_write_justified_chk
    CHECK (cardinality(authenticated_writes) = 0 OR COALESCE(btrim(write_retention_justification),'') <> '')
);

REVOKE ALL ON public.identity_governed_tables FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.identity_governed_tables TO authenticated;
GRANT ALL ON public.identity_governed_tables TO service_role;
ALTER TABLE public.identity_governed_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "identity_governed_tables_read" ON public.identity_governed_tables;
CREATE POLICY "identity_governed_tables_read"
  ON public.identity_governed_tables FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_identity_governed_tables_updated_at ON public.identity_governed_tables;
CREATE TRIGGER trg_identity_governed_tables_updated_at
  BEFORE UPDATE ON public.identity_governed_tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Register. Privilege decisions are derived from an exhaustive census of
-- src/ direct table access (`.from('<table>')`) plus security_invoker views.
-- ---------------------------------------------------------------------------
INSERT INTO public.identity_governed_tables
  (table_name, domain, canonical_write_path, anon_select_allowed, anon_select_justification,
   authenticated_select_allowed, authenticated_writes, write_retention_justification, notes)
VALUES
  ('profiles','USER_IDENTITY','handle_new_user() trigger + admin RPCs', false, NULL, true,
     ARRAY['UPDATE']::text[], 'Self-service profile maintenance and admin user management have no canonical RPC writer yet; RLS scopes the rows.', 'Read by 49 modules and 5 security_invoker report views.'),
  ('user_roles','USER_IDENTITY','role-assignment RPCs (has_role reads)', false, NULL, true, '{}'::text[], NULL, 'Role truth table; writes are RPC/trigger governed.'),
  ('pre_license_users','USER_IDENTITY','handle_new_user() + register-pre-licensee (service role)', false, NULL, true, '{}'::text[], NULL, NULL),
  ('otp_verifications','USER_IDENTITY','send-/verify-registration-otp edge functions (service role)', false, NULL, false, '{}'::text[], NULL, 'Hashed OTP store; no browser path.'),
  ('licensees','ENTITY_IDENTITY','entity_create_local() and entity lifecycle RPCs', false, NULL, true,
     ARRAY['UPDATE']::text[], 'Background-information maintenance in the entity detail workspace has no canonical RPC writer yet.', 'Canonical entity identifier for all F2 foreign keys.'),
  ('parties','ENTITY_IDENTITY','entity_create_local() / party projection writers', false, NULL, false, '{}'::text[], NULL, 'RDM party spine.'),
  ('organizations','ENTITY_IDENTITY','entity_create_local() / party projection writers', false, NULL, false, '{}'::text[], NULL, NULL),
  ('persons','ENTITY_IDENTITY','appointment and person projection writers', false, NULL, false, '{}'::text[], NULL, NULL),
  ('entity_identifiers','ENTITY_IDENTITY','entity_identifier_register/verify/reject_verification RPCs', false, NULL, false, '{}'::text[], NULL, 'Served to the UI through governed RPCs only.'),
  ('entity_identifier_types','ENTITY_IDENTITY','configuration writer RPCs', false, NULL, true, '{}'::text[], NULL, 'Read by RegisterIdentifierDialog.'),
  ('entity_identity_statuses','ENTITY_IDENTITY','configuration writer RPCs', false, NULL, true, '{}'::text[], NULL, 'Identity status vocabulary.'),
  ('entity_identity_snapshots','ENTITY_IDENTITY','snapshot writer routine (append-only)', false, NULL, false, '{}'::text[], NULL, NULL),
  ('entity_identity_resolution_events','ENTITY_IDENTITY','resolution RPCs (append-only ledger)', false, NULL, false, '{}'::text[], NULL, NULL),
  ('entity_resolution_cases','ENTITY_IDENTITY','entity resolution RPCs', false, NULL, false, '{}'::text[], NULL, 'Exposed via entity_resolution_queue read model.'),
  ('entity_merges','ENTITY_IDENTITY','entity merge preview/execute RPCs', false, NULL, false, '{}'::text[], NULL, NULL),
  ('entity_appointments','LINKAGE','appointment RPCs / change-set writers', false, NULL, true, '{}'::text[], NULL, NULL),
  ('entity_user_memberships','LINKAGE','entity_membership_* RPCs', false, NULL, true, '{}'::text[], NULL, NULL),
  ('entity_user_access','LINKAGE','web-user provisioning edge functions (service role)', false, NULL, false, '{}'::text[], NULL, 'Legacy access model retained for primary-user state.'),
  ('entity_membership_roles','LINKAGE','configuration writer RPCs', false, NULL, true, '{}'::text[], NULL, NULL),
  ('ppoc_entity_mappings','LINKAGE','manage-web-user / create-web-user edge functions (service role)', false, NULL, true, '{}'::text[], NULL, NULL),
  ('registrations','REGISTRATION','register-pre-licensee edge function (service role)', false, NULL, true,
     ARRAY['UPDATE']::text[], 'Applicant draft/resubmission editing in PreLicenseeRegistration has no canonical RPC writer yet.', NULL),
  ('registration_form_submissions','REGISTRATION','registration portal (RLS-scoped applicant writes)', false, NULL, true,
     ARRAY['INSERT','UPDATE']::text[], 'Applicant registration form authoring is a first-party RLS-scoped write path with no RPC equivalent.', NULL),
  ('registration_form_configs','REGISTRATION','configuration writer RPCs', true,
     'Public registration pages must render the configured registration form before an account exists.', true, '{}'::text[], NULL, NULL),
  ('registration_journey_types','REGISTRATION','configuration writer RPCs', true,
     '/register renders the governed public journey catalogue to unauthenticated visitors.', true, '{}'::text[], NULL, NULL),
  ('registration_journey_events','REGISTRATION','onboarding_record_journey_event() (append-only)', false, NULL, false, '{}'::text[], NULL, NULL),
  ('registration_entity_bindings','REGISTRATION','onboarding_form_first_resolve_service() and resolution RPCs', false, NULL, false, '{}'::text[], NULL, NULL),
  ('onboarding_journey_state','ONBOARDING','onboarding_* RPCs', false, NULL, false, '{}'::text[], NULL, 'Read through onboarding_journey_context().'),
  ('onboarding_resolution_tokens','ONBOARDING','onboarding_issue_token()/onboarding_redeem_token()', false, NULL, false, '{}'::text[], NULL, 'Opaque token store; never browser-readable.'),
  ('onboarding_alert_rules','ONBOARDING','configuration writer RPCs', false, NULL, false, '{}'::text[], NULL, NULL),
  ('onboarding_alert_signals','ONBOARDING','onboarding RPCs (append-only)', false, NULL, false, '{}'::text[], NULL, NULL),
  ('onboarding_retention_policies','ONBOARDING','configuration writer RPCs', false, NULL, false, '{}'::text[], NULL, NULL),
  ('onboarding_security_metadata','ONBOARDING','onboarding security writer routines', false, NULL, false, '{}'::text[], NULL, NULL)
ON CONFLICT (table_name) DO UPDATE
SET domain = EXCLUDED.domain,
    canonical_write_path = EXCLUDED.canonical_write_path,
    anon_select_allowed = EXCLUDED.anon_select_allowed,
    anon_select_justification = EXCLUDED.anon_select_justification,
    authenticated_select_allowed = EXCLUDED.authenticated_select_allowed,
    authenticated_writes = EXCLUDED.authenticated_writes,
    write_retention_justification = EXCLUDED.write_retention_justification,
    notes = EXCLUDED.notes,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Apply the contract from the register (idempotent, registry-driven).
-- ---------------------------------------------------------------------------
DO $do$
DECLARE r record; q text; w text;
BEGIN
  FOR r IN
    SELECT g.* FROM public.identity_governed_tables g
    JOIN pg_class c ON c.relname = g.table_name
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
    ORDER BY g.table_name
  LOOP
    q := format('public.%I', r.table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM PUBLIC', q);
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM anon', q);
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM authenticated', q);

    IF r.anon_select_allowed THEN
      EXECUTE format('GRANT SELECT ON %s TO anon', q);
    END IF;
    IF r.authenticated_select_allowed THEN
      EXECUTE format('GRANT SELECT ON %s TO authenticated', q);
    END IF;
    FOREACH w IN ARRAY r.authenticated_writes LOOP
      EXECUTE format('GRANT %s ON %s TO authenticated', w, q);
    END LOOP;

    EXECUTE format('GRANT ALL PRIVILEGES ON %s TO service_role', q);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', q);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- Empirical assertion: the contract must hold immediately after apply.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.identity_governed_tables g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public' AND c.relkind='r'
  CROSS JOIN LATERAL (
    SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS priv
  ) p
  WHERE
    -- anon: only allowlisted SELECT
    (has_table_privilege('anon', 'public.'||quote_ident(g.table_name), p.priv)
       AND NOT (p.priv = 'SELECT' AND g.anon_select_allowed))
    OR
    -- authenticated: registered SELECT + registered writes only
    (has_table_privilege('authenticated', 'public.'||quote_ident(g.table_name), p.priv)
       AND NOT (p.priv = 'SELECT' AND g.authenticated_select_allowed)
       AND NOT (p.priv = ANY(g.authenticated_writes)));

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'F2 privilege contract violated on % (table, privilege) pairs', v_bad;
  END IF;
END
$do$;