-- F8A-B3: canonical person identity linkage, appointment/F&P bridge, person network
-- Canonical natural-person identity remains parties(party_kind='PERSON') + persons.
-- fp_individuals stays an F&P CONTEXT record; fp_individual_party_links stays the
-- single canonical bridge. No second person master is introduced.

------------------------------------------------------------------ 1. link table
ALTER TABLE public.fp_individual_party_links
  ADD COLUMN IF NOT EXISTS match_category text,
  ADD COLUMN IF NOT EXISTS match_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS link_reason text;

ALTER TABLE public.fp_individual_party_links
  DROP CONSTRAINT IF EXISTS fp_individual_party_links_match_method_check;
ALTER TABLE public.fp_individual_party_links
  ADD CONSTRAINT fp_individual_party_links_match_method_check
  CHECK (match_method = ANY (ARRAY['NATIONAL_ID','PASSPORT','USER_ACCOUNT','APPOINTMENT_BRIDGE','MANUAL']));

ALTER TABLE public.fp_individual_party_links
  DROP CONSTRAINT IF EXISTS fp_individual_party_links_match_category_check;
ALTER TABLE public.fp_individual_party_links
  ADD CONSTRAINT fp_individual_party_links_match_category_check
  CHECK (match_category IS NULL OR match_category = ANY (ARRAY[
    'EXACT_STRONG_IDENTIFIER','EXACT_COMPOSITE','MANUAL_CONFIRMED']));

-- identity links are never written from the browser: governed RPCs only
REVOKE INSERT, UPDATE, DELETE ON public.fp_individual_party_links FROM authenticated;
REVOKE ALL ON public.fp_individual_party_links FROM anon;
GRANT SELECT ON public.fp_individual_party_links TO authenticated;
GRANT ALL ON public.fp_individual_party_links TO service_role;

CREATE OR REPLACE FUNCTION public.fp_person_link_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_conflict uuid;
BEGIN
  -- only a canonical natural person may be the link target
  IF NOT EXISTS (
    SELECT 1 FROM public.parties p
     WHERE p.id = NEW.person_party_id AND p.party_kind = 'PERSON'
  ) OR NOT EXISTS (SELECT 1 FROM public.persons pe WHERE pe.party_id = NEW.person_party_id) THEN
    RAISE EXCEPTION 'PERSON_PARTY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- one F&P record may never resolve to two conflicting canonical people
  IF TG_OP = 'UPDATE' AND NEW.person_party_id <> OLD.person_party_id THEN
    RAISE EXCEPTION 'CONFLICTING_PERSON_LINK' USING ERRCODE = '22023';
  END IF;

  SELECT a.person_party_id INTO v_conflict
    FROM public.entity_appointments a
   WHERE a.fp_individual_id = NEW.fp_individual_id
     AND a.person_party_id <> NEW.person_party_id
   LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_PERSON_CONFLICT' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_person_link_guard ON public.fp_individual_party_links;
CREATE TRIGGER trg_fp_person_link_guard
BEFORE INSERT OR UPDATE ON public.fp_individual_party_links
FOR EACH ROW EXECUTE FUNCTION public.fp_person_link_guard();

--------------------------------------------------- 2. deterministic candidates
-- Deterministic evidence available in the CURRENT schema. There is no canonical
-- person identifier store (entity_identifiers is entity-scoped), so national id /
-- passport / e-mail values held on fp_individuals have no canonical counterpart to
-- match against and are deliberately NOT used. The only governed, provenance-backed
-- evidence is a recorded appointment that already pairs an F&P record with a
-- canonical person. Name similarity, fuzzy scoring, address, phone and AI
-- suggestions are prohibited and are not consulted anywhere below.
CREATE OR REPLACE FUNCTION public.fp_person_link_candidates(_fp_individual_id uuid)
RETURNS TABLE(person_party_id uuid, evidence_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT a.person_party_id, 'APPOINTMENT_BRIDGE'::text
    FROM public.entity_appointments a
    JOIN public.persons pe ON pe.party_id = a.person_party_id
   WHERE a.fp_individual_id = _fp_individual_id
$$;
REVOKE ALL ON FUNCTION public.fp_person_link_candidates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_person_link_candidates(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_person_link_candidates(uuid) TO authenticated;

-- Internal helper: links ONLY when exactly one candidate exists. Never guesses.
CREATE OR REPLACE FUNCTION public.fp_try_link_individual(_fp_individual_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int; v_party uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fp_individual_party_links WHERE fp_individual_id = _fp_individual_id) THEN
    RETURN 'ALREADY_LINKED';
  END IF;
  SELECT count(*), min(person_party_id) INTO v_count, v_party
    FROM public.fp_person_link_candidates(_fp_individual_id);
  IF v_count = 0 THEN RETURN 'NO_CANDIDATE'; END IF;
  IF v_count > 1 THEN RETURN 'AMBIGUOUS_CANDIDATES'; END IF;
  INSERT INTO public.fp_individual_party_links
    (fp_individual_id, person_party_id, match_method, match_confidence, match_category, match_evidence, linked_by)
  VALUES (_fp_individual_id, v_party, 'APPOINTMENT_BRIDGE', 'DETERMINISTIC', 'EXACT_COMPOSITE',
          jsonb_build_object('evidence','APPOINTMENT_BRIDGE','candidates',1), auth.uid())
  ON CONFLICT (fp_individual_id) DO NOTHING;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'fp.person_identity.linked_deterministic', 'fp_individual',
          _fp_individual_id::text,
          jsonb_build_object('person_party_id', v_party, 'match_method','APPOINTMENT_BRIDGE',
                             'match_category','EXACT_COMPOSITE'));
  RETURN 'LINKED';
END $$;
REVOKE ALL ON FUNCTION public.fp_try_link_individual(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_try_link_individual(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fp_try_link_individual(uuid) FROM authenticated;

-- Repaired deterministic sweep. The previous implementation joined a column that
-- does not exist (entity_identifiers.party_id) and picked an arbitrary candidate
-- with LIMIT 1; both defects are removed.
CREATE OR REPLACE FUNCTION public.fp_link_persons_deterministic()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_fp uuid; v_res text;
        v_linked int := 0; v_amb int := 0; v_none int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'fit_and_proper','edit')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  FOR v_fp IN
    SELECT f.id FROM public.fp_individuals f
     WHERE NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links l WHERE l.fp_individual_id = f.id)
  LOOP
    v_res := public.fp_try_link_individual(v_fp);
    IF v_res = 'LINKED' THEN v_linked := v_linked + 1;
    ELSIF v_res = 'AMBIGUOUS_CANDIDATES' THEN v_amb := v_amb + 1;
    ELSE v_none := v_none + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('linked', v_linked, 'ambiguous', v_amb,
                            'no_candidate', v_none, 'unresolved', v_amb + v_none);
END $$;

------------------------------------------- 3. link-on-create / link-on-update
CREATE OR REPLACE FUNCTION public.fp_individual_autolink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.fp_try_link_individual(NEW.id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_fp_individual_autolink ON public.fp_individuals;
CREATE TRIGGER trg_fp_individual_autolink
AFTER INSERT OR UPDATE OF full_name, national_id, passport_number, email, user_id, status
ON public.fp_individuals
FOR EACH ROW EXECUTE FUNCTION public.fp_individual_autolink();

------------------------------------------------ 4. appointment / F&P bridge
CREATE OR REPLACE FUNCTION public.entity_appointment_fp_bridge_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_linked uuid;
BEGIN
  IF NEW.fp_individual_id IS NOT NULL THEN
    SELECT l.person_party_id INTO v_linked
      FROM public.fp_individual_party_links l
     WHERE l.fp_individual_id = NEW.fp_individual_id;
    -- when a canonical bridge already exists it must agree with the appointment
    IF v_linked IS NOT NULL AND v_linked <> NEW.person_party_id THEN
      RAISE EXCEPTION 'APPOINTMENT_FP_PERSON_CONFLICT' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_entity_appointment_fp_bridge ON public.entity_appointments;
CREATE TRIGGER trg_entity_appointment_fp_bridge
BEFORE INSERT OR UPDATE OF person_party_id, fp_individual_id ON public.entity_appointments
FOR EACH ROW EXECUTE FUNCTION public.entity_appointment_fp_bridge_guard();

CREATE OR REPLACE FUNCTION public.entity_appointment_autolink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.fp_individual_id IS NOT NULL THEN
    PERFORM public.fp_try_link_individual(NEW.fp_individual_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_entity_appointment_autolink ON public.entity_appointments;
CREATE TRIGGER trg_entity_appointment_autolink
AFTER INSERT OR UPDATE OF fp_individual_id ON public.entity_appointments
FOR EACH ROW EXECUTE FUNCTION public.entity_appointment_autolink();

-- Governed resolution of the F&P context on an existing appointment. Never picks
-- arbitrarily between several F&P records.
CREATE OR REPLACE FUNCTION public.entity_appointment_resolve_fp_bridge(_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); v_person uuid; v_count int; v_fp uuid; v_existing uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid,'licensee_management','edit')
          OR public.has_permission(uid,'fit_and_proper','edit')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT person_party_id, fp_individual_id INTO v_person, v_existing
    FROM public.entity_appointments WHERE id = _appointment_id;
  IF v_person IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('state','ALREADY_BRIDGED','fp_individual_id',v_existing);
  END IF;
  SELECT count(*), min(l.fp_individual_id) INTO v_count, v_fp
    FROM public.fp_individual_party_links l WHERE l.person_party_id = v_person;
  IF v_count = 0 THEN RETURN jsonb_build_object('state','UNRESOLVED','reason','NO_LINKED_FP_CONTEXT'); END IF;
  IF v_count > 1 THEN RETURN jsonb_build_object('state','UNRESOLVED','reason','MULTIPLE_FP_CONTEXTS','candidates',v_count); END IF;
  UPDATE public.entity_appointments SET fp_individual_id = v_fp, updated_at = now()
   WHERE id = _appointment_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (uid,'entity_appointment.fp_bridge_resolved','entity_appointment',_appointment_id::text,
          jsonb_build_object('fp_individual_id',v_fp,'person_party_id',v_person));
  RETURN jsonb_build_object('state','BRIDGED','fp_individual_id',v_fp);
END $$;
REVOKE ALL ON FUNCTION public.entity_appointment_resolve_fp_bridge(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_appointment_resolve_fp_bridge(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.entity_appointment_resolve_fp_bridge(uuid) TO authenticated;

------------------------------------------------ 5. unresolved identity queue
CREATE OR REPLACE FUNCTION public.fp_person_identity_queue(_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid,'fit_and_proper','view')
          OR public.has_permission(uid,'entity_structure','view')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 1000 THEN
    RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'state', r->>'full_name'), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'fp_individual_id', f.id,
             'full_name', f.full_name,
             'status', f.status,
             'regulator_id', f.regulator_id,
             'candidate_count', c.n,
             'person_party_id', l.person_party_id,
             'match_method', l.match_method,
             'match_category', l.match_category,
             'linked_at', l.linked_at,
             'state', CASE
               WHEN l.person_party_id IS NOT NULL AND l.match_method = 'MANUAL' THEN 'MANUALLY_LINKED'
               WHEN l.person_party_id IS NOT NULL AND conf.n > 0 THEN 'CONFLICT_DETECTED'
               WHEN l.person_party_id IS NOT NULL THEN 'LINKED_DETERMINISTIC'
               WHEN c.n = 1 THEN 'DETERMINISTIC_MATCH_AVAILABLE'
               WHEN c.n > 1 THEN 'AMBIGUOUS_CANDIDATES'
               ELSE 'NO_CANDIDATE' END,
             'reason', CASE WHEN l.person_party_id IS NULL AND c.n = 0
                            THEN 'NO_CANONICAL_IDENTITY_EVIDENCE' ELSE NULL END
           ) AS r
      FROM public.fp_individuals f
      LEFT JOIN public.fp_individual_party_links l ON l.fp_individual_id = f.id
      CROSS JOIN LATERAL (
        SELECT count(*)::int n FROM public.fp_person_link_candidates(f.id)
      ) c
      CROSS JOIN LATERAL (
        SELECT count(*)::int n FROM public.entity_appointments a
         WHERE a.fp_individual_id = f.id
           AND l.person_party_id IS NOT NULL
           AND a.person_party_id <> l.person_party_id
      ) conf
     LIMIT _limit
  ) q;
  RETURN jsonb_build_object('generated_at', now(), 'rows', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.fp_person_identity_queue(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_person_identity_queue(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_person_identity_queue(integer) TO authenticated;

------------------------------------------------ 6. manual governed resolution
CREATE OR REPLACE FUNCTION public.fp_link_person_manual(
  _fp_individual_id uuid, _person_party_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); v_existing uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid,'fit_and_proper','edit')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF _fp_individual_id IS NULL OR _person_party_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'RESOLUTION_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fp_individuals WHERE id = _fp_individual_id) THEN
    RAISE EXCEPTION 'FP_INDIVIDUAL_NOT_FOUND' USING ERRCODE='22023';
  END IF;

  SELECT person_party_id INTO v_existing FROM public.fp_individual_party_links
   WHERE fp_individual_id = _fp_individual_id;
  IF v_existing IS NOT NULL THEN
    IF v_existing = _person_party_id THEN
      RETURN jsonb_build_object('state','ALREADY_LINKED','person_party_id',v_existing);
    END IF;
    RAISE EXCEPTION 'CONFLICTING_PERSON_LINK' USING ERRCODE='22023';
  END IF;

  -- the guard trigger enforces PERSON-kind and appointment consistency
  INSERT INTO public.fp_individual_party_links
    (fp_individual_id, person_party_id, match_method, match_confidence, match_category,
     match_evidence, link_reason, linked_by)
  VALUES (_fp_individual_id, _person_party_id, 'MANUAL', 'MANUAL', 'MANUAL_CONFIRMED',
          jsonb_build_object('evidence','MANUAL_CONFIRMED'), btrim(_reason), uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (uid,'fp.person_identity.linked_manual','fp_individual',_fp_individual_id::text,
          jsonb_build_object('person_party_id',_person_party_id,'reason',btrim(_reason),
                             'match_category','MANUAL_CONFIRMED'));
  RETURN jsonb_build_object('state','LINKED','person_party_id',_person_party_id);
END $$;
REVOKE ALL ON FUNCTION public.fp_link_person_manual(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_link_person_manual(uuid,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_link_person_manual(uuid,uuid,text) TO authenticated;

------------------------------------------------ 7. person relationship network
CREATE OR REPLACE FUNCTION public.person_relationship_network(
  _person_party_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
        v_as_of timestamptz;
        v_name text;
        v_fp_allowed boolean;
        v_appts jsonb := '[]'::jsonb;
        v_own jsonb := '[]'::jsonb;
        v_fp jsonb := '[]'::jsonb;
        v_rel jsonb := '[]'::jsonb;
        v_restricted int := 0;
        v_r record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _person_party_id IS NULL THEN RAISE EXCEPTION 'PERSON_REQUIRED' USING ERRCODE='22023'; END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid,'entity_structure','view')
          OR public.has_permission(uid,'fit_and_proper','view')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT pe.full_name INTO v_name
    FROM public.persons pe JOIN public.parties p ON p.id = pe.party_id
   WHERE pe.party_id = _person_party_id AND p.party_kind = 'PERSON';
  IF v_name IS NULL THEN RAISE EXCEPTION 'PERSON_PARTY_REQUIRED' USING ERRCODE='22023'; END IF;

  v_as_of := (COALESCE(_as_of, CURRENT_DATE)::timestamptz + interval '1 day' - interval '1 microsecond');
  v_fp_allowed := public.is_super_admin(uid) OR public.has_permission(uid,'fit_and_proper','view');

  -- B. canonical organisation appointments (entity_appointments is authoritative)
  FOR v_r IN
    SELECT a.*, l.name AS entity_name, rt.label AS role_name
      FROM public.entity_appointments a
      JOIN public.licensees l ON l.id = a.entity_id
      LEFT JOIN public.role_types rt ON rt.id = a.role_type_id
     WHERE a.person_party_id = _person_party_id
       AND a.effective_from <= v_as_of
     ORDER BY a.effective_from DESC
  LOOP
    IF NOT public.regulatory_scope_allows(uid,'entity_structure','view',
           public.entity_reporting_regulator(v_r.entity_id), NULL, NULL, v_r.entity_id, NULL) THEN
      v_restricted := v_restricted + 1;
      CONTINUE;  -- restricted branches are never disclosed
    END IF;
    v_appts := v_appts || jsonb_build_object(
      'appointment_id', v_r.id,
      'entity_id', v_r.entity_id,
      'entity_name', v_r.entity_name,
      'role', v_r.role_name,
      'is_executive', v_r.is_executive,
      'status', v_r.status,
      'regulatory_approval_status', v_r.regulatory_approval_status,
      'effective_from', v_r.effective_from,
      'effective_to', v_r.effective_to,
      'is_current', (v_r.effective_to IS NULL OR v_r.effective_to > v_as_of)
                    AND v_r.status = 'ACTIVE',
      'fp_individual_id', CASE WHEN v_fp_allowed THEN v_r.fp_individual_id ELSE NULL END,
      'source_authority', 'entity_appointments',
      'provenance', jsonb_build_object(
        'source_submission_id', v_r.source_submission_id,
        'source_form_version_id', v_r.source_form_version_id,
        'source_change_set_id', v_r.source_change_set_id,
        'recorded_at', v_r.recorded_at)
    );
  END LOOP;

  -- C. canonical ownership / control (ownership_interests is authoritative;
  --    no ownership mathematics is re-implemented here — B2 resolvers stay canonical)
  FOR v_r IN
    SELECT o.*, l.name AS owned_entity_name, pt.display_name AS owned_party_name
      FROM public.ownership_interests o
      LEFT JOIN public.licensees l ON l.id = o.owned_entity_id
      LEFT JOIN public.parties pt ON pt.id = o.owned_party_id
     WHERE o.owner_party_id = _person_party_id
       AND o.effective_from <= v_as_of
     ORDER BY o.effective_from DESC
  LOOP
    IF v_r.owned_entity_id IS NOT NULL
       AND NOT public.regulatory_scope_allows(uid,'entity_structure','view',
             public.entity_reporting_regulator(v_r.owned_entity_id), NULL, NULL, v_r.owned_entity_id, NULL) THEN
      v_restricted := v_restricted + 1;
      CONTINUE;
    END IF;
    v_own := v_own || jsonb_build_object(
      'interest_id', v_r.id,
      'owned_entity_id', v_r.owned_entity_id,
      'owned_entity_name', v_r.owned_entity_name,
      'owned_party_id', v_r.owned_party_id,
      'owned_party_name', v_r.owned_party_name,
      'economic_interest_percentage', v_r.economic_interest_percentage,
      'voting_rights_percentage', v_r.voting_rights_percentage,
      'is_controller', v_r.is_controller,
      'control_determination', v_r.control_determination,
      'is_direct', v_r.is_direct,
      'approval_status', v_r.approval_status,
      'effective_from', v_r.effective_from,
      'effective_to', v_r.effective_to,
      'is_current', v_r.effective_to IS NULL OR v_r.effective_to > v_as_of,
      'source_authority', 'ownership_interests',
      'provenance', jsonb_build_object(
        'source_submission_id', v_r.source_submission_id,
        'source_change_set_id', v_r.source_change_set_id,
        'recorded_at', v_r.recorded_at)
    );
  END LOOP;

  -- D. F&P contexts (permission gated; never returns DOB / national id / passport)
  IF v_fp_allowed THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'full_name'), '[]'::jsonb) INTO v_fp
      FROM (
        SELECT jsonb_build_object(
                 'fp_individual_id', f.id,
                 'full_name', f.full_name,
                 'status', f.status,
                 'link_method', lk.match_method,
                 'link_category', lk.match_category,
                 'linked_at', lk.linked_at,
                 'source_authority', 'fp_individuals',
                 'roles', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                             'role_id', r.id, 'role_type', r.role_type, 'role_title', r.role_title,
                             'licensee_id', r.licensee_id, 'license_id', r.license_id,
                             'effective_from', r.effective_from, 'effective_to', r.effective_to,
                             'is_current', r.is_current,
                             'source_authority', 'fp_individual_roles'))
                      FROM public.fp_individual_roles r WHERE r.individual_id = f.id), '[]'::jsonb)
               ) x
          FROM public.fp_individual_party_links lk
          JOIN public.fp_individuals f ON f.id = lk.fp_individual_id
         WHERE lk.person_party_id = _person_party_id
      ) q;
  END IF;

  -- E. governed party relationships, direction explicit
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'effective_from' DESC), '[]'::jsonb) INTO v_rel
    FROM (
      SELECT jsonb_build_object(
               'relationship_id', pr.id,
               'direction', CASE WHEN pr.source_party_id = _person_party_id THEN 'OUTBOUND' ELSE 'INBOUND' END,
               'counterparty_party_id', CASE WHEN pr.source_party_id = _person_party_id
                                             THEN pr.target_party_id ELSE pr.source_party_id END,
               'counterparty_name', cp.display_name,
               'relationship_type', rt.label,
               'entity_id', pr.entity_id,
               'status', pr.status,
               'effective_from', pr.effective_from,
               'effective_to', pr.effective_to,
               'is_current', pr.effective_to IS NULL OR pr.effective_to > v_as_of,
               'source_authority', 'party_relationships') x
        FROM public.party_relationships pr
        LEFT JOIN public.relationship_types rt ON rt.id = pr.relationship_type_id
        LEFT JOIN public.parties cp ON cp.id = CASE WHEN pr.source_party_id = _person_party_id
                                                   THEN pr.target_party_id ELSE pr.source_party_id END
       WHERE (pr.source_party_id = _person_party_id OR pr.target_party_id = _person_party_id)
         AND pr.effective_from <= v_as_of
    ) q;

  RETURN jsonb_build_object(
    'as_of', COALESCE(_as_of, CURRENT_DATE),
    'identity', jsonb_build_object(
       'person_party_id', _person_party_id,
       'display_name', v_name,
       'is_canonical_person', true,
       'source_authority', 'parties + persons'),
    'appointments', v_appts,
    'ownership', v_own,
    'fp_contexts', v_fp,
    'fp_contexts_visible', v_fp_allowed,
    'relationships', v_rel,
    'counts', jsonb_build_object(
       'appointments_total', jsonb_array_length(v_appts),
       'appointments_current', (SELECT count(*) FROM jsonb_array_elements(v_appts) e
                                 WHERE (e->>'is_current')::boolean),
       'ownership_total', jsonb_array_length(v_own),
       'ownership_current', (SELECT count(*) FROM jsonb_array_elements(v_own) e
                              WHERE (e->>'is_current')::boolean),
       'fp_contexts', jsonb_array_length(v_fp),
       'relationships', jsonb_array_length(v_rel),
       'entities_with_appointments', (SELECT count(DISTINCT e->>'entity_id')
                                        FROM jsonb_array_elements(v_appts) e)),
    'restricted_branches', v_restricted,
    'restricted_reason', CASE WHEN v_restricted > 0 THEN 'REGULATOR_SCOPE_RESTRICTED' ELSE NULL END
  );
END $$;
REVOKE ALL ON FUNCTION public.person_relationship_network(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_relationship_network(uuid,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.person_relationship_network(uuid,date) TO authenticated;

-- Person 360 header/overview: canonical person plus unresolved indicator.
CREATE OR REPLACE FUNCTION public.person_360_overview(_person_party_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); v jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  v := public.person_relationship_network(_person_party_id, CURRENT_DATE);
  RETURN v || jsonb_build_object(
    'conflicts', (SELECT count(*) FROM public.entity_appointments a
                    JOIN public.fp_individual_party_links l ON l.fp_individual_id = a.fp_individual_id
                   WHERE l.person_party_id = _person_party_id
                     AND a.person_party_id <> l.person_party_id));
END $$;
REVOKE ALL ON FUNCTION public.person_360_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_360_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.person_360_overview(uuid) TO authenticated;