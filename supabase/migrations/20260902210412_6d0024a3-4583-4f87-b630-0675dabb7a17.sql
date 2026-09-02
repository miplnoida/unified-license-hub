-- Epic 3: canonical supervisory finding / remediation as governed enforcement sources.
ALTER TABLE public.enforcement_actions DROP CONSTRAINT IF EXISTS enforcement_actions_source_kind_chk;
ALTER TABLE public.enforcement_actions ADD CONSTRAINT enforcement_actions_source_kind_chk
  CHECK (source_kind IS NULL OR source_kind = ANY (ARRAY[
    'COMPLAINT','CONDUCT_INVESTIGATION','THEMATIC_FINDING','PRUDENTIAL_BREACH','PRUDENTIAL_ACTION',
    'EXAMINATION_FINDING','LICENSING_VIOLATION','FP_MATTER','MANUAL_REFERRAL',
    'SUPERVISORY_FINDING','SUPERVISORY_REMEDIATION']));

CREATE OR REPLACE FUNCTION public.enforcement_resolve_source(_kind text, _id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF _kind IS NULL OR _id IS NULL THEN
    RAISE EXCEPTION 'Source kind and source record are both required' USING ERRCODE = '22023';
  END IF;

  CASE _kind
    WHEN 'COMPLAINT' THEN
      SELECT jsonb_build_object('entity_id', c.licensee_id, 'reference', c.complaint_number,
             'title', c.subject, 'href', '/complaints/' || c.id, 'domain', 'complaint_management')
        INTO r FROM complaints c WHERE c.id = _id;
    WHEN 'CONDUCT_INVESTIGATION' THEN
      SELECT jsonb_build_object('entity_id', i.licensee_id, 'reference', i.code,
             'title', i.allegation, 'href', '/conduct/investigations/' || i.id, 'domain', 'market_conduct')
        INTO r FROM conduct_investigations i WHERE i.id = _id;
    WHEN 'THEMATIC_FINDING' THEN
      SELECT jsonb_build_object('entity_id', f.licensee_id, 'reference', left(f.id::text, 8),
             'title', f.title, 'href', '/supervision/thematic-reviews/' || f.review_id, 'domain', 'market_conduct')
        INTO r FROM thematic_review_findings f WHERE f.id = _id;
    WHEN 'PRUDENTIAL_BREACH' THEN
      SELECT jsonb_build_object('entity_id', b.entity_id, 'reference', b.metric_key,
             'title', 'Threshold breach: ' || b.metric_key,
             'href', CASE WHEN b.return_filing_id IS NOT NULL
                          THEN '/returns/filings/' || b.return_filing_id ELSE '/supervision/breaches' END,
             'domain', 'prudential_supervision')
        INTO r FROM return_threshold_breaches b WHERE b.id = _id;
    WHEN 'PRUDENTIAL_ACTION' THEN
      SELECT jsonb_build_object('entity_id', a.entity_id, 'reference', a.action_reference,
             'title', a.title, 'href', '/prudential/actions', 'domain', 'prudential_supervision')
        INTO r FROM prudential_actions a WHERE a.id = _id;
    WHEN 'EXAMINATION_FINDING' THEN
      SELECT jsonb_build_object('entity_id', e.entity_id, 'reference', f.reference,
             'title', f.title, 'href', '/prudential/examinations/' || e.id, 'domain', 'prudential_supervision')
        INTO r FROM examination_findings f JOIN examinations e ON e.id = f.examination_id WHERE f.id = _id;
    WHEN 'LICENSING_VIOLATION' THEN
      SELECT jsonb_build_object('entity_id', ap.entity_id, 'reference', ap.application_number,
             'title', 'Licensing matter ' || ap.application_number,
             'href', '/applications/' || ap.id, 'domain', 'license_management')
        INTO r FROM applications ap WHERE ap.id = _id;
    WHEN 'FP_MATTER' THEN
      SELECT jsonb_build_object('entity_id', fa.licensee_id, 'reference', left(fa.id::text, 8),
             'title', 'Fit and proper matter', 'href', '/fpa/assessments/' || fa.id, 'domain', 'fit_and_proper')
        INTO r FROM fp_assessments fa WHERE fa.id = _id;
    WHEN 'MANUAL_REFERRAL' THEN
      SELECT jsonb_build_object('entity_id', l.id, 'reference', NULL::text,
             'title', 'Manual enforcement referral', 'href', '/entities/' || l.id,
             'domain', 'enforcement_management')
        INTO r FROM licensees l WHERE l.id = _id;
    -- Epic 3: canonical supervisory spine. The entity is ALWAYS taken from the
    -- canonical record; a client-supplied entity is never trusted.
    WHEN 'SUPERVISORY_FINDING' THEN
      SELECT jsonb_build_object('entity_id', f.entity_id, 'reference', f.reference,
             'title', f.title, 'href', '/supervision/findings/' || f.id,
             'domain', CASE f.domain_code
                         WHEN 'AML_CFT' THEN 'aml_supervision'
                         WHEN 'PRUDENTIAL' THEN 'prudential_supervision'
                         WHEN 'MARKET_CONDUCT' THEN 'market_conduct'
                         ELSE 'enforcement_management' END,
             'domain_code', f.domain_code, 'severity', lower(f.severity),
             'finding_id', f.id, 'assessment_id', f.assessment_id, 'status', f.status)
        INTO r FROM public.supervisory_finding f WHERE f.id = _id;
    WHEN 'SUPERVISORY_REMEDIATION' THEN
      SELECT jsonb_build_object('entity_id', ra.entity_id, 'reference', ra.reference,
             'title', 'Unresolved corrective action ' || ra.reference,
             'href', '/supervision/findings/' || ra.finding_id,
             'domain', CASE ra.domain_code
                         WHEN 'AML_CFT' THEN 'aml_supervision'
                         WHEN 'PRUDENTIAL' THEN 'prudential_supervision'
                         WHEN 'MARKET_CONDUCT' THEN 'market_conduct'
                         ELSE 'enforcement_management' END,
             'domain_code', ra.domain_code, 'severity', lower(f.severity),
             'finding_id', ra.finding_id, 'remediation_action_id', ra.id,
             'assessment_id', f.assessment_id, 'status', ra.status)
        INTO r FROM public.supervisory_remediation_action ra
        JOIN public.supervisory_finding f ON f.id = ra.finding_id
       WHERE ra.id = _id;
    ELSE
      RAISE EXCEPTION 'Unsupported enforcement source kind %', _kind USING ERRCODE = '22023';
  END CASE;

  IF r IS NULL THEN
    RAISE EXCEPTION 'Referred % record was not found', _kind USING ERRCODE = 'P0002';
  END IF;
  IF (r->>'entity_id') IS NULL THEN
    RAISE EXCEPTION 'Referred % record is not linked to a regulated entity', _kind USING ERRCODE = '22023';
  END IF;
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforcement_referral_create(_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := upper(nullif(btrim(_payload->>'source_kind'), ''));
  v_src uuid := nullif(_payload->>'source_id','')::uuid;
  v_reason text := nullif(btrim(_payload->>'referral_reason'), '');
  v_resolved jsonb;
  v_entity uuid;
  v_case uuid;
  v_number text;
  v_domain text;
  v_spine boolean;
  v_finding uuid;
  v_remediation uuid;
  v_assessment uuid;
  v_bypass text := nullif(btrim(_payload->>'remediation_bypass_reason'), '');
  v_claim uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 20 THEN
    RAISE EXCEPTION 'A referral reason of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  v_resolved := public.enforcement_resolve_source(v_kind, v_src);
  v_entity := (v_resolved->>'entity_id')::uuid;
  v_domain := v_resolved->>'domain';
  v_spine := v_kind IN ('SUPERVISORY_FINDING','SUPERVISORY_REMEDIATION');

  IF v_spine THEN
    -- A supervisory consequence is an Enforcement decision: seeing the finding is
    -- never sufficient authority to open an enforcement case.
    IF NOT (public.has_permission(v_uid, 'enforcement_management', 'refer')
            OR public.has_permission(v_uid, 'enforcement_management', 'create')
            OR public.is_super_admin(v_uid)) THEN
      RAISE EXCEPTION 'Enforcement referral authority is required to refer a supervisory finding'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    public.has_permission(v_uid, 'enforcement_management', 'refer')
    OR public.has_permission(v_uid, 'enforcement_management', 'create')
    OR public.has_permission(v_uid, v_domain, 'workflow_action')
    OR public.has_permission(v_uid, v_domain, 'approve')
  ) THEN
    RAISE EXCEPTION 'You are not authorised to refer this matter to Enforcement' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM enforcement_actions ea
              WHERE ea.source_kind = v_kind AND ea.source_id = v_src
                AND ea.stage NOT IN ('CLOSED','WITHDRAWN')) THEN
    RAISE EXCEPTION 'An open enforcement case already exists for this source record' USING ERRCODE = '23505';
  END IF;

  IF v_spine THEN
    v_finding := (v_resolved->>'finding_id')::uuid;
    v_assessment := nullif(v_resolved->>'assessment_id','')::uuid;
    v_remediation := nullif(v_resolved->>'remediation_action_id','')::uuid;

    -- provenance is derived, never asserted by the caller
    v_claim := nullif(_payload->>'supervisory_finding_id','')::uuid;
    IF v_claim IS NOT NULL AND v_claim <> v_finding THEN
      RAISE EXCEPTION 'The supplied supervisory finding does not match the referred source record'
        USING ERRCODE = '22023';
    END IF;
    v_claim := nullif(_payload->>'entity_id','')::uuid;
    IF v_claim IS NOT NULL AND v_claim <> v_entity THEN
      RAISE EXCEPTION 'The regulated entity is derived from the canonical finding and cannot be overridden'
        USING ERRCODE = '22023';
    END IF;

    IF v_remediation IS NULL THEN
      SELECT ra.id INTO v_remediation FROM public.supervisory_remediation_action ra
       WHERE ra.finding_id = v_finding
       ORDER BY (ra.status IN ('INEFFECTIVE','PARTIALLY_EFFECTIVE','REOPENED')) DESC, ra.created_at DESC
       LIMIT 1;
    END IF;

    -- remediation was never attempted: an immediate consequence needs a written basis
    IF v_remediation IS NULL AND (v_bypass IS NULL OR length(v_bypass) < 20) THEN
      RAISE EXCEPTION 'A remediation bypass rationale of at least 20 characters is required when a finding is referred without a corrective action'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_number := public.enforcement_next_case_number();

  INSERT INTO enforcement_actions (
    entity_id, case_number, enforcement_type, date_opened, status, stage,
    source_kind, source_id, source_reference, referred_by, referred_at, referral_reason,
    legal_basis, description, severity, assigned_to, assigned_team, opened_by, review_state,
    supervisory_finding_id, remediation_action_id, supervisory_assessment_id, remediation_bypass_reason
  ) VALUES (
    v_entity, v_number,
    coalesce(nullif(btrim(_payload->>'enforcement_type'), ''), 'regulatory_action'),
    CURRENT_DATE, 'referred', 'REFERRAL',
    v_kind, v_src, v_resolved->>'reference', v_uid, now(), v_reason,
    nullif(btrim(_payload->>'legal_basis'), ''),
    coalesce(nullif(btrim(_payload->>'description'), ''), v_resolved->>'title'),
    coalesce(nullif(btrim(_payload->>'severity'), ''),
             CASE WHEN v_spine AND (v_resolved->>'severity') IN ('critical','high','medium','low')
                  THEN v_resolved->>'severity' ELSE 'medium' END),
    nullif(_payload->>'assigned_to','')::uuid,
    nullif(btrim(_payload->>'assigned_team'), ''),
    v_uid, 'proposed',
    v_finding, v_remediation, v_assessment,
    CASE WHEN v_spine AND v_remediation IS NULL THEN v_bypass ELSE NULL END
  ) RETURNING id INTO v_case;

  INSERT INTO enforcement_case_events (case_id, event_type, actor_id, note, detail)
  VALUES (v_case, 'REFERRAL_RECEIVED', v_uid, v_reason,
          jsonb_build_object('source_kind', v_kind, 'source_id', v_src,
                             'source_reference', v_resolved->>'reference',
                             'source_href', v_resolved->>'href', 'to_stage', 'REFERRAL',
                             'supervisory_finding_id', v_finding,
                             'remediation_action_id', v_remediation,
                             'supervisory_assessment_id', v_assessment));

  PERFORM public.log_compliance_audit_as_actor(
    v_uid, 'CREATE'::compliance_audit_action, 'enforcement_actions', v_case::text,
    NULL, jsonb_build_object('case_number', v_number, 'stage', 'REFERRAL',
                             'source_kind', v_kind, 'source_id', v_src, 'entity_id', v_entity,
                             'supervisory_finding_id', v_finding,
                             'remediation_action_id', v_remediation,
                             'supervisory_assessment_id', v_assessment),
    v_reason, NULL, NULL, NULL, jsonb_build_object('process', 'P11', 'action', 'REFER'));

  RETURN v_case;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforcement_referral_create(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforcement_resolve_source(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_referral_create(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforcement_resolve_source(text, uuid) TO authenticated, service_role;