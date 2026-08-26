
ALTER TABLE public.complaint_investigation_plans ADD COLUMN IF NOT EXISTS review_note text;

-- ---------- evidence ----------
CREATE OR REPLACE FUNCTION public.complaint_evidence_register(_complaint_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; e public.complaint_evidence; v_ref text; v_seq int;
BEGIN
  c := public.mc03_guard(_complaint_id,'investigate');
  SELECT count(*)::int + 1 INTO v_seq FROM public.complaint_evidence WHERE complaint_id=_complaint_id;
  v_ref := coalesce(nullif(btrim(coalesce(_payload->>'evidence_reference','')),''),
                    coalesce(c.complaint_number,'CMP') || '-EV-' || lpad(v_seq::text,3,'0'));

  INSERT INTO public.complaint_evidence
    (complaint_id, file_upload_id, label, description, uploaded_by, evidence_reference,
     source_type, source_party, source_record_type, source_record_id, received_at, received_from,
     document_type, content_hash, confidentiality, privileged, personal_data,
     custodian_id, acquisition_method, finalized_at)
  VALUES (_complaint_id, nullif(_payload->>'file_upload_id','')::uuid,
     coalesce(nullif(btrim(coalesce(_payload->>'label','')),''), v_ref),
     _payload->>'description', v_uid, v_ref,
     coalesce(nullif(upper(btrim(coalesce(_payload->>'source_type',''))),''),'REGULATOR'),
     _payload->>'source_party', _payload->>'source_record_type',
     nullif(_payload->>'source_record_id','')::uuid,
     coalesce(nullif(_payload->>'received_at','')::timestamptz, now()), _payload->>'received_from',
     _payload->>'document_type', nullif(btrim(coalesce(_payload->>'content_hash','')),''),
     coalesce(nullif(upper(btrim(coalesce(_payload->>'confidentiality',''))),''),'INTERNAL'),
     coalesce((_payload->>'privileged')::boolean,false),
     coalesce((_payload->>'personal_data')::boolean,false),
     coalesce(nullif(_payload->>'custodian_id','')::uuid, v_uid),
     coalesce(nullif(_payload->>'acquisition_method',''),'MANUAL_UPLOAD'), now())
  RETURNING * INTO e;

  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.evidence.registered','complaint',_complaint_id,
          jsonb_build_object('evidence_id',e.id,'evidence_reference',e.evidence_reference,
                             'content_hash',e.content_hash,'confidentiality',e.confidentiality));
  RETURN to_jsonb(e);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_evidence_assess(
  _evidence_id uuid, _reliability text, _relevance text, _rationale text DEFAULT NULL,
  _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); e public.complaint_evidence; before_e jsonb;
        v_rel text := coalesce(nullif(upper(btrim(coalesce(_reliability,''))),''),'NOT_ASSESSED');
        v_rev text := coalesce(nullif(upper(btrim(coalesce(_relevance,''))),''),'NOT_ASSESSED');
BEGIN
  SELECT * INTO e FROM public.complaint_evidence WHERE id=_evidence_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(e.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> e.row_version THEN
    RAISE EXCEPTION 'This evidence record has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF v_rel NOT IN ('NOT_ASSESSED','LOW','MODERATE','HIGH') THEN
    RAISE EXCEPTION 'Invalid reliability assessment' USING ERRCODE='22023'; END IF;
  IF v_rev NOT IN ('NOT_ASSESSED','CONTEXTUAL','RELEVANT','MATERIAL') THEN
    RAISE EXCEPTION 'Invalid relevance assessment' USING ERRCODE='22023'; END IF;
  before_e := to_jsonb(e);
  UPDATE public.complaint_evidence
     SET reliability=v_rel, relevance=v_rev,
         assessment_rationale=COALESCE(nullif(btrim(coalesce(_rationale,'')),''), assessment_rationale),
         assessed_by=v_uid, assessed_at=now(), row_version=row_version+1, updated_at=now()
   WHERE id=_evidence_id RETURNING * INTO e;
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_uid,'complaint.evidence.assessed','complaint',e.complaint_id,
          jsonb_build_object('reliability',before_e->>'reliability','relevance',before_e->>'relevance'),
          jsonb_build_object('evidence_id',e.id,'reliability',v_rel,'relevance',v_rev,'rationale',_rationale));
  RETURN to_jsonb(e);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_evidence_supersede(
  _evidence_id uuid, _payload jsonb, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); old_e public.complaint_evidence; new_e public.complaint_evidence; v_new jsonb;
BEGIN
  SELECT * INTO old_e FROM public.complaint_evidence WHERE id=_evidence_id FOR UPDATE;
  IF old_e.id IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(old_e.complaint_id,'investigate');
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Explain why this evidence is being replaced (at least 10 characters)' USING ERRCODE='22023'; END IF;
  IF old_e.custody_state = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'This evidence item has already been superseded' USING ERRCODE='22023'; END IF;

  v_new := _payload || jsonb_build_object(
    'evidence_reference', old_e.evidence_reference || '-v' || (old_e.version + 1)::text,
    'source_type', coalesce(_payload->>'source_type', old_e.source_type),
    'confidentiality', coalesce(_payload->>'confidentiality', old_e.confidentiality),
    'document_type', coalesce(_payload->>'document_type', old_e.document_type));

  new_e := jsonb_populate_record(NULL::public.complaint_evidence, public.complaint_evidence_register(old_e.complaint_id, v_new));

  UPDATE public.complaint_evidence
     SET version = old_e.version + 1, supersedes_evidence_id = old_e.id, updated_at = now()
   WHERE id = new_e.id RETURNING * INTO new_e;

  -- original object, hash, uploader and receipt time are left untouched
  UPDATE public.complaint_evidence
     SET custody_state='SUPERSEDED', superseded_by_evidence_id=new_e.id,
         supersession_reason=btrim(_reason), row_version=row_version+1, updated_at=now()
   WHERE id=old_e.id;

  INSERT INTO public.complaint_evidence_allegations (evidence_id, allegation_id, relationship_type, relevance_note, linked_by)
  SELECT new_e.id, l.allegation_id, l.relationship_type, l.relevance_note, v_uid
  FROM public.complaint_evidence_allegations l WHERE l.evidence_id = old_e.id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_uid,'complaint.evidence.superseded','complaint',old_e.complaint_id,
          jsonb_build_object('evidence_id',old_e.id,'content_hash',old_e.content_hash,'version',old_e.version),
          jsonb_build_object('evidence_id',new_e.id,'content_hash',new_e.content_hash,
                             'version',new_e.version,'reason',btrim(_reason)));
  RETURN to_jsonb(new_e);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_evidence_withdraw(_evidence_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); e public.complaint_evidence;
BEGIN
  SELECT * INTO e FROM public.complaint_evidence WHERE id=_evidence_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(e.complaint_id,'investigate');
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Explain why this evidence is being withdrawn (at least 10 characters)' USING ERRCODE='22023'; END IF;
  UPDATE public.complaint_evidence
     SET custody_state='WITHDRAWN', supersession_reason=btrim(_reason),
         row_version=row_version+1, updated_at=now()
   WHERE id=_evidence_id RETURNING * INTO e;
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.evidence.withdrawn','complaint',e.complaint_id,
          jsonb_build_object('evidence_id',e.id,'reason',btrim(_reason)));
  RETURN to_jsonb(e);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_evidence_link_allegation(
  _evidence_id uuid, _allegation_id uuid, _relationship_type text DEFAULT 'SUPPORTS', _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); e public.complaint_evidence; a public.complaint_allegations;
        v_type text := coalesce(nullif(upper(btrim(coalesce(_relationship_type,''))),''),'SUPPORTS'); l_id uuid;
BEGIN
  SELECT * INTO e FROM public.complaint_evidence WHERE id=_evidence_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM public.complaint_allegations WHERE id=_allegation_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Allegation not found' USING ERRCODE='P0002'; END IF;
  IF a.complaint_id <> e.complaint_id THEN
    RAISE EXCEPTION 'Evidence and allegation belong to different complaints' USING ERRCODE='22023'; END IF;
  PERFORM public.mc03_guard(e.complaint_id,'investigate');
  IF v_type NOT IN ('SUPPORTS','CONTRADICTS','CONTEXT','UNDETERMINED') THEN
    RAISE EXCEPTION 'Invalid evidence relationship' USING ERRCODE='22023'; END IF;

  INSERT INTO public.complaint_evidence_allegations (evidence_id, allegation_id, relationship_type, relevance_note, linked_by)
  VALUES (_evidence_id, _allegation_id, v_type, nullif(btrim(coalesce(_note,'')),''), v_uid)
  ON CONFLICT (evidence_id, allegation_id) DO UPDATE
    SET relationship_type = EXCLUDED.relationship_type,
        relevance_note = COALESCE(EXCLUDED.relevance_note, public.complaint_evidence_allegations.relevance_note),
        linked_by = EXCLUDED.linked_by, linked_at = now()
  RETURNING id INTO l_id;

  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, to_state, actor_id)
  VALUES (_allegation_id, e.complaint_id, 'EVIDENCE_LINKED',
          jsonb_build_object('evidence_id',_evidence_id,'relationship_type',v_type), v_uid);
  RETURN jsonb_build_object('id', l_id, 'evidence_id', _evidence_id,
                            'allegation_id', _allegation_id, 'relationship_type', v_type);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_evidence_unlink_allegation(_evidence_id uuid, _allegation_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_complaint uuid;
BEGIN
  SELECT complaint_id INTO v_complaint FROM public.complaint_evidence WHERE id=_evidence_id;
  IF v_complaint IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(v_complaint,'investigate');
  DELETE FROM public.complaint_evidence_allegations
   WHERE evidence_id=_evidence_id AND allegation_id=_allegation_id;
  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, to_state, rationale, actor_id)
  VALUES (_allegation_id, v_complaint, 'EVIDENCE_UNLINKED',
          jsonb_build_object('evidence_id',_evidence_id), _reason, v_uid);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ---------- RFI convergence ----------
CREATE OR REPLACE FUNCTION public.complaint_rfi_link_allegation(_rfi_id uuid, _allegation_id uuid, _link boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); r public.complaint_rfis; a public.complaint_allegations;
BEGIN
  SELECT * INTO r FROM public.complaint_rfis WHERE id=_rfi_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Information request not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM public.complaint_allegations WHERE id=_allegation_id;
  IF a.id IS NULL OR a.complaint_id <> r.complaint_id THEN
    RAISE EXCEPTION 'Allegation does not belong to this complaint' USING ERRCODE='22023'; END IF;
  PERFORM public.mc03_guard(r.complaint_id,'investigate');
  IF _link THEN
    INSERT INTO public.complaint_rfi_allegations (rfi_id, allegation_id)
    VALUES (_rfi_id,_allegation_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.complaint_rfi_allegations WHERE rfi_id=_rfi_id AND allegation_id=_allegation_id;
  END IF;
  RETURN jsonb_build_object('rfi_id',_rfi_id,'allegation_id',_allegation_id,'linked',_link);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_rfi_finalize_evidence(_rfi_id uuid, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); r public.complaint_rfis; rec record; v_created int := 0; v_ev jsonb;
        v_conf text := coalesce(nullif(upper(btrim(coalesce(_payload->>'confidentiality',''))),''),'INTERNAL');
BEGIN
  SELECT * INTO r FROM public.complaint_rfis WHERE id=_rfi_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Information request not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(r.complaint_id,'investigate');

  FOR rec IN
    SELECT resp.id AS response_id, resp.file_upload_id, fu.file_name, fu.metadata
      FROM public.complaint_rfi_responses resp
      JOIN public.complaint_rfi_items it ON it.id = resp.item_id
      LEFT JOIN public.file_uploads fu ON fu.id = resp.file_upload_id
     WHERE it.rfi_id = _rfi_id AND resp.file_upload_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.complaint_evidence e
                        WHERE e.complaint_id = r.complaint_id AND e.file_upload_id = resp.file_upload_id)
  LOOP
    v_ev := public.complaint_evidence_register(r.complaint_id, jsonb_build_object(
      'file_upload_id', rec.file_upload_id,
      'label', coalesce(rec.file_name,'Information request attachment'),
      'description', 'Received in response to information request ' || coalesce(r.summary,''),
      'source_type','REGULATED_ENTITY',
      'source_record_type','complaint_rfi',
      'source_record_id', _rfi_id,
      'received_from', 'Regulated entity response',
      'document_type','RFI_ATTACHMENT',
      'confidentiality', v_conf,
      'content_hash', rec.metadata->>'content_hash',
      'acquisition_method','RFI_RESPONSE'));
    v_created := v_created + 1;

    INSERT INTO public.complaint_evidence_allegations (evidence_id, allegation_id, relationship_type, linked_by)
    SELECT (v_ev->>'id')::uuid, ra.allegation_id, 'UNDETERMINED', v_uid
      FROM public.complaint_rfi_allegations ra WHERE ra.rfi_id = _rfi_id
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.complaint_rfis
     SET evidence_finalized_at = now(),
         completeness_review = COALESCE(_payload->>'completeness_review', completeness_review),
         investigator_disposition = COALESCE(_payload->>'investigator_disposition', investigator_disposition),
         updated_at = now()
   WHERE id=_rfi_id;

  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.rfi.evidence_finalized','complaint',r.complaint_id,
          jsonb_build_object('rfi_id',_rfi_id,'evidence_created',v_created));
  RETURN jsonb_build_object('rfi_id',_rfi_id,'evidence_created',v_created);
END; $$;

-- ---------- formal representations ----------
CREATE OR REPLACE FUNCTION public.complaint_representation_open(_complaint_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; rep public.complaint_representations;
        v_due timestamptz := nullif(_payload->>'due_at','')::timestamptz; v_alleg uuid;
BEGIN
  c := public.mc03_guard(_complaint_id,'investigate');
  PERFORM public.mc03_require_gate(_complaint_id);
  IF v_due IS NULL THEN
    RAISE EXCEPTION 'Set the date by which the representation is due (from policy or your own direction)' USING ERRCODE='22023'; END IF;
  IF v_due <= now() THEN
    RAISE EXCEPTION 'The representation deadline must be in the future' USING ERRCODE='22023'; END IF;

  INSERT INTO public.complaint_representations
    (complaint_id, regulator_id, respondent_id, licensee_id, representing_party, representation_type,
     invitation_reference, invitation_summary, invited_at, window_opens_at, due_at, status, created_by)
  VALUES (_complaint_id, c.regulator_id, nullif(_payload->>'respondent_id','')::uuid,
     coalesce(nullif(_payload->>'licensee_id','')::uuid, c.licensee_id),
     _payload->>'representing_party',
     coalesce(nullif(_payload->>'representation_type',''),'ALLEGATION_RESPONSE'),
     coalesce(nullif(_payload->>'invitation_reference',''),
              coalesce(c.complaint_number,'CMP') || '-REP-' ||
              lpad(((SELECT count(*) FROM public.complaint_representations WHERE complaint_id=_complaint_id)+1)::text,2,'0')),
     _payload->>'invitation_summary', now(),
     coalesce(nullif(_payload->>'window_opens_at','')::timestamptz, now()), v_due,
     CASE WHEN coalesce((_payload->>'as_draft')::boolean,false) THEN 'DRAFT_INVITATION' ELSE 'OPEN' END, v_uid)
  RETURNING * INTO rep;

  FOR v_alleg IN SELECT (jsonb_array_elements_text(coalesce(_payload->'allegation_ids','[]'::jsonb)))::uuid LOOP
    IF EXISTS (SELECT 1 FROM public.complaint_allegations WHERE id=v_alleg AND complaint_id=_complaint_id) THEN
      INSERT INTO public.complaint_representation_allegations (representation_id, allegation_id)
      VALUES (rep.id, v_alleg) ON CONFLICT DO NOTHING;
    ELSE
      RAISE EXCEPTION 'Allegation does not belong to this complaint' USING ERRCODE='22023';
    END IF;
  END LOOP;

  INSERT INTO public.complaint_representation_events (representation_id, complaint_id, event_type, detail, actor_id)
  VALUES (rep.id, _complaint_id, 'WINDOW_OPENED',
          jsonb_build_object('due_at',rep.due_at,'status',rep.status), v_uid);
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.representation.invited','complaint',_complaint_id,
          jsonb_build_object('representation_id',rep.id,'due_at',rep.due_at));
  RETURN to_jsonb(rep);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_representation_extend(
  _representation_id uuid, _new_due_at timestamptz, _reason text, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); rep public.complaint_representations;
BEGIN
  SELECT * INTO rep FROM public.complaint_representations WHERE id=_representation_id FOR UPDATE;
  IF rep.id IS NULL THEN RAISE EXCEPTION 'Representation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(rep.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> rep.row_version THEN
    RAISE EXCEPTION 'This representation has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF rep.status NOT IN ('OPEN','LATE_REVIEW_REQUIRED') THEN
    RAISE EXCEPTION 'Only an open representation window can be extended' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Record why the deadline is being extended (at least 10 characters)' USING ERRCODE='22023'; END IF;
  IF _new_due_at <= coalesce(rep.extended_due_at, rep.due_at) THEN
    RAISE EXCEPTION 'The new deadline must be later than the current one' USING ERRCODE='22023'; END IF;

  UPDATE public.complaint_representations
     SET extended_due_at=_new_due_at, extension_reason=btrim(_reason), status='OPEN',
         row_version=row_version+1, updated_at=now()
   WHERE id=_representation_id RETURNING * INTO rep;
  INSERT INTO public.complaint_representation_events (representation_id, complaint_id, event_type, detail, actor_id)
  VALUES (rep.id, rep.complaint_id, 'EXTENSION_GRANTED',
          jsonb_build_object('extended_due_at',_new_due_at,'reason',btrim(_reason)), v_uid);
  RETURN to_jsonb(rep);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_representation_submit(
  _representation_id uuid, _narrative text, _file_upload_ids uuid[] DEFAULT NULL, _confidentiality_claim text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); rep public.complaint_representations; v_effective_due timestamptz;
        v_late boolean; v_file uuid; v_ev jsonb; v_is_entity boolean; v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO rep FROM public.complaint_representations WHERE id=_representation_id FOR UPDATE;
  IF rep.id IS NULL THEN RAISE EXCEPTION 'Representation not found' USING ERRCODE='P0002'; END IF;
  IF rep.status <> 'OPEN' THEN
    RAISE EXCEPTION 'This representation window is not open for submission' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(coalesce(_narrative,''))),0) < 20 THEN
    RAISE EXCEPTION 'Please provide your written representation (at least 20 characters)' USING ERRCODE='22023'; END IF;

  v_is_entity := rep.licensee_id IS NOT NULL AND public.can_current_user_access_licensee(rep.licensee_id, NULL::uuid);
  v_is_staff  := public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'investigate');
  IF NOT v_is_entity THEN
    RAISE EXCEPTION 'not_authorized: only the invited party may submit this representation' USING ERRCODE='42501';
  END IF;

  v_effective_due := coalesce(rep.extended_due_at, rep.due_at);
  v_late := now() > v_effective_due;

  UPDATE public.complaint_representations
     SET narrative=btrim(_narrative), confidentiality_claim=_confidentiality_claim,
         submitted_at=now(), submitted_by=v_uid, is_late=v_late,
         status = CASE WHEN v_late THEN 'LATE_REVIEW_REQUIRED' ELSE 'SUBMITTED' END,
         row_version=row_version+1, updated_at=now()
   WHERE id=_representation_id RETURNING * INTO rep;

  IF _file_upload_ids IS NOT NULL THEN
    FOREACH v_file IN ARRAY _file_upload_ids LOOP
      INSERT INTO public.complaint_evidence
        (complaint_id, file_upload_id, label, description, uploaded_by, evidence_reference,
         source_type, source_party, source_record_type, source_record_id, received_at, received_from,
         document_type, confidentiality, custodian_id, acquisition_method, finalized_at)
      VALUES (rep.complaint_id, v_file,
        coalesce((SELECT file_name FROM public.file_uploads WHERE id=v_file),'Representation attachment'),
        'Attached to formal representation ' || coalesce(rep.invitation_reference,''), v_uid,
        coalesce(rep.invitation_reference,'REP') || '-ATT-' ||
          lpad(((SELECT count(*) FROM public.complaint_evidence
                  WHERE source_record_id=rep.id AND source_record_type='complaint_representation')+1)::text,2,'0'),
        'REGULATED_ENTITY', rep.representing_party, 'complaint_representation', rep.id, now(),
        'Formal representation', 'REPRESENTATION_ATTACHMENT', 'INTERNAL', v_uid, 'REPRESENTATION', now());

      INSERT INTO public.complaint_evidence_allegations (evidence_id, allegation_id, relationship_type, linked_by)
      SELECT e.id, ra.allegation_id, 'UNDETERMINED', v_uid
        FROM public.complaint_evidence e
        JOIN public.complaint_representation_allegations ra ON ra.representation_id = rep.id
       WHERE e.file_upload_id = v_file AND e.source_record_id = rep.id
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.complaint_representation_events
    (representation_id, complaint_id, event_type, detail, narrative_snapshot, actor_id)
  VALUES (rep.id, rep.complaint_id, 'SUBMITTED',
          jsonb_build_object('is_late',v_late,'effective_due_at',v_effective_due), rep.narrative, v_uid);
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.representation.received','complaint',rep.complaint_id,
          jsonb_build_object('representation_id',rep.id,'is_late',v_late));
  RETURN to_jsonb(rep);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_representation_late_decision(
  _representation_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); rep public.complaint_representations; v_dec text := upper(btrim(coalesce(_decision,'')));
BEGIN
  SELECT * INTO rep FROM public.complaint_representations WHERE id=_representation_id FOR UPDATE;
  IF rep.id IS NULL THEN RAISE EXCEPTION 'Representation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(rep.complaint_id,'investigate');
  IF NOT (public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'approve')
          OR public.has_complaint_perm(v_uid,'override_triage')) THEN
    RAISE EXCEPTION 'not_authorized: deciding on a late representation requires review authority' USING ERRCODE='42501'; END IF;
  IF v_dec NOT IN ('ACCEPT','REJECT') THEN
    RAISE EXCEPTION 'Choose whether the late representation is accepted or rejected' USING ERRCODE='22023'; END IF;
  IF rep.status <> 'LATE_REVIEW_REQUIRED' THEN
    RAISE EXCEPTION 'This representation is not awaiting a late-submission decision' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Record the reason for the late-submission decision (at least 10 characters)' USING ERRCODE='22023'; END IF;

  UPDATE public.complaint_representations
     SET late_decision=v_dec, late_decision_reason=btrim(_reason),
         status = CASE WHEN v_dec='ACCEPT' THEN 'SUBMITTED' ELSE 'CLOSED' END,
         closed_at = CASE WHEN v_dec='REJECT' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN v_dec='REJECT' THEN v_uid ELSE closed_by END,
         row_version=row_version+1, updated_at=now()
   WHERE id=_representation_id RETURNING * INTO rep;
  INSERT INTO public.complaint_representation_events (representation_id, complaint_id, event_type, detail, actor_id)
  VALUES (rep.id, rep.complaint_id, 'LATE_DECISION',
          jsonb_build_object('decision',v_dec,'reason',btrim(_reason)), v_uid);
  RETURN to_jsonb(rep);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_representation_review(
  _representation_id uuid, _decision text, _note text, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); rep public.complaint_representations; v_dec text := upper(btrim(coalesce(_decision,'')));
BEGIN
  SELECT * INTO rep FROM public.complaint_representations WHERE id=_representation_id FOR UPDATE;
  IF rep.id IS NULL THEN RAISE EXCEPTION 'Representation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(rep.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> rep.row_version THEN
    RAISE EXCEPTION 'This representation has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF rep.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Only a submitted representation can be reviewed' USING ERRCODE='22023'; END IF;
  IF v_dec NOT IN ('UNDER_REVIEW','ACCEPT_FOR_CONSIDERATION') THEN
    RAISE EXCEPTION 'Invalid review outcome' USING ERRCODE='22023'; END IF;

  UPDATE public.complaint_representations
     SET status = CASE WHEN v_dec='UNDER_REVIEW' THEN 'UNDER_REVIEW' ELSE 'ACCEPTED_FOR_CONSIDERATION' END,
         accepted_for_consideration = (v_dec='ACCEPT_FOR_CONSIDERATION'),
         reviewer_id=v_uid, reviewed_at=now(), review_note=_note,
         row_version=row_version+1, updated_at=now()
   WHERE id=_representation_id RETURNING * INTO rep;
  INSERT INTO public.complaint_representation_events (representation_id, complaint_id, event_type, detail, actor_id)
  VALUES (rep.id, rep.complaint_id, 'REVIEWED', jsonb_build_object('decision',v_dec,'note',_note), v_uid);
  RETURN to_jsonb(rep);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_representation_close(_representation_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); rep public.complaint_representations;
BEGIN
  SELECT * INTO rep FROM public.complaint_representations WHERE id=_representation_id FOR UPDATE;
  IF rep.id IS NULL THEN RAISE EXCEPTION 'Representation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(rep.complaint_id,'investigate');
  IF rep.status IN ('CLOSED','WITHDRAWN') THEN
    RAISE EXCEPTION 'This representation is already closed' USING ERRCODE='22023'; END IF;
  UPDATE public.complaint_representations
     SET status='CLOSED', closed_at=now(), closed_by=v_uid,
         review_note=COALESCE(_note, review_note), row_version=row_version+1, updated_at=now()
   WHERE id=_representation_id RETURNING * INTO rep;
  INSERT INTO public.complaint_representation_events (representation_id, complaint_id, event_type, detail, actor_id)
  VALUES (rep.id, rep.complaint_id, 'CLOSED', jsonb_build_object('note',_note), v_uid);
  RETURN to_jsonb(rep);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_representation_withdraw(_representation_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); rep public.complaint_representations;
BEGIN
  SELECT * INTO rep FROM public.complaint_representations WHERE id=_representation_id FOR UPDATE;
  IF rep.id IS NULL THEN RAISE EXCEPTION 'Representation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(rep.complaint_id,'investigate');
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Explain why the representation request is being withdrawn (at least 10 characters)' USING ERRCODE='22023'; END IF;
  IF rep.status = 'SUBMITTED' OR rep.status = 'ACCEPTED_FOR_CONSIDERATION' THEN
    RAISE EXCEPTION 'A submitted representation forms part of the record and cannot be withdrawn' USING ERRCODE='22023'; END IF;
  UPDATE public.complaint_representations
     SET status='WITHDRAWN', closed_at=now(), closed_by=v_uid, review_note=btrim(_reason),
         row_version=row_version+1, updated_at=now()
   WHERE id=_representation_id RETURNING * INTO rep;
  INSERT INTO public.complaint_representation_events (representation_id, complaint_id, event_type, detail, actor_id)
  VALUES (rep.id, rep.complaint_id, 'WITHDRAWN', jsonb_build_object('reason',btrim(_reason)), v_uid);
  RETURN to_jsonb(rep);
END; $$;
