-- ============================================================
-- MC-01: governed intake RPC layer
-- ============================================================

-- ---------- 1. contact-aware validation in the canonical rule engine ----------
CREATE OR REPLACE FUNCTION public.complaint_intake_decide(_variant text, _regulator_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variant text := lower(coalesce(_variant,'internal'));
  v_rules public.complaint_intake_rules%ROWTYPE;
  v_default_rules public.complaint_intake_rules%ROWTYPE;
  v_subject text := btrim(coalesce(_payload->>'subject',''));
  v_desc    text := btrim(coalesce(_payload->>'description',''));
  v_email   text := NULLIF(_payload->>'email','');
  v_anon boolean := coalesce((_payload->>'anonymous')::boolean, false);
  v_vuln boolean := coalesce((_payload->>'vulnerability_indicator')::boolean, false);
  v_vuln_notes text := NULLIF(_payload->>'vulnerability_notes','');
  v_vuln_cat text := NULLIF(_payload->>'vulnerability_category','');
  v_contact jsonb := coalesce(_payload->'contact_preference','{}'::jsonb);
  v_method text := lower(coalesce(NULLIF(v_contact->>'preferred_method',''),
                                  NULLIF(_payload->>'preferred_contact_method',''),''));
  v_c_email text := NULLIF(btrim(coalesce(v_contact->>'email', _payload->>'email','')),'');
  v_c_phone text := NULLIF(btrim(coalesce(v_contact->>'phone', _payload->>'phone','')),'');
  v_c_addr  text := NULLIF(btrim(coalesce(v_contact->>'postal_address_line1','')),'');
  v_cfg public.complaint_public_intake_config%ROWTYPE;
  v_sev text;
  v_prio text;
  v_intake text := NULLIF(_payload->>'intake_source','');
  v_errors jsonb := '[]'::jsonb;
  v_field text;
  v_structured boolean := (_payload ? 'contact_preference') OR (_payload ? 'respondents') OR (_payload ? 'parties');
BEGIN
  SELECT * INTO v_rules FROM public.complaint_intake_rules
   WHERE variant = v_variant
     AND (regulator_id = _regulator_id OR (regulator_id IS NULL))
   ORDER BY regulator_id NULLS LAST
   LIMIT 1;

  IF v_rules.id IS NULL THEN
    v_rules.required_fields := ARRAY['subject','description'];
    v_rules.allow_anonymous := (v_variant = 'public');
  END IF;

  SELECT * INTO v_cfg FROM public.complaint_public_intake_config
   WHERE regulator_id = _regulator_id OR regulator_id IS NULL
   ORDER BY regulator_id NULLS LAST LIMIT 1;

  v_sev := v_rules.default_severity;
  IF v_sev IS NULL THEN
    SELECT * INTO v_default_rules FROM public.complaint_intake_rules
      WHERE regulator_id IS NULL AND default_severity IS NOT NULL
      ORDER BY variant LIMIT 1;
    v_sev := v_default_rules.default_severity;
  END IF;
  v_sev := coalesce(v_sev, 'medium');

  IF v_variant IN ('public','licensee') THEN
    v_prio := 'p3';
  ELSE
    v_prio := coalesce(NULLIF(_payload->>'priority',''),'p3');
  END IF;

  IF v_subject = '' OR length(v_subject) < 3 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','subject','message','Please give a short summary of your complaint.');
  END IF;
  IF v_desc = '' OR length(v_desc) < 10 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','description','message','Please describe what happened.');
  END IF;

  FOREACH v_field IN ARRAY coalesce(v_rules.required_fields, ARRAY[]::text[]) LOOP
    IF v_field IN ('subject','description','severity') THEN CONTINUE; END IF;
    -- structured MC-01 payloads carry contact details in contact_preference
    IF v_structured AND v_field IN ('email','licensee_id') THEN CONTINUE; END IF;
    IF NULLIF(_payload->>v_field,'') IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','required','field',v_field,'message',v_field||' is required');
    END IF;
  END LOOP;

  IF v_vuln AND v_vuln_notes IS NULL AND v_vuln_cat IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','vulnerability_notes','message','Provide vulnerability notes or category when marked vulnerable');
  END IF;

  -- Contact-method aware validation (public + licensee structured intake)
  IF v_variant = 'public' AND v_anon = false THEN
    IF v_structured THEN
      IF v_method = '' OR v_method NOT IN ('email','phone','post') THEN
        v_errors := v_errors || jsonb_build_object('code','required','field','preferred_method','message','Tell us how you would like us to contact you.');
      ELSIF v_method = 'email' AND v_c_email IS NULL THEN
        v_errors := v_errors || jsonb_build_object('code','required','field','email','message','An email address is required for email contact.');
      ELSIF v_method = 'phone' AND v_c_phone IS NULL THEN
        v_errors := v_errors || jsonb_build_object('code','required','field','phone','message','A phone number is required for phone contact.');
      ELSIF v_method = 'post' AND v_c_addr IS NULL THEN
        v_errors := v_errors || jsonb_build_object('code','required','field','postal_address_line1','message','A postal address is required for contact by post.');
      END IF;
    ELSIF v_email IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','required','field','email','message','Email required unless anonymous is checked');
    END IF;
  END IF;

  IF v_variant = 'public' AND v_anon = true
     AND NOT coalesce(v_cfg.allow_anonymous, v_rules.allow_anonymous, true) THEN
    v_errors := v_errors || jsonb_build_object('code','forbidden','field','anonymous','message','Anonymous submission is not permitted');
  END IF;

  IF v_intake IS NULL THEN
    v_intake := CASE v_variant
      WHEN 'public'   THEN 'consumer_portal'
      WHEN 'licensee' THEN 'licensee_portal'
      WHEN 'internal' THEN 'internal'
      WHEN 'staff'    THEN 'staff_intake'
    END;
  END IF;

  RETURN jsonb_build_object(
    'variant', v_variant,
    'rule_id', v_rules.id,
    'required_fields', to_jsonb(coalesce(v_rules.required_fields, ARRAY[]::text[])),
    'allow_anonymous', coalesce(v_cfg.allow_anonymous, v_rules.allow_anonymous, true),
    'allow_confidential', coalesce(v_cfg.allow_confidential, true),
    'max_attachments', coalesce(v_cfg.max_attachments, v_rules.max_attachments),
    'severity', v_sev,
    'severity_source', 'intake_default',
    'priority', v_prio,
    'intake_source', v_intake,
    'errors', v_errors
  );
END;
$function$;

-- ---------- 2. structured persistence helper ----------
CREATE OR REPLACE FUNCTION public.complaint_intake_persist_structured(
  _complaint_id uuid, _variant text, _payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_cfg public.complaint_public_intake_config%ROWTYPE;
  v_item jsonb;
  v_contact jsonb := _payload->'contact_preference';
  v_support jsonb := _payload->'support_declaration';
  v_details jsonb := _payload->'intake_details';
  v_reg uuid;
  v_primary_licensee uuid;
  v_primary_name text;
  v_code text;
  v_code_hash text;
  v_first boolean := true;
  v_source text := CASE WHEN lower(coalesce(_variant,'')) IN ('internal','staff') THEN 'staff_entered' ELSE 'consumer_declared' END;
BEGIN
  SELECT * INTO v_cfg FROM public.complaint_public_intake_config
   WHERE regulator_id IS NULL ORDER BY created_at LIMIT 1;

  -- ---- parties ----
  IF jsonb_typeof(_payload->'parties') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_payload->'parties') LOOP
      INSERT INTO public.complaint_parties (
        complaint_id, party_role, party_type, is_primary_contact, full_name, business_name,
        position_or_title, relationship_to_consumer, authority_basis, authority_confirmed,
        email, phone, confidentiality, information_source, notes
      ) VALUES (
        _complaint_id,
        coalesce(NULLIF(v_item->>'party_role',''),'complainant'),
        coalesce(NULLIF(v_item->>'party_type',''),'individual'),
        coalesce((v_item->>'is_primary_contact')::boolean, v_first),
        NULLIF(btrim(coalesce(v_item->>'full_name','')),''),
        NULLIF(btrim(coalesce(v_item->>'business_name','')),''),
        NULLIF(btrim(coalesce(v_item->>'position_or_title','')),''),
        NULLIF(btrim(coalesce(v_item->>'relationship_to_consumer','')),''),
        NULLIF(btrim(coalesce(v_item->>'authority_basis','')),''),
        coalesce((v_item->>'authority_confirmed')::boolean,false),
        NULLIF(btrim(lower(coalesce(v_item->>'email',''))),''),
        NULLIF(btrim(coalesce(v_item->>'phone','')),''),
        coalesce(NULLIF(v_item->>'confidentiality',''),'standard'),
        v_source,
        NULLIF(btrim(coalesce(v_item->>'notes','')),'')
      );
      v_first := false;
    END LOOP;
  END IF;

  -- ---- respondents ----
  IF jsonb_typeof(_payload->'respondents') = 'array' THEN
    v_first := true;
    FOR v_item IN SELECT * FROM jsonb_array_elements(_payload->'respondents') LOOP
      INSERT INTO public.complaint_respondents (
        complaint_id, is_primary, match_state, respondent_role, licensee_id, license_id,
        legal_name, trading_name, website, email, phone, address, country,
        online_reference, service_offered, agent_name,
        related_principal_licensee_id, related_principal_name, consumer_notes, information_source
      ) VALUES (
        _complaint_id,
        coalesce((v_item->>'is_primary')::boolean, v_first),
        coalesce(NULLIF(v_item->>'match_state',''),'PENDING_MATCH'),
        coalesce(NULLIF(v_item->>'respondent_role',''),'provider'),
        NULLIF(v_item->>'licensee_id','')::uuid,
        NULLIF(v_item->>'license_id','')::uuid,
        NULLIF(btrim(coalesce(v_item->>'legal_name','')),''),
        NULLIF(btrim(coalesce(v_item->>'trading_name','')),''),
        NULLIF(btrim(coalesce(v_item->>'website','')),''),
        NULLIF(btrim(lower(coalesce(v_item->>'email',''))),''),
        NULLIF(btrim(coalesce(v_item->>'phone','')),''),
        NULLIF(btrim(coalesce(v_item->>'address','')),''),
        NULLIF(btrim(coalesce(v_item->>'country','')),''),
        NULLIF(btrim(coalesce(v_item->>'online_reference','')),''),
        NULLIF(btrim(coalesce(v_item->>'service_offered','')),''),
        NULLIF(btrim(coalesce(v_item->>'agent_name','')),''),
        NULLIF(v_item->>'related_principal_licensee_id','')::uuid,
        NULLIF(btrim(coalesce(v_item->>'related_principal_name','')),''),
        NULLIF(btrim(coalesce(v_item->>'consumer_notes','')),''),
        v_source
      );
      v_first := false;
    END LOOP;

    SELECT licensee_id, coalesce(legal_name, trading_name)
      INTO v_primary_licensee, v_primary_name
      FROM public.complaint_respondents
     WHERE complaint_id = _complaint_id
     ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  END IF;

  -- ---- contact preference ----
  IF v_contact IS NOT NULL AND jsonb_typeof(v_contact) = 'object' THEN
    INSERT INTO public.complaint_contact_preferences (
      complaint_id, preferred_method, alternative_method, email, phone,
      postal_address_line1, postal_address_line2, city, region, postal_code, country,
      preferred_language, accessibility_needs, safe_contact_instructions, information_source
    ) VALUES (
      _complaint_id,
      lower(coalesce(NULLIF(v_contact->>'preferred_method',''),'email')),
      NULLIF(lower(coalesce(v_contact->>'alternative_method','')),''),
      NULLIF(btrim(lower(coalesce(v_contact->>'email',''))),''),
      NULLIF(btrim(coalesce(v_contact->>'phone','')),''),
      NULLIF(btrim(coalesce(v_contact->>'postal_address_line1','')),''),
      NULLIF(btrim(coalesce(v_contact->>'postal_address_line2','')),''),
      NULLIF(btrim(coalesce(v_contact->>'city','')),''),
      NULLIF(btrim(coalesce(v_contact->>'region','')),''),
      NULLIF(btrim(coalesce(v_contact->>'postal_code','')),''),
      NULLIF(btrim(coalesce(v_contact->>'country','')),''),
      coalesce(NULLIF(btrim(coalesce(v_contact->>'preferred_language','')),''),'English'),
      NULLIF(btrim(coalesce(v_contact->>'accessibility_needs','')),''),
      NULLIF(btrim(coalesce(v_contact->>'safe_contact_instructions','')),''),
      v_source
    )
    ON CONFLICT (complaint_id) DO NOTHING;
  END IF;

  -- ---- self-declared support / vulnerability ----
  IF v_support IS NOT NULL AND jsonb_typeof(v_support) = 'object'
     AND coalesce((v_support->>'support_required')::boolean,false) THEN
    INSERT INTO public.complaint_vulnerability_assessments (
      complaint_id, source, support_required, categories, consumer_notes, staff_review_state
    ) VALUES (
      _complaint_id,
      CASE WHEN v_source = 'staff_entered' THEN 'staff_assessed' ELSE 'self_declared' END,
      true,
      coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(v_support->'categories','[]'::jsonb)) x), '{}'),
      NULLIF(btrim(coalesce(v_support->>'consumer_notes','')),''),
      'pending'
    );
  END IF;

  -- ---- structured intake details ----
  IF v_details IS NOT NULL AND jsonb_typeof(v_details) = 'object' THEN
    INSERT INTO public.complaint_intake_details (
      complaint_id, sector_id, product_id, product_family, product_other, service_description,
      channel_id, channel_code, channel_other, customer_segment,
      incident_date, incident_date_to, is_ongoing, location, transaction_reference,
      amount_involved, currency, amount_disputed, claimed_loss, continuing_loss,
      urgent_funds_access, suspected_fraud,
      raised_with_entity, entity_complaint_reference, raised_with_entity_date,
      raised_with_entity_channel, acknowledgement_received, final_response_received,
      final_response_date, outcome_offered, redress_offered, redress_offered_amount,
      redress_accepted, still_dissatisfied_reason,
      desired_outcomes, desired_outcome_other, desired_amount,
      declaration_accepted, privacy_notice_version, privacy_notice_acknowledged,
      respondent_contact_permitted, information_sharing_acknowledged, declared_at
    ) VALUES (
      _complaint_id,
      NULLIF(v_details->>'sector_id','')::uuid,
      NULLIF(v_details->>'product_id','')::uuid,
      NULLIF(btrim(coalesce(v_details->>'product_family','')),''),
      NULLIF(btrim(coalesce(v_details->>'product_other','')),''),
      NULLIF(btrim(coalesce(v_details->>'service_description','')),''),
      NULLIF(v_details->>'channel_id','')::uuid,
      NULLIF(btrim(coalesce(v_details->>'channel_code','')),''),
      NULLIF(btrim(coalesce(v_details->>'channel_other','')),''),
      NULLIF(btrim(coalesce(v_details->>'customer_segment','')),''),
      NULLIF(v_details->>'incident_date','')::date,
      NULLIF(v_details->>'incident_date_to','')::date,
      coalesce((v_details->>'is_ongoing')::boolean,false),
      NULLIF(btrim(coalesce(v_details->>'location','')),''),
      NULLIF(btrim(coalesce(v_details->>'transaction_reference','')),''),
      NULLIF(v_details->>'amount_involved','')::numeric,
      coalesce(NULLIF(v_details->>'currency',''),'XCD'),
      NULLIF(v_details->>'amount_disputed','')::numeric,
      NULLIF(v_details->>'claimed_loss','')::numeric,
      coalesce((v_details->>'continuing_loss')::boolean,false),
      coalesce((v_details->>'urgent_funds_access')::boolean,false),
      coalesce((v_details->>'suspected_fraud')::boolean,false),
      coalesce((v_details->>'raised_with_entity')::boolean,false),
      NULLIF(btrim(coalesce(v_details->>'entity_complaint_reference','')),''),
      NULLIF(v_details->>'raised_with_entity_date','')::date,
      NULLIF(btrim(coalesce(v_details->>'raised_with_entity_channel','')),''),
      (v_details->>'acknowledgement_received')::boolean,
      (v_details->>'final_response_received')::boolean,
      NULLIF(v_details->>'final_response_date','')::date,
      NULLIF(btrim(coalesce(v_details->>'outcome_offered','')),''),
      NULLIF(btrim(coalesce(v_details->>'redress_offered','')),''),
      NULLIF(v_details->>'redress_offered_amount','')::numeric,
      (v_details->>'redress_accepted')::boolean,
      NULLIF(btrim(coalesce(v_details->>'still_dissatisfied_reason','')),''),
      coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(v_details->'desired_outcomes','[]'::jsonb)) x), '{}'),
      NULLIF(btrim(coalesce(v_details->>'desired_outcome_other','')),''),
      NULLIF(v_details->>'desired_amount','')::numeric,
      coalesce((v_details->>'declaration_accepted')::boolean,false),
      coalesce(NULLIF(v_details->>'privacy_notice_version',''), v_cfg.privacy_notice_version),
      coalesce((v_details->>'privacy_notice_acknowledged')::boolean,false),
      (v_details->>'respondent_contact_permitted')::boolean,
      coalesce((v_details->>'information_sharing_acknowledged')::boolean,false),
      now()
    )
    ON CONFLICT (complaint_id) DO NOTHING;
  END IF;

  -- ---- regulator routing (config-driven, never hard-coded) ----
  SELECT regulator_id INTO v_reg FROM public.complaints WHERE id = _complaint_id;
  IF v_reg IS NULL AND v_primary_licensee IS NOT NULL THEN
    SELECT coalesce(l.lead_regulator_id, l.alternate_regulator_id)
      INTO v_reg FROM public.licensees l WHERE l.id = v_primary_licensee;
  END IF;
  IF v_reg IS NULL THEN
    v_reg := v_cfg.default_intake_regulator_id;
  END IF;
  IF v_reg IS NOT NULL THEN
    UPDATE public.complaints SET regulator_id = v_reg WHERE id = _complaint_id AND regulator_id IS NULL;
  END IF;

  -- ---- compatibility: keep legacy inline columns aligned with canonical records ----
  UPDATE public.complaints c SET
    licensee_id = coalesce(c.licensee_id, v_primary_licensee),
    license_holder_id = coalesce(c.license_holder_id, v_primary_licensee),
    complainant_name = coalesce(c.complainant_name, (
      SELECT coalesce(p.full_name, p.business_name) FROM public.complaint_parties p
       WHERE p.complaint_id = _complaint_id ORDER BY p.is_primary_contact DESC, p.created_at LIMIT 1)),
    complainant_phone = coalesce(c.complainant_phone, (
      SELECT cp.phone FROM public.complaint_contact_preferences cp WHERE cp.complaint_id = _complaint_id)),
    email = coalesce(c.email, (
      SELECT cp.email FROM public.complaint_contact_preferences cp WHERE cp.complaint_id = _complaint_id)),
    preferred_contact_method = coalesce(c.preferred_contact_method, (
      SELECT cp.preferred_method FROM public.complaint_contact_preferences cp WHERE cp.complaint_id = _complaint_id)),
    incident_date = coalesce(c.incident_date, (
      SELECT d.incident_date FROM public.complaint_intake_details d WHERE d.complaint_id = _complaint_id)),
    product_id = coalesce(c.product_id, (
      SELECT d.product_id FROM public.complaint_intake_details d WHERE d.complaint_id = _complaint_id)),
    channel_id = coalesce(c.channel_id, (
      SELECT d.channel_id FROM public.complaint_intake_details d WHERE d.complaint_id = _complaint_id)),
    vulnerability_indicator = c.vulnerability_indicator OR EXISTS (
      SELECT 1 FROM public.complaint_vulnerability_assessments v
       WHERE v.complaint_id = _complaint_id AND v.support_required)
  WHERE c.id = _complaint_id;

  -- ---- jurisdiction scaffold: always PENDING_ASSESSMENT at intake ----
  INSERT INTO public.complaint_jurisdiction_assessments (complaint_id, status, regulator_id, routing_basis)
  VALUES (_complaint_id, 'PENDING_ASSESSMENT', v_reg,
    CASE WHEN v_primary_licensee IS NOT NULL THEN 'matched_respondent'
         WHEN v_reg IS NOT NULL THEN 'configured_intake_authority'
         ELSE 'unrouted_pending_assessment' END)
  ON CONFLICT (complaint_id) DO NOTHING;

  -- ---- tracking credential (returned once) ----
  IF NOT EXISTS (SELECT 1 FROM public.complaint_tracking_credentials WHERE complaint_id = _complaint_id) THEN
    v_code := upper(encode(extensions.gen_random_bytes(6),'hex'));
    v_code_hash := encode(extensions.digest(v_code || ':' || _complaint_id::text, 'sha256'),'hex');
    INSERT INTO public.complaint_tracking_credentials (complaint_id, code_hash, code_hint, expires_at)
    VALUES (_complaint_id, v_code_hash, right(v_code,4),
      CASE WHEN v_cfg.tracking_code_ttl_days IS NOT NULL
           THEN now() + make_interval(days => v_cfg.tracking_code_ttl_days) END);
  END IF;

  RETURN jsonb_build_object(
    'tracking_access_code', v_code,
    'regulator_id', v_reg,
    'primary_licensee_id', v_primary_licensee,
    'primary_respondent_name', v_primary_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complaint_intake_persist_structured(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_intake_persist_structured(uuid,text,jsonb) TO service_role;

-- ---------- 3. wire the helper into canonical create_complaint ----------
CREATE OR REPLACE FUNCTION public.create_complaint(_variant text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_variant text := lower(coalesce(_variant,'internal'));
  v_is_internal boolean;
  v_regulator uuid := NULLIF(_payload->>'regulator_id','')::uuid;
  v_licensee uuid := NULLIF(_payload->>'licensee_id','')::uuid;
  v_subject text := btrim(coalesce(_payload->>'subject',''));
  v_desc    text := btrim(coalesce(_payload->>'description',''));
  v_email   text := NULLIF(_payload->>'email','');
  v_type_id uuid := NULLIF(_payload->>'complaint_type_id','')::uuid;
  v_crc_id uuid := NULLIF(_payload->>'conduct_risk_category_id','')::uuid;
  v_product_id uuid := NULLIF(_payload->>'product_id','')::uuid;
  v_channel_id uuid := NULLIF(_payload->>'channel_id','')::uuid;
  v_customer_type text := NULLIF(_payload->>'customer_type','');
  v_sev text;
  v_prio text;
  v_intake text := NULLIF(_payload->>'intake_source','');
  v_anon boolean := coalesce((_payload->>'anonymous')::boolean, false);
  v_vuln boolean := coalesce((_payload->>'vulnerability_indicator')::boolean, false);
  v_vuln_notes text := NULLIF(_payload->>'vulnerability_notes','');
  v_vuln_cat text := NULLIF(_payload->>'vulnerability_category','');
  v_workflow_id uuid;
  v_workflow_version uuid;
  v_first_step uuid;
  v_first_step_key text;
  v_id uuid;
  v_wi_id uuid;
  v_errors jsonb := '[]'::jsonb;
  v_row jsonb;
  v_decision jsonb;
  v_structured jsonb := '{}'::jsonb;
BEGIN
  IF v_variant NOT IN ('public','licensee','internal','staff') THEN
    RAISE EXCEPTION 'Invalid variant: %', v_variant USING ERRCODE='22023';
  END IF;

  IF v_variant IN ('licensee','internal','staff') AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;

  v_decision := public.complaint_intake_decide(v_variant, v_regulator, _payload);
  v_sev    := v_decision->>'severity';
  v_prio   := v_decision->>'priority';
  v_errors := COALESCE(v_decision->'errors', '[]'::jsonb);
  IF NOT v_vuln THEN
    v_vuln_notes := NULL; v_vuln_cat := NULL;
  END IF;

  IF v_customer_type IS NOT NULL
     AND lower(v_customer_type) NOT IN ('retail','sme','corporate','vulnerable','other') THEN
    v_customer_type := NULL;
  ELSIF v_customer_type IS NOT NULL THEN
    v_customer_type := lower(v_customer_type);
  END IF;

  IF v_crc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conduct_risk_categories WHERE id = v_crc_id) THEN
    v_crc_id := NULL;
  END IF;
  IF v_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conduct_products WHERE id = v_product_id) THEN
    v_product_id := NULL;
  END IF;
  IF v_channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conduct_channels WHERE id = v_channel_id) THEN
    v_channel_id := NULL;
  END IF;
  -- A respondent that is not on the register must never be forced onto a licence id.
  IF v_licensee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = v_licensee) THEN
    v_licensee := NULL;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'validation_failed'
      USING ERRCODE = '22023', DETAIL = v_errors::text, HINT = 'complaint_validation';
  END IF;

  v_is_internal := (v_variant IN ('internal','staff'));
  IF v_intake IS NULL THEN
    v_intake := v_decision->>'intake_source';
  END IF;

  INSERT INTO public.complaints (
    complainant_id, subject, description, email, severity, priority, status,
    intake_source, internal_created_by, complaint_type_id, licensee_id, regulator_id,
    conduct_risk_category_id, product_id, channel_id, customer_type,
    vulnerability_indicator, vulnerability_notes, vulnerability_category
  ) VALUES (
    CASE WHEN v_variant IN ('public') AND v_anon THEN NULL
         WHEN v_is_internal THEN NULL
         ELSE v_uid END,
    v_subject, v_desc,
    COALESCE(v_email, CASE WHEN v_uid IS NOT NULL THEN (SELECT email FROM auth.users WHERE id=v_uid) END),
    v_sev, v_prio, 'submitted',
    v_intake,
    CASE WHEN v_is_internal THEN v_uid END,
    v_type_id, v_licensee, v_regulator,
    v_crc_id, v_product_id, v_channel_id, v_customer_type,
    v_vuln, v_vuln_notes, v_vuln_cat
  ) RETURNING id INTO v_id;

  -- Canonical structured records (parties, respondents, contact, support,
  -- details, jurisdiction scaffold, tracking credential) — same transaction.
  IF _payload ?| ARRAY['parties','respondents','contact_preference','support_declaration','intake_details']
     OR v_variant = 'public' THEN
    v_structured := public.complaint_intake_persist_structured(v_id, v_variant, _payload);
  END IF;

  SELECT id INTO v_workflow_id FROM public.approval_workflows
    WHERE lower(name) LIKE '%complaint%' ORDER BY created_at LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    SELECT id INTO v_workflow_version FROM public.approval_workflow_versions
      WHERE workflow_id = v_workflow_id AND status='published'
      ORDER BY version_number DESC LIMIT 1;

    SELECT id, step_key INTO v_first_step, v_first_step_key FROM public.approval_steps
      WHERE workflow_id = v_workflow_id
      ORDER BY step_order ASC NULLS LAST LIMIT 1;

    IF v_workflow_version IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, workflow_version_id, entity_type, entity_id,
        current_step_id, current_step_key, status
      ) VALUES (
        v_workflow_id, v_workflow_version, 'complaint', v_id,
        v_first_step, v_first_step_key, 'active'
      )
      ON CONFLICT (entity_id, entity_type) WHERE status = ANY (ARRAY['active','paused']) DO NOTHING
      RETURNING id INTO v_wi_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.created', 'complaint', v_id,
    jsonb_build_object('variant', v_variant, 'intake_source', v_intake,
                       'workflow_instance_id', v_wi_id,
                       'respondent_match_states', (
                         SELECT jsonb_agg(DISTINCT r.match_state)
                           FROM public.complaint_respondents r WHERE r.complaint_id = v_id)));

  BEGIN
    INSERT INTO public.notification_outbox (event_key, entity_type, entity_id, channel, payload)
    VALUES ('complaint.created','complaint',v_id,'in_app',
      jsonb_build_object('variant',v_variant,'complaint_id',v_id));
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT to_jsonb(c.*) INTO v_row FROM public.complaints c WHERE c.id = v_id;
  RETURN jsonb_build_object(
    'id', v_id,
    'complaint_number', v_row->>'complaint_number',
    'workflow_instance_id', v_wi_id,
    'tracking_access_code', v_structured->>'tracking_access_code',
    'complaint', v_row
  );
END;
$function$;

-- ---------- 4. attachment finalisation for trusted public intake ----------
CREATE OR REPLACE FUNCTION public.finalize_complaint_with_attachments(p_complaint_id uuid, p_file_upload_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role','');
  v_trusted boolean := (v_uid IS NULL AND v_role IN ('service_role',''));
  v_complaint record;
  v_file record;
  v_results jsonb := '[]'::jsonb;
  v_linked int := 0;
  v_failed int := 0;
  v_id uuid;
BEGIN
  IF v_uid IS NULL AND NOT v_trusted THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  SELECT id, regulator_id, complainant_id, licensee_id, intake_source
    INTO v_complaint
    FROM public.complaints
   WHERE id = p_complaint_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COMPLAINT_NOT_FOUND';
  END IF;

  -- Trusted server-side public intake may only finalise public complaints.
  IF v_trusted THEN
    IF coalesce(v_complaint.intake_source,'') NOT IN ('public','consumer_portal') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED_FOR_COMPLAINT';
    END IF;
  ELSIF NOT (
    v_complaint.complainant_id = v_uid
    OR public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'staff'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.entity_user_access eua
       WHERE eua.user_id = v_uid AND eua.licensee_id = v_complaint.licensee_id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED_FOR_COMPLAINT';
  END IF;

  IF p_file_upload_ids IS NULL OR array_length(p_file_upload_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('linked', 0, 'failed', 0, 'results', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_file_upload_ids LOOP
    BEGIN
      SELECT id, uploaded_by, file_name, entity_type, entity_id, is_quarantined
        INTO v_file
        FROM public.file_uploads
       WHERE id = v_id
       FOR UPDATE;

      IF NOT FOUND THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'FILE_NOT_FOUND');
        CONTINUE;
      END IF;

      IF NOT v_trusted AND v_file.uploaded_by IS DISTINCT FROM v_uid THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'NOT_FILE_OWNER');
        CONTINUE;
      END IF;

      IF v_file.is_quarantined THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'FILE_QUARANTINED');
        CONTINUE;
      END IF;

      IF v_file.entity_type IS NOT NULL AND v_file.entity_type NOT IN ('complaint','general','staging')
         OR (v_file.entity_type = 'complaint' AND v_file.entity_id IS NOT NULL AND v_file.entity_id <> p_complaint_id::text)
      THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'FILE_ALREADY_LINKED');
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.complaint_evidence
         WHERE complaint_id = p_complaint_id AND file_upload_id = v_id
      ) THEN
        v_linked := v_linked + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', true, 'idempotent', true);
        CONTINUE;
      END IF;

      INSERT INTO public.complaint_evidence (complaint_id, file_upload_id, label, uploaded_by, finalized_at)
      VALUES (p_complaint_id, v_id, v_file.file_name, v_uid, now());

      UPDATE public.file_uploads
         SET entity_type = 'complaint',
             entity_id = p_complaint_id::text,
             updated_at = now()
       WHERE id = v_id;

      v_linked := v_linked + 1;
      v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', true);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('linked', v_linked, 'failed', v_failed, 'results', v_results);
END;
$function$;

-- ---------- 5. anon-safe idempotency in create_complaint_with_attachments ----------
CREATE OR REPLACE FUNCTION public.create_complaint_with_attachments(
  _variant text, _payload jsonb,
  _staged_upload_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing_id uuid;
  v_existing jsonb;
  v_result jsonb;
  v_complaint_id uuid;
  v_upload record;
  v_payload jsonb := coalesce(_payload,'{}'::jsonb);
  v_attach jsonb := '{}'::jsonb;
BEGIN
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.complaints
     WHERE idempotency_key = _idempotency_key
       AND (v_uid IS NULL OR internal_created_by = v_uid OR complainant_id = v_uid)
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', c.id,
        'complaint_number', c.complaint_number,
        'workflow_instance_id', (
          SELECT wi.id FROM public.workflow_instances wi
           WHERE wi.entity_type='complaint' AND wi.entity_id=c.id
           ORDER BY wi.created_at DESC LIMIT 1
        ),
        'complaint', to_jsonb(c),
        'idempotent', true
      ) INTO v_existing FROM public.complaints c WHERE c.id = v_existing_id;
      RETURN v_existing;
    END IF;
  END IF;

  v_result := public.create_complaint(_variant, v_payload);
  v_complaint_id := (v_result->>'id')::uuid;

  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'create_complaint returned no id';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    UPDATE public.complaints SET idempotency_key = _idempotency_key WHERE id = v_complaint_id;
  END IF;

  IF _staged_upload_ids IS NOT NULL AND array_length(_staged_upload_ids,1) > 0 THEN
    FOR v_upload IN
      SELECT id, uploaded_by FROM public.file_uploads WHERE id = ANY(_staged_upload_ids)
    LOOP
      IF v_uid IS NOT NULL AND v_upload.uploaded_by IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Staged upload % not owned by caller', v_upload.id USING ERRCODE='42501';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.complaint_evidence ce
         WHERE ce.file_upload_id = v_upload.id AND ce.complaint_id <> v_complaint_id
      ) THEN
        RAISE EXCEPTION 'Staged upload % already linked to another complaint', v_upload.id USING ERRCODE='23505';
      END IF;
    END LOOP;

    v_attach := public.finalize_complaint_with_attachments(v_complaint_id, _staged_upload_ids);
  END IF;

  RETURN v_result || jsonb_build_object('idempotent', false, 'attachments', v_attach);
END;
$function$;

-- ---------- 6. single public submission authority ----------
CREATE OR REPLACE FUNCTION public.public_complaint_intake_submit(
  _payload jsonb,
  _staged_upload_ids uuid[] DEFAULT ARRAY[]::uuid[],
  _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role','');
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL AND v_role NOT IN ('service_role','') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;

  v_result := public.create_complaint_with_attachments('public', coalesce(_payload,'{}'::jsonb),
                                                       _staged_upload_ids, _idempotency_key);

  -- Safe public projection only: never return internal complaint state.
  RETURN jsonb_build_object(
    'ok', true,
    'id', v_result->>'id',
    'reference', v_result->>'complaint_number',
    'tracking_access_code', v_result->>'tracking_access_code',
    'idempotent', coalesce((v_result->>'idempotent')::boolean, false),
    'attachments', coalesce(v_result->'attachments','{}'::jsonb),
    'submitted_at', (v_result->'complaint'->>'created_at')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_complaint_intake_submit(jsonb, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_complaint_intake_submit(jsonb, uuid[], text) TO service_role;

-- ---------- 7. tracking with access code (email stays backward compatible) ----------
CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking_v2(
  p_reference text, p_access_code text DEFAULT NULL, p_email text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_c record;
  v_cred record;
  v_hash text;
  v_ok boolean := false;
BEGIN
  IF p_reference IS NULL OR length(btrim(p_reference)) < 4 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT id, email, complainant_id INTO v_c
    FROM public.complaints WHERE complaint_number = btrim(p_reference) LIMIT 1;

  -- Uniform response: never disclose whether the reference exists.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF auth.uid() IS NOT NULL AND v_c.complainant_id = auth.uid() THEN
    v_ok := true;
  END IF;

  IF NOT v_ok AND NULLIF(btrim(coalesce(p_access_code,'')),'') IS NOT NULL THEN
    SELECT * INTO v_cred FROM public.complaint_tracking_credentials
     WHERE complaint_id = v_c.id AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now());
    IF FOUND THEN
      v_hash := encode(extensions.digest(upper(btrim(p_access_code)) || ':' || v_c.id::text, 'sha256'),'hex');
      IF v_hash = v_cred.code_hash THEN
        v_ok := true;
        UPDATE public.complaint_tracking_credentials
           SET last_used_at = now(), use_count = use_count + 1
         WHERE id = v_cred.id;
      END IF;
    END IF;
  END IF;

  -- Legacy path: reference + email on file (existing complaints).
  IF NOT v_ok AND NULLIF(btrim(coalesce(p_email,'')),'') IS NOT NULL
     AND v_c.email IS NOT NULL
     AND lower(btrim(v_c.email)) = lower(btrim(p_email)) THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN public.get_public_complaint_tracking_raw(btrim(p_reference), v_c.email);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_complaint_tracking_v2(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_complaint_tracking_v2(text,text,text) TO service_role, authenticated;
