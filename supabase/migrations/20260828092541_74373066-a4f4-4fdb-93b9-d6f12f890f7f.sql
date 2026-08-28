-- F2-B Stage 2 — GAP-F2-02, 04, 05, 06, 07, 09, 10
-- =====================================================================
-- 1. GOVERNED VOCABULARIES (GAP-F2-07)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_stage_catalogue (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  resume_route text,
  sort_order integer NOT NULL DEFAULT 100,
  is_terminal boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.onboarding_stage_catalogue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.onboarding_stage_catalogue TO authenticated;
GRANT ALL ON public.onboarding_stage_catalogue TO service_role;
ALTER TABLE public.onboarding_stage_catalogue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_stage_catalogue_read" ON public.onboarding_stage_catalogue;
CREATE POLICY "onboarding_stage_catalogue_read" ON public.onboarding_stage_catalogue
  FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS trg_onboarding_stage_catalogue_updated_at ON public.onboarding_stage_catalogue;
CREATE TRIGGER trg_onboarding_stage_catalogue_updated_at BEFORE UPDATE ON public.onboarding_stage_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.onboarding_stage_catalogue (key, label, description, resume_route, sort_order, is_terminal) VALUES
  ('USER_ACCOUNT','User account','A user account exists but no entity has been identified.','/register/account',10,false),
  ('ENTITY_IDENTIFICATION','Entity identification','The applicant is identifying the organisation they act for.','/register/entity',20,false),
  ('AUTHORITY_PENDING','Authority pending','Membership requested; the regulator has not yet granted authority.','/register/authority-pending',30,false),
  ('AUTHORITY_GRANTED','Authority granted','Authority to act for the entity has been granted.','/applications/new',40,false),
  ('APPLICATION','Application','The applicant has moved on to an application.','/applications/new',50,false),
  ('COMPLETE','Complete','Onboarding is closed for this user.','/dashboard',60,true)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label, description = EXCLUDED.description, resume_route = EXCLUDED.resume_route,
    sort_order = EXCLUDED.sort_order, is_terminal = EXCLUDED.is_terminal, updated_at = now();

CREATE TABLE IF NOT EXISTS public.entity_membership_status_catalogue (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_open boolean NOT NULL DEFAULT false,
  is_authority_sufficient boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.entity_membership_status_catalogue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.entity_membership_status_catalogue TO authenticated;
GRANT ALL ON public.entity_membership_status_catalogue TO service_role;
ALTER TABLE public.entity_membership_status_catalogue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_membership_status_catalogue_read" ON public.entity_membership_status_catalogue;
CREATE POLICY "entity_membership_status_catalogue_read" ON public.entity_membership_status_catalogue
  FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS trg_entity_membership_status_catalogue_updated_at ON public.entity_membership_status_catalogue;
CREATE TRIGGER trg_entity_membership_status_catalogue_updated_at BEFORE UPDATE ON public.entity_membership_status_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.entity_membership_status_catalogue (key,label,description,is_open,is_authority_sufficient,sort_order) VALUES
  ('REQUESTED','Requested','Membership requested by the user.',true,false,10),
  ('PENDING_VERIFICATION','Pending verification','Awaiting authority-evidence verification.',true,false,20),
  ('VERIFIED','Verified','Authority evidence verified; awaiting approval.',true,false,30),
  ('APPROVED','Approved','Authority granted; the user may act for the entity.',true,true,40),
  ('REJECTED','Rejected','Membership request refused.',false,false,50),
  ('REVOKED','Revoked','Previously granted authority withdrawn.',false,false,60),
  ('EXPIRED','Expired','Membership lapsed.',false,false,70)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label, description = EXCLUDED.description, is_open = EXCLUDED.is_open,
    is_authority_sufficient = EXCLUDED.is_authority_sufficient, sort_order = EXCLUDED.sort_order, updated_at = now();

-- =====================================================================
-- 2. ENTITY IDENTITY CONVERGENCE (GAP-F2-02)
--    Canonical entity key = public.licensees.id
--    Canonical name/party projection = parties + organizations (1:1, mandatory)
-- =====================================================================
-- 2a. Auto-converge party projections (organizations / persons).
CREATE OR REPLACE FUNCTION public.parties_ensure_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.party_kind = 'ORGANIZATION' THEN
    INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
    VALUES (NEW.id, NEW.display_name, NEW.display_name, 'LOCAL_PROVISIONAL')
    ON CONFLICT (party_id) DO NOTHING;
  ELSIF NEW.party_kind = 'PERSON' THEN
    INSERT INTO public.persons (party_id, full_name)
    VALUES (NEW.id, NEW.display_name)
    ON CONFLICT (party_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.parties_ensure_projection() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_parties_ensure_projection ON public.parties;
CREATE TRIGGER trg_parties_ensure_projection
  AFTER INSERT ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.parties_ensure_projection();

-- 2b. Backfill the person half of the party model from existing authoritative names.
INSERT INTO public.persons (party_id, full_name)
SELECT p.id, p.display_name
FROM public.parties p
WHERE p.party_kind = 'PERSON'
  AND NOT EXISTS (SELECT 1 FROM public.persons x WHERE x.party_id = p.id)
ON CONFLICT (party_id) DO NOTHING;

-- 2c. Backfill organisation parties for entities with no binding, from licensees.name.
DO $do$
DECLARE r record; v_party uuid;
BEGIN
  FOR r IN SELECT id, name FROM public.licensees WHERE party_id IS NULL ORDER BY created_at LOOP
    INSERT INTO public.parties (party_kind, display_name) VALUES ('ORGANIZATION', r.name)
    RETURNING id INTO v_party;
    -- organizations row is created by trg_parties_ensure_projection
    UPDATE public.licensees SET party_id = v_party, updated_at = now() WHERE id = r.id;
  END LOOP;
END
$do$;

-- 2d. Future entity records converge atomically.
CREATE OR REPLACE FUNCTION public.licensees_ensure_party_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_party uuid;
BEGIN
  IF NEW.party_id IS NULL THEN
    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('ORGANIZATION', COALESCE(NULLIF(btrim(NEW.name),''), 'Unnamed entity'))
    RETURNING id INTO v_party;
    NEW.party_id := v_party;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.licensees_ensure_party_binding() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_licensees_ensure_party_binding ON public.licensees;
CREATE TRIGGER trg_licensees_ensure_party_binding
  BEFORE INSERT ON public.licensees
  FOR EACH ROW EXECUTE FUNCTION public.licensees_ensure_party_binding();

ALTER TABLE public.licensees ALTER COLUMN party_id SET NOT NULL;

-- =====================================================================
-- 3. UNIQUENESS / OWNERSHIP KEYS (GAP-F2-04)
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_uidx
  ON public.profiles (lower(email)) WHERE COALESCE(btrim(email),'') <> '';
CREATE UNIQUE INDEX IF NOT EXISTS pre_license_users_email_lower_uidx
  ON public.pre_license_users (lower(email)) WHERE COALESCE(btrim(email),'') <> '';
CREATE UNIQUE INDEX IF NOT EXISTS licensees_name_lower_uidx
  ON public.licensees (lower(btrim(name))) WHERE merged_into_entity_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registration_entity_bindings_registration_uidx
  ON public.registration_entity_bindings (registration_id);

-- =====================================================================
-- 4. ONBOARDING TOKEN HARDENING (GAP-F2-06)
-- =====================================================================
ALTER TABLE public.onboarding_resolution_tokens ADD COLUMN IF NOT EXISTS token_hash text;

UPDATE public.onboarding_resolution_tokens
   SET token_hash = encode(sha256(convert_to(token, 'utf8')), 'hex')
 WHERE token_hash IS NULL;

ALTER TABLE public.onboarding_resolution_tokens ALTER COLUMN token_hash SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_resolution_tokens_hash_uidx
  ON public.onboarding_resolution_tokens (token_hash);
ALTER TABLE public.onboarding_resolution_tokens DROP COLUMN IF EXISTS token;

CREATE OR REPLACE FUNCTION public.onboarding_issue_token(_kind text, _entity_id uuid, _case_id uuid, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  v_token := _kind || '_' || replace(gen_random_uuid()::text, '-', '');
  -- Only an irreversible fingerprint is persisted; the raw value exists solely
  -- in the response to the caller that will redeem it.
  INSERT INTO public.onboarding_resolution_tokens (token_hash, user_id, token_kind, entity_id, case_id, payload)
  VALUES (encode(sha256(convert_to(v_token,'utf8')),'hex'), auth.uid(), _kind, _entity_id, _case_id, COALESCE(_payload,'{}'::jsonb));
  RETURN v_token;
END
$fn$;

CREATE OR REPLACE FUNCTION public.onboarding_redeem_token(_token text, _kinds text[])
RETURNS onboarding_resolution_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE r public.onboarding_resolution_tokens;
BEGIN
  -- Single-use is enforced here, in the shared primitive, not in each caller.
  UPDATE public.onboarding_resolution_tokens t
     SET consumed_at = now()
   WHERE t.token_hash = encode(sha256(convert_to(_token,'utf8')),'hex')
     AND t.user_id = auth.uid()
     AND t.consumed_at IS NULL
     AND t.expires_at >= now()
     AND t.token_kind = ANY(_kinds)
  RETURNING t.* INTO r;

  IF r.id IS NOT NULL THEN
    RETURN r;
  END IF;

  SELECT * INTO r FROM public.onboarding_resolution_tokens
   WHERE token_hash = encode(sha256(convert_to(_token,'utf8')),'hex')
     AND user_id = auth.uid()
   LIMIT 1;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Invalid onboarding reference' USING ERRCODE='42501';
  ELSIF r.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This onboarding reference has already been used — please identify the entity again' USING ERRCODE='22023';
  ELSIF r.expires_at < now() THEN
    RAISE EXCEPTION 'Onboarding reference expired — please identify the entity again' USING ERRCODE='22023';
  ELSE
    RAISE EXCEPTION 'Onboarding reference not valid for this step' USING ERRCODE='22023';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.onboarding_issue_token(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboarding_redeem_token(text, text[]) FROM PUBLIC, anon;

-- =====================================================================
-- 5. CAPABILITY & DATA-REMEDIATION REGISTERS (GAP-F2-09, GAP-F2-10)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.identity_capability_register (
  capability_key text PRIMARY KEY,
  object_name text NOT NULL,
  object_kind text NOT NULL CHECK (object_kind IN ('TABLE','FUNCTION','VIEW')),
  status text NOT NULL CHECK (status IN ('WIRED','GOVERNED_BACKLOG','DEMOTED')),
  access_path text,
  decision_note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.identity_capability_register FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.identity_capability_register TO authenticated;
GRANT ALL ON public.identity_capability_register TO service_role;
ALTER TABLE public.identity_capability_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "identity_capability_register_read" ON public.identity_capability_register;
CREATE POLICY "identity_capability_register_read" ON public.identity_capability_register
  FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS trg_identity_capability_register_updated_at ON public.identity_capability_register;
CREATE TRIGGER trg_identity_capability_register_updated_at BEFORE UPDATE ON public.identity_capability_register
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.identity_capability_register (capability_key, object_name, object_kind, status, access_path, decision_note) VALUES
  ('entity_identity_snapshots','entity_identity_snapshots','TABLE','GOVERNED_BACKLOG',NULL,'Append-only snapshot store with an enforcing trigger but no invoked writer. Retained; a snapshot writer is scheduled with the entity-history epic. No UI advertises it.'),
  ('entity_merges','entity_merges','TABLE','WIRED','entity_merge_preview()/entity_merge_execute() via useResolutionMutations','Merge preview/execute RPCs are the only write path; the single existing row predates the RPCs.'),
  ('onboarding_security_metadata','onboarding_security_metadata','TABLE','GOVERNED_BACKLOG',NULL,'Reserved for onboarding device/security fingerprints. No writer and no reader today; kept empty rather than partially populated.'),
  ('onboarding_retention_policies','onboarding_retention_policies','TABLE','GOVERNED_BACKLOG',NULL,'Retention policy is configured but no purge worker enforces it. Recorded as governed backlog; policy rows are not treated as an implemented control.'),
  ('registration_journey_events','registration_journey_events','TABLE','WIRED','onboarding_record_journey_event() / onboarding_identification_activity()','Append-only ledger served through governed RPCs.'),
  ('entity_identity_resolution_events','entity_identity_resolution_events','TABLE','WIRED','resolution RPCs / entity_onboarding_activity()','Append-only ledger served through governed RPCs.'),
  ('entity_resolution_cases','entity_resolution_cases','TABLE','WIRED','entity_resolution_queue read model + decide/resolve RPCs','No direct client table access by design.')
ON CONFLICT (capability_key) DO UPDATE
SET object_name=EXCLUDED.object_name, object_kind=EXCLUDED.object_kind, status=EXCLUDED.status,
    access_path=EXCLUDED.access_path, decision_note=EXCLUDED.decision_note, updated_at=now();

CREATE TABLE IF NOT EXISTS public.identity_data_remediation_register (
  finding_key text PRIMARY KEY,
  finding_class text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  observed_count integer NOT NULL DEFAULT 0,
  detection_sql text NOT NULL,
  owner_note text NOT NULL,
  is_structurally_prevented boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.identity_data_remediation_register FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.identity_data_remediation_register TO authenticated;
GRANT ALL ON public.identity_data_remediation_register TO service_role;
ALTER TABLE public.identity_data_remediation_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "identity_data_remediation_register_read" ON public.identity_data_remediation_register;
CREATE POLICY "identity_data_remediation_register_read" ON public.identity_data_remediation_register
  FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS trg_identity_data_remediation_register_updated_at ON public.identity_data_remediation_register;
CREATE TRIGGER trg_identity_data_remediation_register_updated_at BEFORE UPDATE ON public.identity_data_remediation_register
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.identity_data_remediation_register
  (finding_key, finding_class, severity, observed_count, detection_sql, owner_note, is_structurally_prevented)
VALUES
  ('ENTITY_WITHOUT_OWNING_HUMAN','onboarding_closure','medium',
   (SELECT count(*)::int FROM public.licensees l
     WHERE NOT EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.entity_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.entity_user_access a WHERE a.entity_id = l.id)),
   'licensees with no entity_user_memberships and no entity_user_access row',
   'Regulator-created entity shells with no responsible human. Business remediation: each shell needs either a provisioned web user or an explicit no-portal-access decision. Not auto-created — inventing an owning human would fabricate authority.',
   false),
  ('REGISTRATION_WITHOUT_ENTITY_BINDING','handoff','medium',
   (SELECT count(*)::int FROM public.registrations r
     LEFT JOIN public.registration_entity_bindings b ON b.registration_id = r.id
     WHERE b.id IS NULL),
   'registrations with no registration_entity_bindings row',
   'Legacy registration created before the governed FORM_FIRST resolver existed. New registrations bind through onboarding_form_first_resolve_service(); the 1:1 binding key is now enforced. Backfilling requires a regulator resolution decision.',
   false)
ON CONFLICT (finding_key) DO UPDATE
SET observed_count = EXCLUDED.observed_count, detection_sql = EXCLUDED.detection_sql,
    owner_note = EXCLUDED.owner_note, severity = EXCLUDED.severity, updated_at = now();

-- =====================================================================
-- 6. INTEGRITY REPORT + HANDOFF READINESS (GAP-F2-05, GAP-F2-10)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.identity_integrity_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
          OR public.has_role(auth.uid(),'supervisor')) THEN
    RAISE EXCEPTION 'Not authorised to read identity integrity' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'auth_users_without_identity_record',
      (SELECT count(*) FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
          AND NOT EXISTS (SELECT 1 FROM public.pre_license_users pl WHERE pl.id = u.id)),
    'entities_total', (SELECT count(*) FROM public.licensees),
    'entities_without_party', (SELECT count(*) FROM public.licensees WHERE party_id IS NULL),
    'organization_parties', (SELECT count(*) FROM public.parties WHERE party_kind='ORGANIZATION'),
    'organizations', (SELECT count(*) FROM public.organizations),
    'person_parties', (SELECT count(*) FROM public.parties WHERE party_kind='PERSON'),
    'persons', (SELECT count(*) FROM public.persons),
    'entities_without_owning_human',
      (SELECT count(*) FROM public.licensees l
        WHERE NOT EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.entity_id=l.id)
          AND NOT EXISTS (SELECT 1 FROM public.entity_user_access a WHERE a.entity_id=l.id)),
    'registrations_without_entity_binding',
      (SELECT count(*) FROM public.registrations r
        LEFT JOIN public.registration_entity_bindings b ON b.registration_id=r.id
        WHERE b.id IS NULL),
    'unconsumed_live_tokens',
      (SELECT count(*) FROM public.onboarding_resolution_tokens WHERE consumed_at IS NULL AND expires_at >= now())
  ) INTO v;
  RETURN v;
END
$fn$;
REVOKE ALL ON FUNCTION public.identity_integrity_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_integrity_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.onboarding_registration_handoff_ready(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_party uuid; v_has_org boolean; v_authority boolean; v_blockers text[] := '{}'::text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;

  SELECT party_id INTO v_party FROM public.licensees WHERE id = _entity_id;
  IF v_party IS NULL THEN
    v_blockers := v_blockers || 'Entity has no canonical organisation record';
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.organizations o WHERE o.party_id = v_party) INTO v_has_org;
    IF NOT v_has_org THEN
      v_blockers := v_blockers || 'Entity organisation projection is missing';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
    JOIN public.entity_membership_status_catalogue s ON s.key = m.status
    WHERE m.entity_id = _entity_id AND s.is_authority_sufficient
  ) INTO v_authority;
  IF NOT v_authority THEN
    v_blockers := v_blockers || 'No user holds approved authority to act for this entity';
  END IF;

  RETURN jsonb_build_object(
    'entity_id', _entity_id,
    'ready', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers)
  );
END
$fn$;
REVOKE ALL ON FUNCTION public.onboarding_registration_handoff_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_registration_handoff_ready(uuid) TO authenticated;

-- =====================================================================
-- 7. Register the new governed vocabularies under the F2 privilege contract
-- =====================================================================
INSERT INTO public.identity_governed_tables
  (table_name, domain, canonical_write_path, anon_select_allowed, authenticated_select_allowed, authenticated_writes, notes)
VALUES
  ('onboarding_stage_catalogue','ONBOARDING','configuration writer RPCs', false, true, '{}'::text[], 'Governed onboarding stage vocabulary (replaces hard-coded UI lists).'),
  ('entity_membership_status_catalogue','LINKAGE','configuration writer RPCs', false, true, '{}'::text[], 'Governed membership status vocabulary (replaces hard-coded UI tabs).'),
  ('identity_governed_tables','USER_IDENTITY','migration-managed register', false, true, '{}'::text[], 'The F2 privilege register itself.'),
  ('identity_capability_register','USER_IDENTITY','migration-managed register', false, true, '{}'::text[], NULL),
  ('identity_data_remediation_register','USER_IDENTITY','migration-managed register', false, true, '{}'::text[], NULL)
ON CONFLICT (table_name) DO UPDATE
SET domain=EXCLUDED.domain, canonical_write_path=EXCLUDED.canonical_write_path,
    anon_select_allowed=EXCLUDED.anon_select_allowed,
    authenticated_select_allowed=EXCLUDED.authenticated_select_allowed,
    authenticated_writes=EXCLUDED.authenticated_writes, notes=EXCLUDED.notes, updated_at=now();

-- Re-assert the contract across the full register.
DO $do$
DECLARE snap jsonb; r jsonb; q text; w text; v_bad int; v_rls boolean;
BEGIN
  -- Snapshot first: the loop grants on the register itself, which cannot be
  -- altered while an active query still holds it open.
  SELECT COALESCE(jsonb_agg(to_jsonb(g.*) ORDER BY g.table_name), '[]'::jsonb) INTO snap
    FROM public.identity_governed_tables g
    JOIN pg_class c ON c.relname=g.table_name
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
   WHERE c.relkind='r';

  FOR r IN SELECT jsonb_array_elements(snap) LOOP
    q := format('public.%I', r->>'table_name');
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM PUBLIC', q);
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM anon', q);
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM authenticated', q);
    IF (r->>'anon_select_allowed')::boolean THEN EXECUTE format('GRANT SELECT ON %s TO anon', q); END IF;
    IF (r->>'authenticated_select_allowed')::boolean THEN EXECUTE format('GRANT SELECT ON %s TO authenticated', q); END IF;
    FOREACH w IN ARRAY (SELECT COALESCE(array_agg(x), '{}'::text[]) FROM jsonb_array_elements_text(r->'authenticated_writes') x) LOOP
      EXECUTE format('GRANT %s ON %s TO authenticated', w, q);
    END LOOP;
    EXECUTE format('GRANT ALL PRIVILEGES ON %s TO service_role', q);
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname = r->>'table_name';
    IF NOT COALESCE(v_rls, false) THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', q);
    END IF;
  END LOOP;

  SELECT count(*) INTO v_bad
  FROM public.identity_governed_tables g
  JOIN pg_class c ON c.relname=g.table_name
  JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' AND c.relkind='r'
  CROSS JOIN LATERAL (SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS priv) p
  WHERE (has_table_privilege('anon','public.'||quote_ident(g.table_name),p.priv)
           AND NOT (p.priv='SELECT' AND g.anon_select_allowed))
     OR (has_table_privilege('authenticated','public.'||quote_ident(g.table_name),p.priv)
           AND NOT (p.priv='SELECT' AND g.authenticated_select_allowed)
           AND NOT (p.priv = ANY(g.authenticated_writes)));
  IF v_bad > 0 THEN RAISE EXCEPTION 'F2 privilege contract violated on % pairs', v_bad; END IF;
END
$do$;

-- Convergence assertions (fail the migration rather than ship divergence).
DO $do$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.licensees WHERE party_id IS NULL;
  IF v > 0 THEN RAISE EXCEPTION '% licensees still unbound', v; END IF;
  SELECT count(*) INTO v FROM public.parties p WHERE p.party_kind='ORGANIZATION'
    AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.party_id=p.id);
  IF v > 0 THEN RAISE EXCEPTION '% organization parties without projection', v; END IF;
  SELECT count(*) INTO v FROM public.parties p WHERE p.party_kind='PERSON'
    AND NOT EXISTS (SELECT 1 FROM public.persons x WHERE x.party_id=p.id);
  IF v > 0 THEN RAISE EXCEPTION '% person parties without projection', v; END IF;
END
$do$;