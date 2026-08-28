-- F5-B1 fix: config_change_log.action vocabulary is CREATE/UPDATE/RETIRE/REACTIVATE/DELETE
CREATE OR REPLACE FUNCTION public.admin_upsert_license_lifecycle_config(
  _config_id uuid,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
  v_matter_kind text;
  v_regulator uuid;
  v_kinds text[] := ARRAY['renewal','variation','surrender','suspension',
                          'revocation','reinstatement','expiry'];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid, 'license_management', 'manage_config')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'PAYLOAD_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF _config_id IS NOT NULL THEN
    SELECT to_jsonb(x), x.matter_kind INTO v_old, v_matter_kind
      FROM public.license_lifecycle_configs x WHERE x.id = _config_id;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'CONFIG_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_matter_kind := COALESCE(_payload->>'matter_kind', v_matter_kind);
  IF v_matter_kind IS NULL OR NOT (v_matter_kind = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'INVALID_MATTER_KIND' USING ERRCODE = '22023';
  END IF;

  v_regulator := NULLIF(_payload->>'regulator_id','')::uuid;
  IF v_regulator IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.regulators r WHERE r.id = v_regulator) THEN
    RAISE EXCEPTION 'INVALID_REGULATOR' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(_payload->>'sector_id','') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = (_payload->>'sector_id')::uuid) THEN
    RAISE EXCEPTION 'INVALID_SECTOR' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(_payload->>'sub_sector_id','') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sub_sectors ss WHERE ss.id = (_payload->>'sub_sector_id')::uuid) THEN
    RAISE EXCEPTION 'INVALID_SUB_SECTOR' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(_payload->>'category_id','') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = (_payload->>'category_id')::uuid) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY' USING ERRCODE = '22023';
  END IF;

  IF _config_id IS NULL THEN
    INSERT INTO public.license_lifecycle_configs (
      matter_kind, regulator_id, sector_id, sub_sector_id, category_id, license_type,
      renewal_cycle, period_days, renewal_window_days, grace_period_days, reminder_days,
      required_form_package_id, required_documents, verification_required,
      verification_checklist, fp_required, fee_required, fee_type_code,
      payment_verification_required, decision_authority, late_renewal_treatment,
      expiry_behavior, breach_consequence, workflow_id, is_active, notes, created_by
    ) VALUES (
      v_matter_kind,
      v_regulator,
      NULLIF(_payload->>'sector_id','')::uuid,
      NULLIF(_payload->>'sub_sector_id','')::uuid,
      NULLIF(_payload->>'category_id','')::uuid,
      NULLIF(_payload->>'license_type',''),
      COALESCE(_payload->>'renewal_cycle','annual'),
      COALESCE((_payload->>'period_days')::int, 365),
      COALESCE((_payload->>'renewal_window_days')::int, 60),
      COALESCE((_payload->>'grace_period_days')::int, 30),
      COALESCE(_payload->'reminder_days', '[60,30,7]'::jsonb),
      NULLIF(_payload->>'required_form_package_id','')::uuid,
      COALESCE(_payload->'required_documents', '[]'::jsonb),
      COALESCE((_payload->>'verification_required')::boolean, true),
      COALESCE(_payload->'verification_checklist', '[]'::jsonb),
      COALESCE((_payload->>'fp_required')::boolean, false),
      COALESCE((_payload->>'fee_required')::boolean, false),
      NULLIF(_payload->>'fee_type_code',''),
      COALESCE((_payload->>'payment_verification_required')::boolean, false),
      NULLIF(_payload->>'decision_authority',''),
      COALESCE(_payload->>'late_renewal_treatment','grace_then_lapse'),
      COALESCE(_payload->>'expiry_behavior','officer_confirmed'),
      COALESCE(_payload->>'breach_consequence','supervisory_followup'),
      NULLIF(_payload->>'workflow_id','')::uuid,
      COALESCE((_payload->>'is_active')::boolean, true),
      NULLIF(_payload->>'notes',''),
      uid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.license_lifecycle_configs x SET
      matter_kind    = v_matter_kind,
      regulator_id   = CASE WHEN _payload ? 'regulator_id'   THEN v_regulator ELSE x.regulator_id END,
      sector_id      = CASE WHEN _payload ? 'sector_id'      THEN NULLIF(_payload->>'sector_id','')::uuid ELSE x.sector_id END,
      sub_sector_id  = CASE WHEN _payload ? 'sub_sector_id'  THEN NULLIF(_payload->>'sub_sector_id','')::uuid ELSE x.sub_sector_id END,
      category_id    = CASE WHEN _payload ? 'category_id'    THEN NULLIF(_payload->>'category_id','')::uuid ELSE x.category_id END,
      license_type   = CASE WHEN _payload ? 'license_type'   THEN NULLIF(_payload->>'license_type','') ELSE x.license_type END,
      renewal_cycle  = COALESCE(_payload->>'renewal_cycle', x.renewal_cycle),
      period_days    = COALESCE((_payload->>'period_days')::int, x.period_days),
      renewal_window_days = COALESCE((_payload->>'renewal_window_days')::int, x.renewal_window_days),
      grace_period_days   = COALESCE((_payload->>'grace_period_days')::int, x.grace_period_days),
      reminder_days  = COALESCE(_payload->'reminder_days', x.reminder_days),
      required_form_package_id = CASE WHEN _payload ? 'required_form_package_id'
                                      THEN NULLIF(_payload->>'required_form_package_id','')::uuid
                                      ELSE x.required_form_package_id END,
      required_documents = COALESCE(_payload->'required_documents', x.required_documents),
      verification_required = COALESCE((_payload->>'verification_required')::boolean, x.verification_required),
      verification_checklist = COALESCE(_payload->'verification_checklist', x.verification_checklist),
      fp_required    = COALESCE((_payload->>'fp_required')::boolean, x.fp_required),
      fee_required   = COALESCE((_payload->>'fee_required')::boolean, x.fee_required),
      fee_type_code  = CASE WHEN _payload ? 'fee_type_code' THEN NULLIF(_payload->>'fee_type_code','') ELSE x.fee_type_code END,
      payment_verification_required = COALESCE((_payload->>'payment_verification_required')::boolean, x.payment_verification_required),
      decision_authority = CASE WHEN _payload ? 'decision_authority' THEN NULLIF(_payload->>'decision_authority','') ELSE x.decision_authority END,
      late_renewal_treatment = COALESCE(_payload->>'late_renewal_treatment', x.late_renewal_treatment),
      expiry_behavior = COALESCE(_payload->>'expiry_behavior', x.expiry_behavior),
      breach_consequence = COALESCE(_payload->>'breach_consequence', x.breach_consequence),
      workflow_id    = CASE WHEN _payload ? 'workflow_id' THEN NULLIF(_payload->>'workflow_id','')::uuid ELSE x.workflow_id END,
      is_active      = COALESCE((_payload->>'is_active')::boolean, x.is_active),
      notes          = CASE WHEN _payload ? 'notes' THEN NULLIF(_payload->>'notes','') ELSE x.notes END,
      updated_at     = now()
    WHERE x.id = _config_id
    RETURNING id INTO v_id;
  END IF;

  SELECT to_jsonb(x) INTO v_new FROM public.license_lifecycle_configs x WHERE x.id = v_id;

  INSERT INTO public.config_change_log (table_name, record_id, action, old_data, new_data, reason, changed_by)
  VALUES ('license_lifecycle_configs', v_id,
          CASE WHEN _config_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
          v_old, v_new, NULLIF(_payload->>'change_reason',''), uid);

  INSERT INTO public.compliance_audit_logs (user_id, action_type, object_type, object_id,
                                           before_value, after_value, justification, metadata)
  VALUES (uid,
          (CASE WHEN _config_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END)::public.compliance_audit_action,
          'license_lifecycle_configs', v_id::text, v_old, v_new,
          NULLIF(_payload->>'change_reason',''),
          jsonb_build_object('gate','F5-B1','rpc','admin_upsert_license_lifecycle_config'));

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_set_license_lifecycle_config_active(
  _config_id uuid,
  _is_active boolean,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid, 'license_management', 'manage_config')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _config_id IS NULL OR _is_active IS NULL THEN
    RAISE EXCEPTION 'ARGS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(x) INTO v_old FROM public.license_lifecycle_configs x WHERE x.id = _config_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'CONFIG_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF _is_active = false AND NULLIF(btrim(COALESCE(_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.license_lifecycle_configs
     SET is_active = _is_active, updated_at = now()
   WHERE id = _config_id;

  SELECT to_jsonb(x) INTO v_new FROM public.license_lifecycle_configs x WHERE x.id = _config_id;

  INSERT INTO public.config_change_log (table_name, record_id, action, old_data, new_data, reason, changed_by)
  VALUES ('license_lifecycle_configs', _config_id,
          CASE WHEN _is_active THEN 'REACTIVATE' ELSE 'RETIRE' END,
          v_old, v_new, _reason, uid);

  INSERT INTO public.compliance_audit_logs (user_id, action_type, object_type, object_id,
                                            before_value, after_value, justification, metadata)
  VALUES (uid, 'UPDATE'::public.compliance_audit_action, 'license_lifecycle_configs',
          _config_id::text, v_old, v_new, _reason,
          jsonb_build_object('gate','F5-B1','rpc','admin_set_license_lifecycle_config_active'));

  RETURN _config_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_upsert_license_lifecycle_config(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_license_lifecycle_config(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_license_lifecycle_config(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_license_lifecycle_config_active(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_license_lifecycle_config_active(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_license_lifecycle_config_active(uuid, boolean, text) TO authenticated, service_role;