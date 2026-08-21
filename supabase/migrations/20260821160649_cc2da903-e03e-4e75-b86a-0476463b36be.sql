-- =====================================================================
-- P04 A.6 / A.14 / A.19–A.21 — variation + appeal operations, gate
-- enforcement in the lifecycle step, read models, Entity 360 summary.
-- =====================================================================

-- Fix template resolution (specificity ordering) from the previous increment.
CREATE OR REPLACE FUNCTION public.license_verification_template_resolve(_license_id uuid, _matter_kind text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
    FROM public.license_verification_templates t, public.licenses l
   WHERE l.id = _license_id AND t.is_active AND t.matter_kind = _matter_kind
     AND (t.license_type IS NULL OR t.license_type = l.license_type)
     AND (t.sector_id    IS NULL OR t.sector_id    = l.sector_id)
     AND (t.regulator_id IS NULL OR t.regulator_id = l.regulator_id)
   ORDER BY (CASE WHEN t.license_type IS NOT NULL THEN 4 ELSE 0 END
           + CASE WHEN t.sector_id    IS NOT NULL THEN 2 ELSE 0 END
           + CASE WHEN t.regulator_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
            t.created_at
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.license_verification_operation(_operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l record; tpl record; c record; it jsonb; v_case_id uuid; v_item record; v_tpl_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF _operation = 'start' THEN
    SELECT * INTO l FROM public.licenses WHERE id = (_payload->>'license_id')::uuid;
    IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_verification_cases
                WHERE license_id=l.id AND matter_id IS NOT DISTINCT FROM NULLIF(_payload->>'matter_id','')::uuid
                  AND status='in_progress') THEN
      RAISE EXCEPTION 'ALREADY_OPEN' USING ERRCODE='22023', DETAIL='A verification case is already open.'; END IF;
    v_tpl_id := public.license_verification_template_resolve(l.id, _payload->>'matter_kind');
    IF v_tpl_id IS NULL THEN RAISE EXCEPTION 'NO_TEMPLATE' USING ERRCODE='22023',
      DETAIL='No active verification template is configured for this licence and matter kind.'; END IF;
    SELECT * INTO tpl FROM public.license_verification_templates WHERE id = v_tpl_id;
    INSERT INTO public.license_verification_cases(license_id, matter_id, matter_kind, template_id,
      template_snapshot, started_by)
    VALUES (l.id, NULLIF(_payload->>'matter_id','')::uuid, _payload->>'matter_kind', tpl.id, to_jsonb(tpl), uid)
    RETURNING id INTO v_case_id;
    FOR it IN SELECT value FROM jsonb_array_elements(tpl.items) LOOP
      INSERT INTO public.license_verification_items(case_id, item_key, label, required)
      VALUES (v_case_id, it->>'key', COALESCE(it->>'label', it->>'key'), COALESCE((it->>'required')::boolean, true));
    END LOOP;
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_verification_start', 'license_verification_case', v_case_id,
            jsonb_build_object('license_id', l.id, 'matter_kind', _payload->>'matter_kind'));
    RETURN jsonb_build_object('case_id', v_case_id);

  ELSIF _operation = 'record_item' THEN
    SELECT * INTO v_item FROM public.license_verification_items WHERE id = (_payload->>'item_id')::uuid;
    IF v_item IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF COALESCE(_payload->>'result','') NOT IN ('satisfied','not_satisfied','not_applicable') THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A valid verification result is required.'; END IF;
    UPDATE public.license_verification_items
       SET result = _payload->>'result', note = _payload->>'note',
           evidence_document_id = NULLIF(_payload->>'evidence_document_id','')::uuid,
           recorded_by = uid, recorded_at = now()
     WHERE id = v_item.id;
    RETURN jsonb_build_object('ok', true);

  ELSIF _operation = 'complete' THEN
    SELECT * INTO c FROM public.license_verification_cases WHERE id = (_payload->>'case_id')::uuid;
    IF c IS NULL THEN RAISE EXCEPTION 'CASE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_verification_items
                WHERE case_id=c.id AND required AND result IS NULL) THEN
      RAISE EXCEPTION 'INCOMPLETE' USING ERRCODE='22023',
        DETAIL='All required verification items must be recorded before completion.'; END IF;
    UPDATE public.license_verification_cases
       SET status='completed', completed_by=uid, completed_at=now(), updated_at=now(),
           outcome = CASE WHEN EXISTS (SELECT 1 FROM public.license_verification_items
                                        WHERE case_id=c.id AND result='not_satisfied')
                          THEN 'deficiencies_identified' ELSE 'satisfied' END
     WHERE id=c.id;
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_verification_complete', 'license_verification_case', c.id,
            jsonb_build_object('license_id', c.license_id));
    RETURN jsonb_build_object('ok', true);
  END IF;
  RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
END $$;

-- ---------------- A.6 variation governed operations -------------------
CREATE OR REPLACE FUNCTION public.license_variation_operation(_operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l record; v record; it jsonb; v_id uuid; v_ref text; v_dec uuid; v_matter uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF _operation = 'open' THEN
    IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    SELECT * INTO l FROM public.licenses WHERE id = (_payload->>'license_id')::uuid;
    IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF l.status <> 'active' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL='Only an active licence can be varied.'; END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'variation_type','')),'') IS NULL THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='Variation type is required.'; END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'rationale','')),'') IS NULL THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A rationale is required.'; END IF;
    IF jsonb_typeof(COALESCE(_payload->'items','[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(_payload->'items','[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023',
        DETAIL='At least one requested change must be itemised.'; END IF;

    v_ref := 'VAR-' || to_char(now(),'YYYY') || '-' || lpad((
      (SELECT count(*) + 1 FROM public.license_variations
        WHERE requested_at >= date_trunc('year', now())))::text, 5, '0');

    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by,
      waiting_on, stage, source_kind, source_reference, metadata)
    VALUES (l.id, 'variation', 'Variation — ' || (_payload->>'variation_type'),
            _payload->>'rationale', uid, 'regulator', 'ASSESSMENT', 'regulator_initiated', v_ref,
            jsonb_build_object('variation_reference', v_ref))
    RETURNING id INTO v_matter;

    INSERT INTO public.license_variations(license_id, matter_id, application_id, variation_reference,
      variation_type, status, rationale, requested_by, metadata)
    VALUES (l.id, v_matter, NULLIF(_payload->>'application_id','')::uuid, v_ref,
            _payload->>'variation_type', 'under_assessment', _payload->>'rationale', uid,
            COALESCE(_payload->'metadata','{}'::jsonb))
    RETURNING id INTO v_id;

    FOR it IN SELECT value FROM jsonb_array_elements(_payload->'items') LOOP
      IF NULLIF(btrim(COALESCE(it->>'requested_value','')),'') IS NULL THEN
        RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023',
          DETAIL='Every itemised change needs a requested value.'; END IF;
      INSERT INTO public.license_variation_items(variation_id, field_key, label, current_value,
        requested_value, requires_assessment)
      VALUES (v_id, COALESCE(it->>'field_key','change'), COALESCE(it->>'label', it->>'field_key','Change'),
              it->>'current_value', it->>'requested_value',
              COALESCE((it->>'requires_assessment')::boolean, true));
    END LOOP;

    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_variation_open', 'license_variation', v_id,
            jsonb_build_object('license_id', l.id, 'reference', v_ref));
    RETURN jsonb_build_object('variation_id', v_id, 'matter_id', v_matter, 'reference', v_ref);

  ELSIF _operation = 'decide' THEN
    IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','approve')) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    SELECT * INTO v FROM public.license_variations WHERE id = (_payload->>'variation_id')::uuid;
    IF v IS NULL THEN RAISE EXCEPTION 'VARIATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF v.status NOT IN ('requested','under_assessment') THEN
      RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023', DETAIL='This variation is already decided.'; END IF;
    IF COALESCE(_payload->>'decision','') NOT IN ('approved','refused','withdrawn') THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A valid decision is required.'; END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'rationale','')),'') IS NULL THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A written decision rationale is required.'; END IF;
    IF v.requested_by = uid AND NOT public.is_super_admin(uid) THEN
      RAISE EXCEPTION 'MAKER_CHECKER' USING ERRCODE='42501',
        DETAIL='The officer who opened the variation cannot decide it.'; END IF;
    IF jsonb_array_length(public.license_lifecycle_gates(v.license_id, v.matter_id)) > 0
       AND (_payload->>'decision') = 'approved' THEN
      RAISE EXCEPTION 'BLOCKED' USING ERRCODE='22023',
        DETAIL='Outstanding fees or incomplete verification block approval of this variation.'; END IF;

    INSERT INTO public.license_decisions(matter_id, license_id, entity_id, decision_type, decision,
      authority, actor_id, maker_id, checker_id, effective_date, rationale, legal_basis, appealable,
      appeal_deadline, metadata)
    SELECT v.matter_id, v.license_id, e.entity_id, 'variation', _payload->>'decision',
           COALESCE(_payload->>'authority','delegated_officer'), uid, v.requested_by, uid,
           COALESCE(NULLIF(_payload->>'effective_date','')::date, current_date),
           _payload->>'rationale', _payload->>'legal_basis', true,
           COALESCE(NULLIF(_payload->>'effective_date','')::date, current_date) + 30,
           jsonb_build_object('variation_id', v.id, 'variation_reference', v.variation_reference)
      FROM (SELECT a.entity_id FROM public.applications a WHERE a.id = (SELECT application_id FROM public.licenses WHERE id = v.license_id)) e
    RETURNING id INTO v_dec;

    UPDATE public.license_variation_items
       SET approved_value = CASE WHEN (_payload->>'decision') = 'approved' THEN requested_value ELSE NULL END
     WHERE variation_id = v.id;

    UPDATE public.license_variations
       SET status = _payload->>'decision', decision = _payload->>'decision', decision_id = v_dec,
           decided_by = uid, decided_at = now(),
           effective_date = COALESCE(NULLIF(_payload->>'effective_date','')::date, current_date),
           updated_at = now()
     WHERE id = v.id;

    UPDATE public.license_lifecycle_matters
       SET status='closed', closed_at=now(), closed_by=uid, decision=_payload->>'decision',
           decision_id=v_dec, stage='CLOSED', updated_at=now()
     WHERE id = v.matter_id;

    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_variation_decide', 'license_variation', v.id,
            jsonb_build_object('decision', _payload->>'decision', 'decision_id', v_dec));
    RETURN jsonb_build_object('variation_id', v.id, 'decision_id', v_dec);
  END IF;
  RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
END $$;

-- ---------------- A.14 appeal against a licence decision --------------
CREATE OR REPLACE FUNCTION public.license_decision_appeal_operation(_operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d record; ap record; v_id uuid; v_ref text; v_window int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF _operation = 'lodge' THEN
    IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    SELECT * INTO d FROM public.license_decisions WHERE id = (_payload->>'decision_id')::uuid;
    IF d IS NULL THEN RAISE EXCEPTION 'DECISION_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF NOT COALESCE(d.appealable, false) THEN
      RAISE EXCEPTION 'NOT_APPEALABLE' USING ERRCODE='22023', DETAIL='This decision is not appealable.'; END IF;
    IF d.appeal_deadline IS NOT NULL AND d.appeal_deadline < current_date THEN
      RAISE EXCEPTION 'OUT_OF_TIME' USING ERRCODE='22023',
        DETAIL='The appeal window for this decision closed on ' || d.appeal_deadline || '.'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_decision_appeals
                WHERE decision_id = d.id AND status NOT IN ('withdrawn','determined')) THEN
      RAISE EXCEPTION 'ALREADY_OPEN' USING ERRCODE='22023',
        DETAIL='An appeal against this decision is already live.'; END IF;
    IF NULLIF(btrim(COALESCE(_payload->>'grounds','')),'') IS NULL THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='Grounds of appeal are required.'; END IF;

    v_ref := 'LAP-' || to_char(now(),'YYYY') || '-' || lpad((
      (SELECT count(*) + 1 FROM public.license_decision_appeals
        WHERE lodged_at >= date_trunc('year', now())))::text, 5, '0');

    INSERT INTO public.license_decision_appeals(appeal_reference, decision_id, license_id, matter_id,
      entity_id, grounds, relief_sought, lodged_by, appeal_deadline, stay_of_effect, metadata)
    VALUES (v_ref, d.id, d.license_id, d.matter_id, d.entity_id, _payload->>'grounds',
            _payload->>'relief_sought', uid, d.appeal_deadline,
            COALESCE((_payload->>'stay_of_effect')::boolean, false),
            COALESCE(_payload->'metadata','{}'::jsonb))
    RETURNING id INTO v_id;

    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_decision_appeal_lodge', 'license_decision_appeal', v_id,
            jsonb_build_object('decision_id', d.id, 'reference', v_ref));
    RETURN jsonb_build_object('appeal_id', v_id, 'reference', v_ref);

  ELSIF _operation IN ('acknowledge','determine','withdraw') THEN
    SELECT * INTO ap FROM public.license_decision_appeals WHERE id = (_payload->>'appeal_id')::uuid;
    IF ap IS NULL THEN RAISE EXCEPTION 'APPEAL_NOT_FOUND' USING ERRCODE='22023'; END IF;

    IF _operation = 'acknowledge' THEN
      IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
      IF ap.status <> 'lodged' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
      UPDATE public.license_decision_appeals SET status='under_review', updated_at=now() WHERE id=ap.id;

    ELSIF _operation = 'withdraw' THEN
      IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
      IF ap.status IN ('determined','withdrawn') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
      IF NULLIF(btrim(COALESCE(_payload->>'rationale','')),'') IS NULL THEN
        RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A withdrawal reason is required.'; END IF;
      UPDATE public.license_decision_appeals
         SET status='withdrawn', outcome='withdrawn', outcome_rationale=_payload->>'rationale',
             decided_by=uid, decided_at=now(), updated_at=now() WHERE id=ap.id;

    ELSE
      IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','approve')) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
      IF ap.status NOT IN ('lodged','under_review') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
      IF COALESCE(_payload->>'outcome','') NOT IN ('upheld','dismissed','varied','remitted') THEN
        RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A valid appeal outcome is required.'; END IF;
      IF NULLIF(btrim(COALESCE(_payload->>'rationale','')),'') IS NULL THEN
        RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A written determination rationale is required.'; END IF;
      IF ap.lodged_by = uid AND NOT public.is_super_admin(uid) THEN
        RAISE EXCEPTION 'MAKER_CHECKER' USING ERRCODE='42501',
          DETAIL='The officer who lodged the appeal cannot determine it.'; END IF;
      UPDATE public.license_decision_appeals
         SET status='determined', outcome=_payload->>'outcome', outcome_rationale=_payload->>'rationale',
             decided_by=uid, decided_at=now(), updated_at=now() WHERE id=ap.id;
    END IF;

    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_decision_appeal_' || _operation, 'license_decision_appeal', ap.id, _payload);
    RETURN (SELECT to_jsonb(x) FROM public.license_decision_appeals x WHERE x.id = ap.id);
  END IF;
  RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
END $$;

-- ---------------- gate enforcement in the single mutation entry point --
CREATE OR REPLACE FUNCTION public.license_lifecycle_step(
  _license_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_avail jsonb; v_offer jsonb; req jsonb; f jsonb; fv text; v_gates jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  v_avail := public.license_lifecycle_available_actions(_license_id);
  SELECT a INTO v_offer FROM jsonb_array_elements(v_avail) a
   WHERE a->>'key' = _action_key
     AND (_payload->>'matter_id' IS NULL OR a->>'matter_id' IS NULL OR a->>'matter_id' = _payload->>'matter_id')
   LIMIT 1;

  IF v_offer IS NULL AND _action_key NOT IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL = 'Action ' || _action_key || ' is not available for this licence in its current state.';
  END IF;

  IF v_offer IS NOT NULL THEN
    req := public.license_action_input_requirements(_license_id, _action_key, v_offer->>'matter_kind');
    FOR f IN SELECT value FROM jsonb_array_elements(req) LOOP
      IF COALESCE((f->>'required')::boolean, false) THEN
        fv := NULLIF(btrim(COALESCE(_payload->>(f->>'key'), '')), '');
        IF fv IS NULL THEN
          RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023',
            DETAIL = (f->>'label') || ' is required for ' || _action_key || '.';
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- A.15–A.18: outstanding blocking fees / incomplete verification stop
  -- every determinative or renewal-granting step.
  IF _action_key IN ('APPROVE_RENEWAL','APPROVE_VARIATION','DECIDE_SUSPENSION','DECIDE_REVOCATION',
                     'DECIDE_REINSTATEMENT','ACCEPT_SURRENDER') THEN
    v_gates := public.license_lifecycle_gates(_license_id, NULLIF(_payload->>'matter_id','')::uuid);
    IF jsonb_array_length(v_gates) > 0 THEN
      RAISE EXCEPTION 'BLOCKED' USING ERRCODE='22023',
        DETAIL = (SELECT string_agg(b->>'label', '; ') FROM jsonb_array_elements(v_gates) b);
    END IF;
  END IF;

  RETURN public.license_lifecycle_action(_license_id, _action_key, COALESCE(_payload,'{}'::jsonb), _reason);
END $$;

-- ---------------- read models ----------------------------------------
CREATE OR REPLACE FUNCTION public.license_fee_ledger(_license_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'assessments', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.assessed_at DESC)
                               FROM public.license_fee_assessments a WHERE a.license_id = _license_id), '[]'::jsonb),
    'summary', COALESCE((SELECT jsonb_build_object(
                    'outstanding', count(*) FILTER (WHERE status IN ('due','paid')),
                    'outstanding_amount', COALESCE(sum(amount) FILTER (WHERE status IN ('due','paid')), 0),
                    'verified', count(*) FILTER (WHERE status='verified'),
                    'waived', count(*) FILTER (WHERE status='waived'))
                  FROM public.license_fee_assessments WHERE license_id = _license_id),
                 jsonb_build_object('outstanding',0,'outstanding_amount',0,'verified',0,'waived',0)),
    'gates', public.license_lifecycle_gates(_license_id, NULL)
  ) WHERE public.is_internal_staff_user(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.license_verification_case_view(_license_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'case', to_jsonb(c),
           'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
                                FROM public.license_verification_items i WHERE i.case_id = c.id), '[]'::jsonb)
         ) ORDER BY c.started_at DESC), '[]'::jsonb)
    FROM public.license_verification_cases c
   WHERE c.license_id = _license_id AND public.is_internal_staff_user(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.license_variation_case(_license_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'variation', to_jsonb(v),
           'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
                                FROM public.license_variation_items i WHERE i.variation_id = v.id), '[]'::jsonb)
         ) ORDER BY v.requested_at DESC), '[]'::jsonb)
    FROM public.license_variations v
   WHERE v.license_id = _license_id AND public.is_internal_staff_user(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.license_decision_appeal_view(_license_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'appeal', to_jsonb(ap),
           'decision', jsonb_build_object('id', d.id, 'reference', d.decision_reference,
             'decision_type', d.decision_type, 'decision', d.decision, 'decided_at', d.decided_at,
             'effective_date', d.effective_date, 'appeal_deadline', d.appeal_deadline,
             'appealable', d.appealable, 'rationale', d.rationale)
         ) ORDER BY ap.lodged_at DESC), '[]'::jsonb)
    FROM public.license_decision_appeals ap
    JOIN public.license_decisions d ON d.id = ap.decision_id
   WHERE ap.license_id = _license_id AND public.is_internal_staff_user(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.license_appealable_decisions(_license_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'reference', d.decision_reference, 'decision_type', d.decision_type,
           'decision', d.decision, 'decided_at', d.decided_at, 'appeal_deadline', d.appeal_deadline)
         ORDER BY d.decided_at DESC), '[]'::jsonb)
    FROM public.license_decisions d
   WHERE d.license_id = _license_id
     AND COALESCE(d.appealable,false)
     AND (d.appeal_deadline IS NULL OR d.appeal_deadline >= current_date)
     AND NOT EXISTS (SELECT 1 FROM public.license_decision_appeals a
                      WHERE a.decision_id = d.id AND a.status NOT IN ('withdrawn','determined'))
     AND public.is_internal_staff_user(auth.uid());
$$;

-- ---------------- A.21 Entity 360 licence summary ---------------------
CREATE OR REPLACE FUNCTION public.entity_license_summary(_entity_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH lic AS (
    SELECT l.* FROM public.licenses l
     WHERE l.application_id IN (SELECT a.id FROM public.applications a WHERE a.entity_id = _entity_id)
  )
  SELECT jsonb_build_object(
    'licences', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'license_id', l.id, 'license_number', l.license_number, 'license_type', l.license_type,
        'status', l.status, 'issued_at', l.issued_at, 'valid_from', l.valid_from, 'valid_until', l.valid_until,
        'open_matters', (SELECT count(*) FROM public.license_lifecycle_matters m
                          WHERE m.license_id = l.id AND m.status='open'),
        'open_conditions', (SELECT count(*) FROM public.license_conditions c
                             WHERE c.license_id = l.id AND c.status IN ('open','in_progress','evidence_due')),
        'outstanding_fees', (SELECT COALESCE(sum(f.amount),0) FROM public.license_fee_assessments f
                              WHERE f.license_id = l.id AND f.status IN ('due','paid')),
        'live_appeals', (SELECT count(*) FROM public.license_decision_appeals ap
                          WHERE ap.license_id = l.id AND ap.status NOT IN ('withdrawn','determined'))
      ) ORDER BY l.issued_at DESC) FROM lic l), '[]'::jsonb),
    'summary', COALESCE((SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE status='active'),
        'suspended', count(*) FILTER (WHERE status='suspended'),
        'revoked', count(*) FILTER (WHERE status='revoked'),
        'expiring_90d', count(*) FILTER (WHERE valid_until IS NOT NULL
                          AND valid_until BETWEEN current_date AND current_date + 90))
      FROM lic), jsonb_build_object('total',0,'active',0,'suspended',0,'revoked',0,'expiring_90d',0))
  ) WHERE public.is_internal_staff_user(auth.uid());
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.license_verification_template_resolve(uuid, text)',
    'public.license_verification_operation(text, jsonb)',
    'public.license_variation_operation(text, jsonb)',
    'public.license_decision_appeal_operation(text, jsonb)',
    'public.license_fee_ledger(uuid)',
    'public.license_verification_case_view(uuid)',
    'public.license_variation_case(uuid)',
    'public.license_decision_appeal_view(uuid)',
    'public.license_appealable_decisions(uuid)',
    'public.entity_license_summary(uuid)',
    'public.license_lifecycle_gates(uuid, uuid)',
    'public.license_fee_operation(uuid, text, jsonb)',
    'public.license_fee_resolve(uuid, text, text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;