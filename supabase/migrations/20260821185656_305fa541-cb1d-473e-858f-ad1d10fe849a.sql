-- ============================================================
-- REGISTRATION & ENTITY ONBOARDING CONVERGENCE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registration_journey_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  public_title text NOT NULL,
  public_description text NOT NULL,
  help_text text,
  entry_route text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE CASCADE,
  applicant_type text,
  resolution_timing text NOT NULL DEFAULT 'LATE',
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS registration_journey_types_scope_key
  ON public.registration_journey_types (key, COALESCE(regulator_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(sector_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(applicant_type,'*'));

GRANT SELECT ON public.registration_journey_types TO anon, authenticated;
GRANT ALL ON public.registration_journey_types TO service_role;
ALTER TABLE public.registration_journey_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rjt_public_read ON public.registration_journey_types;
CREATE POLICY rjt_public_read ON public.registration_journey_types FOR SELECT
  USING (is_enabled AND is_public);
DROP POLICY IF EXISTS rjt_internal_read ON public.registration_journey_types;
CREATE POLICY rjt_internal_read ON public.registration_journey_types FOR SELECT
  TO authenticated USING (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid()));

INSERT INTO public.registration_journey_types
  (key, label, public_title, public_description, help_text, entry_route, is_default, resolution_timing, sort_order)
VALUES
  ('FORM_FIRST', 'New Applicant Registration', 'New Applicant Registration',
   'Use this option if you are registering an organisation or applicant for the first time, or you are unsure whether the organisation already exists in the regulator''s records.',
   'Register a new organisation or applicant. The regulator still verifies the organisation''s identity against its records later in the process.',
   '/register/applicant', true, 'LATE', 10),
  ('ENTITY_FIRST', 'Connect to an Existing Entity', 'Connect to an Existing Entity',
   'Use this option if your organisation may already exist in the regulator''s records and you need authority to access, file or act for it.',
   'Find an organisation already known to the regulator and request permission to act for it.',
   '/register/entity', false, 'EARLY', 20)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.onboarding_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_class text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  retention_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_retention_policies TO authenticated;
GRANT ALL ON public.onboarding_retention_policies TO service_role;
ALTER TABLE public.onboarding_retention_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orp_internal_read ON public.onboarding_retention_policies;
CREATE POLICY orp_internal_read ON public.onboarding_retention_policies FOR SELECT
  TO authenticated USING (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid()));

INSERT INTO public.onboarding_retention_policies (retention_class, label, description, retention_days) VALUES
  ('BUSINESS_ONBOARDING_AUDIT', 'Business onboarding audit', 'Entity identification and registration journey events - regulator retention policy.', NULL),
  ('SECURITY_NETWORK_METADATA', 'Security / network metadata', 'IP, user agent and session metadata captured by the authenticated gateway.', 400),
  ('TEMPORARY_RESOLUTION_TOKENS', 'Temporary resolution tokens', 'Short-lived opaque onboarding tokens - never treated as audit history.', 7)
ON CONFLICT (retention_class) DO NOTHING;

INSERT INTO public.sec_modules (key, label, description, sort_order)
SELECT 'onboarding', 'Onboarding & Entity Access', 'Registration journeys, entity identification activity and access requests', 55
WHERE NOT EXISTS (SELECT 1 FROM public.sec_modules WHERE key='onboarding');

INSERT INTO public.sec_permissions (module_id, key, label, description, is_sensitive, sort_order)
SELECT m.id, v.k, v.l, v.d, v.s, v.o
FROM public.sec_modules m
CROSS JOIN (VALUES
  ('view','View onboarding workspace','Access the Onboarding & Entity Access workspace', false, 10),
  ('audit_view','View onboarding audit','Read the durable entity identification audit ledger', true, 20),
  ('security_audit_view','View onboarding security metadata','Read IP / user agent / session metadata for onboarding events', true, 30)
) AS v(k,l,d,s,o)
WHERE m.key='onboarding'
  AND NOT EXISTS (SELECT 1 FROM public.sec_permissions p WHERE p.module_id=m.id AND p.key=v.k);

CREATE OR REPLACE FUNCTION public.onboarding_can_view_audit(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.sec_has_permission(_user_id, 'onboarding', 'audit_view')
  );
$$;

CREATE OR REPLACE FUNCTION public.onboarding_can_view_security_audit(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.sec_has_permission(_user_id, 'onboarding', 'security_audit_view')
    OR public.sec_has_permission(_user_id, 'security_management', 'view')
  );
$$;

CREATE SEQUENCE IF NOT EXISTS public.entity_identification_event_seq;

CREATE TABLE IF NOT EXISTS public.entity_identity_resolution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_reference text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  journey_id uuid,
  journey_type text,
  source_channel text NOT NULL DEFAULT 'PUBLIC_REGISTRATION',
  searched_legal_name text,
  normalized_legal_name text,
  identifier_type text,
  identifier_value_masked text,
  identifier_value_hash text,
  licence_number_masked text,
  regulator_id uuid,
  sector_id uuid,
  resolution_outcome text NOT NULL,
  matched_entity_id uuid,
  resolution_case_id uuid,
  candidate_entity_ids uuid[] NOT NULL DEFAULT '{}',
  candidate_count integer NOT NULL DEFAULT 0,
  highest_match_score numeric,
  match_basis text,
  resolver_provider text NOT NULL DEFAULT 'entity_resolve_identity',
  resolver_version text,
  request_correlation_id text,
  failure_reason text,
  follow_up_action text,
  follow_up_at timestamptz,
  retention_class text NOT NULL DEFAULT 'BUSINESS_ONBOARDING_AUDIT',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eire_user_idx ON public.entity_identity_resolution_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS eire_name_idx ON public.entity_identity_resolution_events (normalized_legal_name);
CREATE INDEX IF NOT EXISTS eire_outcome_idx ON public.entity_identity_resolution_events (resolution_outcome, occurred_at DESC);
CREATE INDEX IF NOT EXISTS eire_entity_idx ON public.entity_identity_resolution_events (matched_entity_id);

GRANT SELECT ON public.entity_identity_resolution_events TO authenticated;
GRANT ALL ON public.entity_identity_resolution_events TO service_role;
ALTER TABLE public.entity_identity_resolution_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eire_audit_read ON public.entity_identity_resolution_events;
CREATE POLICY eire_audit_read ON public.entity_identity_resolution_events FOR SELECT
  TO authenticated USING (public.onboarding_can_view_audit(auth.uid()));

CREATE SEQUENCE IF NOT EXISTS public.registration_journey_event_seq;

CREATE TABLE IF NOT EXISTS public.registration_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_reference text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  journey_type text,
  stage text NOT NULL,
  entity_id uuid,
  registration_id uuid,
  identification_event_id uuid REFERENCES public.entity_identity_resolution_events(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rje_user_idx ON public.registration_journey_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS rje_entity_idx ON public.registration_journey_events (entity_id, occurred_at DESC);

GRANT SELECT ON public.registration_journey_events TO authenticated;
GRANT ALL ON public.registration_journey_events TO service_role;
ALTER TABLE public.registration_journey_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rje_read ON public.registration_journey_events;
CREATE POLICY rje_read ON public.registration_journey_events FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.onboarding_can_view_audit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.onboarding_security_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identification_event_id uuid REFERENCES public.entity_identity_resolution_events(id) ON DELETE CASCADE,
  user_id uuid,
  source_ip inet,
  user_agent text,
  device_hint text,
  session_reference text,
  request_correlation_id text,
  captured_by text NOT NULL DEFAULT 'edge_gateway',
  retention_class text NOT NULL DEFAULT 'SECURITY_NETWORK_METADATA',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_security_metadata TO authenticated;
GRANT ALL ON public.onboarding_security_metadata TO service_role;
ALTER TABLE public.onboarding_security_metadata ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osm_elevated_read ON public.onboarding_security_metadata;
CREATE POLICY osm_elevated_read ON public.onboarding_security_metadata FOR SELECT
  TO authenticated USING (public.onboarding_can_view_security_audit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.onboarding_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  condition_type text NOT NULL,
  threshold_count integer,
  window_minutes integer,
  severity text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_alert_rules TO authenticated;
GRANT ALL ON public.onboarding_alert_rules TO service_role;
ALTER TABLE public.onboarding_alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oar_internal_read ON public.onboarding_alert_rules;
CREATE POLICY oar_internal_read ON public.onboarding_alert_rules FOR SELECT
  TO authenticated USING (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid()));

INSERT INTO public.onboarding_alert_rules (rule_key, label, description, condition_type, threshold_count, window_minutes, severity) VALUES
  ('MANY_SEARCHES_NEW_ACCOUNT','Many entity searches by one new account','A single recently created account performed an unusual number of entity identification attempts.','SEARCH_VOLUME_PER_USER',10,60,'medium'),
  ('MANY_ACCOUNTS_SAME_ENTITY','Many accounts searching the same entity','Several different accounts searched the same organisation in a short window.','DISTINCT_USERS_PER_NAME',5,1440,'high'),
  ('REPEATED_IDENTIFIER_FAILURE','Repeated failed identifier attempts','Repeated NO_MATCH or validation failures with supplied identifiers.','REPEATED_FAILURE',5,60,'medium'),
  ('REPEATED_POSSIBLE_MATCH','Repeated possible-match attempts','The same account repeatedly triggers possible-match resolution.','REPEATED_POSSIBLE_MATCH',3,1440,'medium'),
  ('PRIMARY_REPRESENTATIVE_REQUEST','High-privilege representative request','A request for PRIMARY_REPRESENTATIVE authority was made.','PRIMARY_REPRESENTATIVE_REQUEST',1,NULL,'high'),
  ('CONTRADICTORY_ENTITY_INFO','Search followed by contradictory entity information','Subsequent submitted entity information contradicts the matched entity.','CONTRADICTORY_INFORMATION',1,NULL,'high')
ON CONFLICT (rule_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.onboarding_alert_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  user_id uuid,
  identification_event_id uuid REFERENCES public.entity_identity_resolution_events(id) ON DELETE CASCADE,
  subject_name text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_alert_signals TO authenticated;
GRANT ALL ON public.onboarding_alert_signals TO service_role;
ALTER TABLE public.onboarding_alert_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oas_audit_read ON public.onboarding_alert_signals;
CREATE POLICY oas_audit_read ON public.onboarding_alert_signals FOR SELECT
  TO authenticated USING (public.onboarding_can_view_audit(auth.uid()));

CREATE TABLE IF NOT EXISTS public.registration_entity_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES public.registrations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  resolution_case_id uuid REFERENCES public.entity_resolution_cases(id) ON DELETE SET NULL,
  identification_event_id uuid REFERENCES public.entity_identity_resolution_events(id) ON DELETE SET NULL,
  binding_status text NOT NULL DEFAULT 'PENDING_RESOLUTION',
  bound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.registration_entity_bindings TO authenticated;
GRANT ALL ON public.registration_entity_bindings TO service_role;
ALTER TABLE public.registration_entity_bindings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reb_read ON public.registration_entity_bindings;
CREATE POLICY reb_read ON public.registration_entity_bindings FOR SELECT
  TO authenticated USING (
    public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.onboarding_ledger_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(current_setting('app.onboarding_ledger_writer', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Onboarding audit ledger is append-only and may only be written by governed onboarding operations'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Onboarding audit ledger rows cannot be deleted' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eire_guard ON public.entity_identity_resolution_events;
CREATE TRIGGER trg_eire_guard BEFORE UPDATE OR DELETE ON public.entity_identity_resolution_events
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_ledger_guard();
DROP TRIGGER IF EXISTS trg_rje_guard ON public.registration_journey_events;
CREATE TRIGGER trg_rje_guard BEFORE UPDATE OR DELETE ON public.registration_journey_events
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_ledger_guard();

CREATE OR REPLACE FUNCTION public.onboarding_mask_value(_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN length(btrim(_value)) <= 4 THEN repeat('*', greatest(length(btrim(_value)) - 1, 1)) || right(btrim(_value), 1)
    ELSE repeat('*', length(btrim(_value)) - 4) || right(btrim(_value), 4)
  END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_record_journey_event(
  _user_id uuid, _stage text, _journey_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL, _registration_id uuid DEFAULT NULL,
  _identification_event_id uuid DEFAULT NULL, _detail jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM set_config('app.onboarding_ledger_writer','on', true);
  INSERT INTO public.registration_journey_events
    (event_reference, user_id, journey_type, stage, entity_id, registration_id, identification_event_id, detail, actor_id)
  VALUES ('RJE-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.registration_journey_event_seq')::text, 6, '0'),
          _user_id, _journey_type, _stage, _entity_id, _registration_id, _identification_event_id,
          COALESCE(_detail,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.onboarding_evaluate_alert_rules(_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  e public.entity_identity_resolution_events;
  r public.onboarding_alert_rules;
  v_n integer;
BEGIN
  SELECT * INTO e FROM public.entity_identity_resolution_events WHERE id = _event_id;
  IF e.id IS NULL THEN RETURN; END IF;

  FOR r IN SELECT * FROM public.onboarding_alert_rules WHERE is_active LOOP
    v_n := NULL;
    IF r.condition_type = 'SEARCH_VOLUME_PER_USER' THEN
      SELECT count(*) INTO v_n FROM public.entity_identity_resolution_events
       WHERE user_id = e.user_id AND occurred_at > now() - make_interval(mins => r.window_minutes);
    ELSIF r.condition_type = 'DISTINCT_USERS_PER_NAME' THEN
      SELECT count(DISTINCT user_id) INTO v_n FROM public.entity_identity_resolution_events
       WHERE normalized_legal_name = e.normalized_legal_name
         AND occurred_at > now() - make_interval(mins => r.window_minutes);
    ELSIF r.condition_type = 'REPEATED_FAILURE' THEN
      SELECT count(*) INTO v_n FROM public.entity_identity_resolution_events
       WHERE user_id = e.user_id AND resolution_outcome IN ('NO_MATCH','VALIDATION_FAILURE','SYSTEM_ERROR','ERROR')
         AND occurred_at > now() - make_interval(mins => r.window_minutes);
    ELSIF r.condition_type = 'REPEATED_POSSIBLE_MATCH' THEN
      SELECT count(*) INTO v_n FROM public.entity_identity_resolution_events
       WHERE user_id = e.user_id AND resolution_outcome = 'POSSIBLE_MATCH'
         AND occurred_at > now() - make_interval(mins => r.window_minutes);
    END IF;

    IF v_n IS NOT NULL AND r.threshold_count IS NOT NULL AND v_n >= r.threshold_count THEN
      INSERT INTO public.onboarding_alert_signals (rule_key, severity, user_id, identification_event_id, subject_name, detail)
      VALUES (r.rule_key, r.severity, e.user_id, e.id, e.searched_legal_name,
              jsonb_build_object('observed', v_n, 'threshold', r.threshold_count, 'window_minutes', r.window_minutes));
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.onboarding_log_identification_event(
  _user_id uuid,
  _journey_type text,
  _source_channel text,
  _payload jsonb,
  _outcome text,
  _matched_entity_id uuid DEFAULT NULL,
  _resolution_case_id uuid DEFAULT NULL,
  _candidates jsonb DEFAULT '[]'::jsonb,
  _match_basis text DEFAULT NULL,
  _failure_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_id uuid;
  v_ids jsonb := COALESCE(_payload->'identifiers','[]'::jsonb);
  v_first jsonb := CASE WHEN jsonb_array_length(COALESCE(_payload->'identifiers','[]'::jsonb)) > 0 THEN (_payload->'identifiers')->0 ELSE NULL END;
  v_name text := btrim(COALESCE(_payload->>'legal_name',''));
  v_cand_ids uuid[] := '{}';
  v_top numeric;
  v_journey uuid;
  c jsonb;
BEGIN
  SELECT id INTO v_journey FROM public.onboarding_journey_state WHERE user_id = _user_id;

  FOR c IN SELECT jsonb_array_elements(COALESCE(_candidates,'[]'::jsonb)) LOOP
    IF NULLIF(c->>'entity_id','') IS NOT NULL THEN
      v_cand_ids := v_cand_ids || (c->>'entity_id')::uuid;
    END IF;
    v_top := GREATEST(COALESCE(v_top, 0), COALESCE((c->>'match_score')::numeric, 0));
  END LOOP;

  PERFORM set_config('app.onboarding_ledger_writer','on', true);
  INSERT INTO public.entity_identity_resolution_events (
    event_reference, user_id, journey_id, journey_type, source_channel,
    searched_legal_name, normalized_legal_name, identifier_type, identifier_value_masked,
    identifier_value_hash, licence_number_masked, regulator_id, sector_id,
    resolution_outcome, matched_entity_id, resolution_case_id, candidate_entity_ids,
    candidate_count, highest_match_score, match_basis, resolver_version,
    request_correlation_id, failure_reason
  ) VALUES (
    'EIA-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.entity_identification_event_seq')::text, 6, '0'),
    _user_id, v_journey, _journey_type, COALESCE(NULLIF(_source_channel,''),'PUBLIC_REGISTRATION'),
    NULLIF(v_name,''), NULLIF(upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g')),''),
    NULLIF(v_first->>'type',''), public.onboarding_mask_value(v_first->>'value'),
    CASE WHEN NULLIF(v_first->>'value','') IS NULL THEN NULL
         ELSE encode(extensions.digest(upper(regexp_replace(v_first->>'value','[^A-Za-z0-9]','','g')),'sha256'),'hex') END,
    public.onboarding_mask_value(_payload->>'license_number'),
    NULLIF(_payload->>'regulator_id','')::uuid, NULLIF(_payload->>'sector_id','')::uuid,
    _outcome, _matched_entity_id, _resolution_case_id, v_cand_ids,
    COALESCE(jsonb_array_length(COALESCE(_candidates,'[]'::jsonb)),0), v_top, _match_basis, '1.0',
    NULLIF(_payload->>'correlation_id',''), _failure_reason
  ) RETURNING id INTO v_id;

  PERFORM public.onboarding_record_journey_event(
    _user_id, 'ENTITY_SEARCHED', _journey_type, _matched_entity_id, NULL, v_id,
    jsonb_build_object('outcome', _outcome, 'match_basis', _match_basis));

  IF _outcome = 'EXACT_MATCH' THEN
    PERFORM public.onboarding_record_journey_event(_user_id, 'ENTITY_MATCHED', _journey_type, _matched_entity_id, NULL, v_id, jsonb_build_object('match_basis', _match_basis));
  ELSIF _outcome = 'POSSIBLE_MATCH' THEN
    PERFORM public.onboarding_record_journey_event(_user_id, 'ENTITY_RESOLUTION_REQUIRED', _journey_type, NULL, NULL, v_id, jsonb_build_object('resolution_case_id', _resolution_case_id));
  END IF;

  PERFORM public.onboarding_evaluate_alert_rules(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.onboarding_record_follow_up(
  _action text, _detail jsonb DEFAULT '{}'::jsonb, _event_id uuid DEFAULT NULL, _user_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := COALESCE(_user_id, auth.uid()); v_event uuid := _event_id; v_journey text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF _action IS NULL OR btrim(_action) = '' THEN RETURN NULL; END IF;

  IF v_event IS NULL THEN
    SELECT id INTO v_event FROM public.entity_identity_resolution_events
     WHERE user_id = v_uid ORDER BY occurred_at DESC LIMIT 1;
  END IF;

  SELECT journey_type INTO v_journey FROM public.entity_identity_resolution_events WHERE id = v_event;

  IF v_event IS NOT NULL THEN
    PERFORM set_config('app.onboarding_ledger_writer','on', true);
    UPDATE public.entity_identity_resolution_events
       SET follow_up_action = _action, follow_up_at = now()
     WHERE id = v_event AND follow_up_action IS DISTINCT FROM _action;
  END IF;

  RETURN public.onboarding_record_journey_event(v_uid, _action, v_journey, NULL, NULL, v_event, COALESCE(_detail,'{}'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.onboarding_log_identification_event(uuid,text,text,jsonb,text,uuid,uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboarding_record_journey_event(uuid,text,text,uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboarding_evaluate_alert_rules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboarding_record_follow_up(text,jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_can_view_audit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_can_view_security_audit(uuid) TO authenticated;