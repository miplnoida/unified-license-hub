CREATE OR REPLACE FUNCTION public.fp_try_link_individual(_fp_individual_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int; v_party uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fp_individual_party_links WHERE fp_individual_id = _fp_individual_id) THEN
    RETURN 'ALREADY_LINKED';
  END IF;
  SELECT count(*), min(person_party_id::text)::uuid INTO v_count, v_party
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
  SELECT count(*), min(l.fp_individual_id::text)::uuid INTO v_count, v_fp
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