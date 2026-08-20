-- Wave A — Part 3: Entity Registry Gateway runtime, resolution engine, merge
ALTER TABLE public.licensees
  ADD COLUMN IF NOT EXISTS merged_into_entity_id uuid REFERENCES public.licensees(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.entity_resolution_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'OPEN',
  outcome text,
  subject_name text NOT NULL,
  subject_identifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_status text NOT NULL DEFAULT 'LOCAL_ONLY',
  authority_mode text NOT NULL DEFAULT 'LOCAL_AUTHORITATIVE',
  resolution_policy_id uuid REFERENCES public.entity_resolution_policies(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  resolved_entity_id uuid REFERENCES public.licensees(id) ON DELETE RESTRICT,
  decision_notes text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  escalated_by uuid,
  escalated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erc_status_chk CHECK (status IN ('OPEN','EVIDENCE_REQUESTED','ESCALATED','RESOLVED','CLOSED')),
  CONSTRAINT erc_outcome_chk CHECK (outcome IS NULL OR outcome IN
    ('EXACT_MATCH','POSSIBLE_MATCH','NO_MATCH','PROVIDER_UNAVAILABLE','RESOLVED_EXISTING','CONFIRMED_NEW','MERGED'))
);

CREATE TABLE IF NOT EXISTS public.entity_match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.entity_resolution_cases(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE RESTRICT,
  external_entity_id text,
  match_score numeric(5,2) NOT NULL DEFAULT 0,
  match_basis text NOT NULL,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emc_case_idx ON public.entity_match_candidates (case_id, match_score DESC);

CREATE TABLE IF NOT EXISTS public.entity_resolution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.entity_resolution_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ere_case_idx ON public.entity_resolution_events (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.entity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  absorbed_entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.entity_resolution_cases(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PREVIEWED',
  reason text NOT NULL,
  impact_preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT em_distinct_chk CHECK (survivor_entity_id <> absorbed_entity_id),
  CONSTRAINT em_status_chk CHECK (status IN ('PREVIEWED','APPROVED','COMPLETED','CANCELLED'))
);

GRANT SELECT ON public.entity_resolution_cases TO authenticated;
GRANT SELECT ON public.entity_match_candidates TO authenticated;
GRANT SELECT ON public.entity_resolution_events TO authenticated;
GRANT SELECT ON public.entity_merges TO authenticated;
GRANT ALL ON public.entity_resolution_cases TO service_role;
GRANT ALL ON public.entity_match_candidates TO service_role;
GRANT ALL ON public.entity_resolution_events TO service_role;
GRANT ALL ON public.entity_merges TO service_role;

ALTER TABLE public.entity_resolution_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_resolution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erc_read ON public.entity_resolution_cases;
CREATE POLICY erc_read ON public.entity_resolution_cases FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'entity_resolution', 'view'));
DROP POLICY IF EXISTS emc_read ON public.entity_match_candidates;
CREATE POLICY emc_read ON public.entity_match_candidates FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'entity_resolution', 'view'));
DROP POLICY IF EXISTS ere_read ON public.entity_resolution_events;
CREATE POLICY ere_read ON public.entity_resolution_events FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'entity_resolution', 'view'));
DROP POLICY IF EXISTS em_read ON public.entity_merges;
CREATE POLICY em_read ON public.entity_merges FOR SELECT TO authenticated
  USING (public.sec_has_permission(auth.uid(), 'entity_resolution', 'view'));

CREATE OR REPLACE FUNCTION public.entity_resolution_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS erc_touch ON public.entity_resolution_cases;
CREATE TRIGGER erc_touch BEFORE UPDATE ON public.entity_resolution_cases
  FOR EACH ROW EXECUTE FUNCTION public.entity_resolution_touch();

-- ---------------------------------------------------------------
-- Local registry provider (canonical DTO projection)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_registry_entity_dto(_entity_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'source', 'LOCAL',
    'entity_id', l.id,
    'legal_name', COALESCE(o.legal_name, l.name),
    'display_name', COALESCE(o.display_name, l.name),
    'lifecycle', ls.key,
    'lifecycle_label', ls.label,
    'identity_status', ist.key,
    'identity_status_label', ist.label,
    'merged_into_entity_id', l.merged_into_entity_id,
    'sector_id', l.sector_id,
    'assigned_supervisor_id', l.assigned_supervisor_id,
    'identifiers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', t.key, 'label', t.label, 'value', ei.identifier_value,
        'normalized_value', ei.normalized_value,
        'verification_status', ei.verification_status,
        'is_primary', ei.is_primary) ORDER BY t.sort_order)
      FROM public.entity_identifiers ei
      JOIN public.entity_identifier_types t ON t.id = ei.identifier_type_id
      WHERE ei.entity_id = l.id AND (ei.effective_to IS NULL OR ei.effective_to > now())
    ), '[]'::jsonb),
    'licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'license_id', lic.id, 'license_number', lic.license_number,
        'license_type', lic.license_type, 'status', lic.status,
        'valid_until', lic.valid_until, 'is_primary', el.is_primary,
        'effective_from', el.effective_from) ORDER BY el.effective_from DESC)
      FROM public.entity_licenses el
      JOIN public.licenses lic ON lic.id = el.license_id
      WHERE el.entity_id = l.id
    ), '[]'::jsonb),
    'external_references', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'external_entity_id', x.external_entity_id,
        'verification_status', x.verification_status,
        'is_authoritative', x.is_authoritative,
        'last_verified_at', x.last_verified_at))
      FROM public.entity_external_references x
      WHERE x.entity_id = l.id AND (x.effective_to IS NULL OR x.effective_to > now())
    ), '[]'::jsonb)
  )
  FROM public.licensees l
  LEFT JOIN public.organizations o ON o.party_id = l.party_id
  LEFT JOIN public.lifecycle_stages ls ON ls.id = l.lifecycle_stage_id
  LEFT JOIN public.entity_identity_statuses ist ON ist.id = l.identity_status_id
  WHERE l.id = _entity_id;
$$;

CREATE OR REPLACE FUNCTION public.entity_registry_search(_criteria jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := btrim(COALESCE(_criteria->>'query',''));
  qn text := upper(regexp_replace(q, '[^A-Za-z0-9]', '', 'g'));
  lim int := LEAST(COALESCE((_criteria->>'limit')::int, 50), 200);
  ids uuid[];
BEGIN
  IF NOT public.sec_has_permission(auth.uid(), 'licensee_management', 'view')
     AND NOT public.sec_has_permission(auth.uid(), 'entity_resolution', 'view') THEN
    RAISE EXCEPTION 'licensee_management.view or entity_resolution.view required' USING ERRCODE='42501';
  END IF;

  SELECT array_agg(id) INTO ids FROM (
    SELECT l.id
    FROM public.licensees l
    LEFT JOIN public.organizations o ON o.party_id = l.party_id
    WHERE q = ''
       OR l.name ILIKE '%'||q||'%'
       OR o.legal_name ILIKE '%'||q||'%'
       OR EXISTS (
         SELECT 1 FROM public.entity_identifiers ei
         WHERE ei.entity_id = l.id AND (qn <> '' AND ei.normalized_value = qn)
       )
       OR EXISTS (
         SELECT 1 FROM public.entity_licenses el
         JOIN public.licenses lic ON lic.id = el.license_id
         WHERE el.entity_id = l.id AND qn <> ''
           AND upper(regexp_replace(lic.license_number, '[^A-Za-z0-9]', '', 'g')) = qn
       )
    ORDER BY l.name
    LIMIT lim
  ) s;

  RETURN COALESCE((
    SELECT jsonb_agg(public.entity_registry_entity_dto(x)) FROM unnest(COALESCE(ids,'{}'::uuid[])) x
  ), '[]'::jsonb);
END $$;

-- ---------------------------------------------------------------
-- Resolution engine
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_resolve_identity(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_name text := btrim(COALESCE(_payload->>'legal_name',''));
  v_name_norm text := upper(regexp_replace(COALESCE(_payload->>'legal_name',''), '[^A-Za-z0-9]', '', 'g'));
  v_ids jsonb := COALESCE(_payload->'identifiers', '[]'::jsonb);
  v_licence text := upper(regexp_replace(COALESCE(_payload->>'license_number',''), '[^A-Za-z0-9]', '', 'g'));
  v_app uuid := NULLIF(_payload->>'application_id','')::uuid;
  rec jsonb;
  v_type uuid;
  v_norm text;
  v_entity uuid;
  v_case uuid;
  v_case_no text;
  v_policy uuid;
  v_outcome text := 'NO_MATCH';
  cand RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_exact_basis text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'legal_name is required' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_policy FROM public.entity_resolution_policies WHERE is_default AND is_active LIMIT 1;

  -- 1. Authoritative identifier match (canonical normalization service)
  FOR rec IN SELECT jsonb_array_elements(v_ids) LOOP
    SELECT id INTO v_type FROM public.entity_identifier_types
      WHERE key = rec->>'type' AND is_active;
    CONTINUE WHEN v_type IS NULL;
    v_norm := public.normalize_entity_identifier(v_type, rec->>'value');
    CONTINUE WHEN COALESCE(v_norm,'') = '';
    SELECT ei.entity_id INTO v_entity
      FROM public.entity_identifiers ei
     WHERE ei.identifier_type_id = v_type AND ei.normalized_value = v_norm
       AND (ei.effective_to IS NULL OR ei.effective_to > now())
     LIMIT 1;
    IF v_entity IS NOT NULL THEN
      v_outcome := 'EXACT_MATCH';
      v_exact_basis := 'identifier:' || (rec->>'type');
      EXIT;
    END IF;
  END LOOP;

  -- 2. Licence number is only a LOOKUP SIGNAL, resolved through entity_licenses
  IF v_entity IS NULL AND v_licence <> '' THEN
    SELECT el.entity_id INTO v_entity
      FROM public.entity_licenses el
      JOIN public.licenses lic ON lic.id = el.license_id
     WHERE upper(regexp_replace(lic.license_number, '[^A-Za-z0-9]', '', 'g')) = v_licence
     LIMIT 1;
    IF v_entity IS NOT NULL THEN
      v_outcome := 'EXACT_MATCH';
      v_exact_basis := 'licence_lookup';
    END IF;
  END IF;

  IF v_entity IS NOT NULL THEN
    -- Follow merge lineage to the survivor entity
    WHILE (SELECT merged_into_entity_id FROM public.licensees WHERE id = v_entity) IS NOT NULL LOOP
      SELECT merged_into_entity_id INTO v_entity FROM public.licensees WHERE id = v_entity;
    END LOOP;
    RETURN jsonb_build_object(
      'outcome', 'EXACT_MATCH', 'entity_id', v_entity, 'match_basis', v_exact_basis,
      'entity', public.entity_registry_entity_dto(v_entity), 'case_id', NULL,
      'candidates', '[]'::jsonb);
  END IF;

  -- 3. Candidate signals (names are never deterministic identity)
  v_case_no := 'ERC-' || to_char(now(), 'YYYYMMDD') || '-' ||
               lpad(((extract(epoch from clock_timestamp())::bigint) % 100000)::text, 5, '0');

  FOR cand IN
    SELECT l.id,
           CASE
             WHEN upper(regexp_replace(COALESCE(o.legal_name, l.name), '[^A-Za-z0-9]', '', 'g')) = v_name_norm THEN 80
             WHEN upper(regexp_replace(COALESCE(o.legal_name, l.name), '[^A-Za-z0-9]', '', 'g')) LIKE '%'||v_name_norm||'%'
               OR v_name_norm LIKE '%'||upper(regexp_replace(COALESCE(o.legal_name, l.name), '[^A-Za-z0-9]', '', 'g'))||'%' THEN 55
             ELSE 0
           END AS score,
           COALESCE(o.legal_name, l.name) AS legal_name
    FROM public.licensees l
    LEFT JOIN public.organizations o ON o.party_id = l.party_id
    WHERE l.merged_into_entity_id IS NULL AND v_name_norm <> ''
    ORDER BY 2 DESC
    LIMIT 10
  LOOP
    CONTINUE WHEN cand.score = 0;
    IF v_case IS NULL THEN
      INSERT INTO public.entity_resolution_cases
        (case_number, status, outcome, subject_name, subject_identifiers, subject_payload,
         resolution_policy_id, application_id, requested_by)
      VALUES (v_case_no, 'OPEN', 'POSSIBLE_MATCH', v_name, v_ids, _payload, v_policy, v_app, uid)
      RETURNING id INTO v_case;
      v_outcome := 'POSSIBLE_MATCH';
    END IF;
    INSERT INTO public.entity_match_candidates (case_id, entity_id, match_score, match_basis, signals)
    VALUES (v_case, cand.id, cand.score, 'name_similarity',
            jsonb_build_object('candidate_legal_name', cand.legal_name, 'subject_legal_name', v_name));
    v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
      'entity_id', cand.id, 'legal_name', cand.legal_name,
      'match_score', cand.score, 'match_basis', 'name_similarity'));
  END LOOP;

  IF v_case IS NOT NULL THEN
    INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
    VALUES (v_case, 'entity.resolution.requested', uid, jsonb_build_object('outcome','POSSIBLE_MATCH'));
    PERFORM public.create_audit_log(uid, 'entity.resolution.requested', 'entity_resolution_case', v_case::text,
      NULL, jsonb_build_object('subject_name', v_name, 'outcome','POSSIBLE_MATCH'), '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome, 'entity_id', NULL, 'case_id', v_case,
    'case_number', CASE WHEN v_case IS NULL THEN NULL ELSE v_case_no END,
    'candidates', v_candidates);
END $$;

-- Create a new local regulatory entity identity (no licence attached)
CREATE OR REPLACE FUNCTION public.entity_create_local(
  _legal_name text,
  _identifiers jsonb DEFAULT '[]'::jsonb,
  _sector_id uuid DEFAULT NULL,
  _lifecycle_key text DEFAULT 'applicant',
  _identity_status_key text DEFAULT 'provisional',
  _case_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_party uuid; v_entity uuid; v_life uuid; v_ident uuid; v_type uuid; rec jsonb; v_norm text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF btrim(COALESCE(_legal_name,'')) = '' THEN RAISE EXCEPTION 'legal_name is required' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_life FROM public.lifecycle_stages WHERE key = _lifecycle_key;
  SELECT id INTO v_ident FROM public.entity_identity_statuses WHERE key = _identity_status_key;

  INSERT INTO public.parties (party_kind, display_name) VALUES ('organization', _legal_name)
  RETURNING id INTO v_party;
  INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
  VALUES (v_party, _legal_name, _legal_name, 'APPLICANT_DECLARED');

  INSERT INTO public.licensees (name, sector_id, status, party_id, lifecycle_stage_id, identity_status_id, applicant_id)
  VALUES (_legal_name, _sector_id, 'active', v_party, v_life, v_ident, uid)
  RETURNING id INTO v_entity;

  FOR rec IN SELECT jsonb_array_elements(COALESCE(_identifiers,'[]'::jsonb)) LOOP
    SELECT id INTO v_type FROM public.entity_identifier_types WHERE key = rec->>'type' AND is_active;
    CONTINUE WHEN v_type IS NULL;
    v_norm := public.normalize_entity_identifier(v_type, rec->>'value');
    CONTINUE WHEN COALESCE(v_norm,'') = '';
    INSERT INTO public.entity_identifiers
      (entity_id, identifier_type_id, identifier_value, normalized_value, uniqueness_scope,
       is_primary, verification_status, source_type, effective_from)
    SELECT v_entity, v_type, rec->>'value', v_norm, t.uniqueness_scope, false, 'unverified', 'APPLICANT_DECLARED', now()
    FROM public.entity_identifier_types t WHERE t.id = v_type
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF _case_id IS NOT NULL THEN
    INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
    VALUES (_case_id, 'entity.created', uid, jsonb_build_object('entity_id', v_entity));
  END IF;

  PERFORM public.create_audit_log(uid, 'entity.created', 'entity', v_entity::text,
    NULL, jsonb_build_object('legal_name', _legal_name, 'lifecycle', _lifecycle_key,
                             'identity_status', _identity_status_key), '{}'::jsonb);
  RETURN v_entity;
END $$;

-- Decide a resolution case
CREATE OR REPLACE FUNCTION public.entity_resolution_decide(
  _case_id uuid,
  _action text,
  _entity_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  c public.entity_resolution_cases;
  v_entity uuid;
BEGIN
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = _case_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Case not found' USING ERRCODE='22023'; END IF;
  IF c.status = 'RESOLVED' THEN RAISE EXCEPTION 'Case already resolved' USING ERRCODE='22023'; END IF;

  IF _action = 'RESOLVE_EXISTING' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','resolve') THEN
      RAISE EXCEPTION 'entity_resolution.resolve required' USING ERRCODE='42501'; END IF;
    IF _entity_id IS NULL THEN RAISE EXCEPTION 'entity_id required' USING ERRCODE='22023'; END IF;
    UPDATE public.entity_match_candidates SET is_selected = (entity_id = _entity_id) WHERE case_id = _case_id;
    UPDATE public.entity_resolution_cases
       SET status='RESOLVED', outcome='RESOLVED_EXISTING', resolved_entity_id=_entity_id,
           resolved_by=uid, resolved_at=now(), decision_notes=_notes
     WHERE id=_case_id;
    v_entity := _entity_id;

  ELSIF _action = 'CONFIRM_NEW' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','resolve') THEN
      RAISE EXCEPTION 'entity_resolution.resolve required' USING ERRCODE='42501'; END IF;
    v_entity := public.entity_create_local(
      c.subject_name, c.subject_identifiers,
      NULLIF(c.subject_payload->>'sector_id','')::uuid,
      'applicant', 'provisional', _case_id);
    UPDATE public.entity_resolution_cases
       SET status='RESOLVED', outcome='CONFIRMED_NEW', resolved_entity_id=v_entity,
           resolved_by=uid, resolved_at=now(), decision_notes=_notes
     WHERE id=_case_id;

  ELSIF _action = 'REQUEST_EVIDENCE' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','verify') THEN
      RAISE EXCEPTION 'entity_resolution.verify required' USING ERRCODE='42501'; END IF;
    UPDATE public.entity_resolution_cases SET status='EVIDENCE_REQUESTED', decision_notes=_notes WHERE id=_case_id;

  ELSIF _action = 'ESCALATE' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','escalate') THEN
      RAISE EXCEPTION 'entity_resolution.escalate required' USING ERRCODE='42501'; END IF;
    UPDATE public.entity_resolution_cases
       SET status='ESCALATED', escalated_by=uid, escalated_at=now(), decision_notes=_notes WHERE id=_case_id;

  ELSIF _action = 'APPROVE' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','approve') THEN
      RAISE EXCEPTION 'entity_resolution.approve required' USING ERRCODE='42501'; END IF;
    UPDATE public.entity_resolution_cases
       SET approved_by=uid, approved_at=now(), decision_notes=COALESCE(_notes, decision_notes) WHERE id=_case_id;

  ELSE
    RAISE EXCEPTION 'Unsupported action %', _action USING ERRCODE='22023';
  END IF;

  INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
  VALUES (_case_id,
          CASE _action
            WHEN 'ESCALATE' THEN 'entity.resolution.escalated'
            WHEN 'APPROVE' THEN 'entity.resolution.approved'
            ELSE 'entity.resolution.resolved' END,
          uid, jsonb_build_object('action', _action, 'entity_id', v_entity, 'notes', _notes));

  PERFORM public.create_audit_log(uid,
    CASE _action WHEN 'ESCALATE' THEN 'entity.resolution.escalated'
                 WHEN 'APPROVE' THEN 'entity.resolution.approved'
                 ELSE 'entity.resolution.resolved' END,
    'entity_resolution_case', _case_id::text, NULL,
    jsonb_build_object('action', _action, 'entity_id', v_entity), '{}'::jsonb);

  RETURN jsonb_build_object('case_id', _case_id, 'entity_id', v_entity, 'action', _action);
END $$;

-- ---------------------------------------------------------------
-- Controlled merge
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_merge_preview(_survivor_entity_id uuid, _absorbed_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.sec_has_permission(uid,'entity_resolution','view') THEN
    RAISE EXCEPTION 'entity_resolution.view required' USING ERRCODE='42501'; END IF;
  IF _survivor_entity_id = _absorbed_entity_id THEN
    RAISE EXCEPTION 'Survivor and absorbed entity must differ' USING ERRCODE='22023'; END IF;

  RETURN jsonb_build_object(
    'survivor', public.entity_registry_entity_dto(_survivor_entity_id),
    'absorbed', public.entity_registry_entity_dto(_absorbed_entity_id),
    'impact', jsonb_build_object(
      'licences', (SELECT count(*) FROM public.entity_licenses WHERE entity_id = _absorbed_entity_id),
      'identifiers', (SELECT count(*) FROM public.entity_identifiers WHERE entity_id = _absorbed_entity_id),
      'external_references', (SELECT count(*) FROM public.entity_external_references WHERE entity_id = _absorbed_entity_id),
      'applications', (SELECT count(*) FROM public.applications WHERE entity_id = _absorbed_entity_id),
      'memberships', (SELECT count(*) FROM public.entity_user_memberships WHERE entity_id = _absorbed_entity_id)
    ));
END $$;

CREATE OR REPLACE FUNCTION public.entity_merge_execute(
  _survivor_entity_id uuid,
  _absorbed_entity_id uuid,
  _reason text,
  _case_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_merge uuid;
  v_before jsonb;
  v_preview jsonb;
  v_merged_status uuid;
BEGIN
  IF NOT public.sec_has_permission(uid,'entity_resolution','merge') THEN
    RAISE EXCEPTION 'entity_resolution.merge required' USING ERRCODE='42501'; END IF;
  IF btrim(COALESCE(_reason,'')) = '' THEN
    RAISE EXCEPTION 'A merge reason is required' USING ERRCODE='22023'; END IF;
  IF _survivor_entity_id = _absorbed_entity_id THEN
    RAISE EXCEPTION 'Survivor and absorbed entity must differ' USING ERRCODE='22023'; END IF;
  IF (SELECT merged_into_entity_id FROM public.licensees WHERE id = _absorbed_entity_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Absorbed entity is already merged' USING ERRCODE='22023'; END IF;

  v_preview := public.entity_merge_preview(_survivor_entity_id, _absorbed_entity_id);
  v_before := jsonb_build_object(
    'survivor', public.entity_registry_entity_dto(_survivor_entity_id),
    'absorbed', public.entity_registry_entity_dto(_absorbed_entity_id));

  INSERT INTO public.entity_merges
    (survivor_entity_id, absorbed_entity_id, case_id, status, reason, impact_preview,
     before_snapshot, requested_by, approved_by, approved_at)
  VALUES (_survivor_entity_id, _absorbed_entity_id, _case_id, 'APPROVED', _reason, v_preview,
          v_before, uid, uid, now())
  RETURNING id INTO v_merge;

  PERFORM public.create_audit_log(uid, 'entity.merge.approved', 'entity_merge', v_merge::text,
    NULL, jsonb_build_object('survivor', _survivor_entity_id, 'absorbed', _absorbed_entity_id,
                             'reason', _reason), '{}'::jsonb);

  -- Repoint approved child lineage. Nothing is deleted.
  UPDATE public.entity_licenses SET entity_id = _survivor_entity_id, updated_at = now()
   WHERE entity_id = _absorbed_entity_id;
  UPDATE public.entity_identifiers SET entity_id = _survivor_entity_id, updated_at = now()
   WHERE entity_id = _absorbed_entity_id
     AND NOT EXISTS (
       SELECT 1 FROM public.entity_identifiers s
       WHERE s.entity_id = _survivor_entity_id
         AND s.identifier_type_id = public.entity_identifiers.identifier_type_id
         AND s.normalized_value = public.entity_identifiers.normalized_value);
  UPDATE public.entity_external_references SET entity_id = _survivor_entity_id, updated_at = now()
   WHERE entity_id = _absorbed_entity_id;
  UPDATE public.applications SET entity_id = _survivor_entity_id, updated_at = now()
   WHERE entity_id = _absorbed_entity_id;
  UPDATE public.entity_user_memberships SET entity_id = _survivor_entity_id
   WHERE entity_id = _absorbed_entity_id
     AND NOT EXISTS (
       SELECT 1 FROM public.entity_user_memberships s
       WHERE s.entity_id = _survivor_entity_id
         AND s.user_id = public.entity_user_memberships.user_id
         AND s.membership_role_id = public.entity_user_memberships.membership_role_id
         AND s.status IN ('REQUESTED','PENDING_VERIFICATION','APPROVED'));

  SELECT id INTO v_merged_status FROM public.entity_identity_statuses WHERE key = 'merged';
  UPDATE public.licensees
     SET merged_into_entity_id = _survivor_entity_id,
         identity_status_id = COALESCE(v_merged_status, identity_status_id),
         updated_at = now()
   WHERE id = _absorbed_entity_id;

  UPDATE public.entity_merges
     SET status='COMPLETED', completed_at = now(),
         after_snapshot = jsonb_build_object(
           'survivor', public.entity_registry_entity_dto(_survivor_entity_id),
           'absorbed', public.entity_registry_entity_dto(_absorbed_entity_id))
   WHERE id = v_merge;

  IF _case_id IS NOT NULL THEN
    UPDATE public.entity_resolution_cases
       SET status='RESOLVED', outcome='MERGED', resolved_entity_id=_survivor_entity_id,
           resolved_by=uid, resolved_at=now()
     WHERE id=_case_id;
    INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
    VALUES (_case_id, 'entity.merge.completed', uid,
            jsonb_build_object('merge_id', v_merge, 'survivor', _survivor_entity_id));
  END IF;

  PERFORM public.create_audit_log(uid, 'entity.merge.completed', 'entity_merge', v_merge::text,
    v_before, jsonb_build_object('survivor', _survivor_entity_id, 'absorbed', _absorbed_entity_id), '{}'::jsonb);

  RETURN v_merge;
END $$;

-- Attach an issued licence to an entity (licence issuance cutover helper)
CREATE OR REPLACE FUNCTION public.entity_attach_license(
  _entity_id uuid, _license_id uuid, _is_primary boolean DEFAULT false, _source text DEFAULT 'LICENCE_ISSUANCE'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_id uuid;
BEGIN
  INSERT INTO public.entity_licenses (entity_id, license_id, effective_from, is_primary, source)
  VALUES (_entity_id, _license_id, now(), _is_primary, _source)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.entity_licenses WHERE entity_id=_entity_id AND license_id=_license_id LIMIT 1;
  ELSE
    PERFORM public.create_audit_log(uid, 'license.attached_to_entity', 'entity_license', v_id::text,
      NULL, jsonb_build_object('entity_id', _entity_id, 'license_id', _license_id), '{}'::jsonb);
  END IF;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.entity_registry_search(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_registry_entity_dto(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_resolve_identity(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_create_local(text, jsonb, uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_resolution_decide(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_merge_preview(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_merge_execute(uuid, uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entity_attach_license(uuid, uuid, boolean, text) FROM anon;