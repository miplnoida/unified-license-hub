-- ============================================================================
-- F3-B REGISTRATION CONTROLLED REMEDIATION — PART 2
-- F3 -> F4 handoff contract, integrity keys, decision authority.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. F3 -> F4 handoff artefact (GAP-F3-05)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registration_licensing_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES public.registrations(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  registration_reference text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.registration_licensing_handoffs TO authenticated;
GRANT ALL ON public.registration_licensing_handoffs TO service_role;
ALTER TABLE public.registration_licensing_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rlh_read ON public.registration_licensing_handoffs;
CREATE POLICY rlh_read ON public.registration_licensing_handoffs
  FOR SELECT TO authenticated
  USING (
    public.is_internal_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.registrations r
       WHERE r.id = registration_licensing_handoffs.registration_id
         AND r.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_rlh_updated_at ON public.registration_licensing_handoffs;
CREATE TRIGGER trg_rlh_updated_at
  BEFORE UPDATE ON public.registration_licensing_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.registration_licensing_handoff(_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg record;
  v_existing record;
  v_sector record;
  v_sub_name text;
  v_cat_name text;
  v_license_type text;
  v_template_ids uuid[];
  v_application_id uuid;
  v_data jsonb;
BEGIN
  SELECT id, user_id, status, registration_reference, sector_id, sub_sector_id, category_id
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_reg.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_APPROVED', 'status', v_reg.status);
  END IF;

  SELECT * INTO v_existing FROM public.registration_licensing_handoffs
   WHERE registration_id = _registration_id;
  IF FOUND AND v_existing.application_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
                              'application_id', v_existing.application_id);
  END IF;

  SELECT s.name, s.regulator_id INTO v_sector
    FROM public.sectors s WHERE s.id = v_reg.sector_id;
  SELECT name INTO v_sub_name FROM public.sub_sectors WHERE id = v_reg.sub_sector_id;
  SELECT name INTO v_cat_name FROM public.categories WHERE id = v_reg.category_id;

  v_license_type := NULLIF(
    array_to_string(ARRAY(SELECT x FROM unnest(ARRAY[v_sector.name, v_sub_name, v_cat_name]) x
                           WHERE NULLIF(btrim(coalesce(x,'')),'') IS NOT NULL), ' - '), '');

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_template_ids FROM (
    SELECT id FROM public.form_templates
     WHERE status = 'published' AND form_type IN ('pre_license','application')
       AND category_id = v_reg.category_id
    UNION ALL
    SELECT id FROM public.form_templates
     WHERE status = 'published' AND form_type IN ('pre_license','application')
       AND sub_sector_id = v_reg.sub_sector_id AND category_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.form_templates t2
                        WHERE t2.status='published' AND t2.form_type IN ('pre_license','application')
                          AND t2.category_id = v_reg.category_id)
    UNION ALL
    SELECT id FROM public.form_templates
     WHERE status = 'published' AND form_type IN ('pre_license','application')
       AND sector_id = v_reg.sector_id AND sub_sector_id IS NULL AND category_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.form_templates t3
                        WHERE t3.status='published' AND t3.form_type IN ('pre_license','application')
                          AND (t3.category_id = v_reg.category_id
                               OR (t3.sub_sector_id = v_reg.sub_sector_id AND t3.category_id IS NULL)))
  ) matched;

  -- Reuse an existing draft for the same registration reference (idempotent).
  SELECT id INTO v_application_id FROM public.applications
   WHERE applicant_id = v_reg.user_id
     AND status = 'draft'
     AND data->>'registration_reference' = v_reg.registration_reference
   ORDER BY created_at DESC LIMIT 1;

  v_data := jsonb_build_object(
    'sector_id', v_reg.sector_id,
    'sub_sector_id', v_reg.sub_sector_id,
    'category_id', v_reg.category_id,
    'sector_name', coalesce(v_sector.name, ''),
    'sub_sector_name', coalesce(v_sub_name, ''),
    'category_name', coalesce(v_cat_name, ''),
    'registration_id', v_reg.id,
    'registration_reference', v_reg.registration_reference,
    'source', 'registration_approval_handoff',
    'form_template_ids', to_jsonb(v_template_ids),
    'forms_data', '{}'::jsonb,
    'form_version_ids', '{}'::jsonb);

  IF v_application_id IS NULL THEN
    INSERT INTO public.applications (applicant_id, license_type, status, regulator_id, data)
    VALUES (v_reg.user_id, coalesce(v_license_type, 'Licence application'), 'draft',
            v_sector.regulator_id, v_data)
    RETURNING id INTO v_application_id;
  ELSE
    UPDATE public.applications
       SET license_type = coalesce(v_license_type, license_type),
           regulator_id = coalesce(v_sector.regulator_id, regulator_id),
           data = data || v_data
     WHERE id = v_application_id;
  END IF;

  INSERT INTO public.registration_licensing_handoffs
    (registration_id, application_id, registration_reference, detail)
  VALUES (_registration_id, v_application_id, v_reg.registration_reference,
          jsonb_build_object('license_type', v_license_type,
                             'form_template_ids', to_jsonb(v_template_ids)))
  ON CONFLICT (registration_id) DO UPDATE
     SET application_id = EXCLUDED.application_id,
         registration_reference = EXCLUDED.registration_reference,
         detail = EXCLUDED.detail,
         updated_at = now();

  PERFORM public.onboarding_record_journey_event(
    v_reg.user_id, 'registration_licensing_handoff', NULL, NULL, _registration_id, NULL,
    jsonb_build_object('application_id', v_application_id));

  RETURN jsonb_build_object('success', true, 'idempotent', false,
                            'application_id', v_application_id,
                            'registration_id', _registration_id);
END $$;
REVOKE ALL ON FUNCTION public.registration_licensing_handoff(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registration_licensing_handoff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.registration_licensing_handoff(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_registration_approved_handoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.registration_licensing_handoff(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS registrations_licensing_handoff ON public.registrations;
CREATE TRIGGER registrations_licensing_handoff
  AFTER UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_registration_approved_handoff();

-- Backfill the handoff register for registrations that are already approved.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.registrations WHERE status = 'approved' LOOP
    PERFORM public.registration_licensing_handoff(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Integrity keys (GAP-F3-11 / GAP-F3-12)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS registrations_registration_number_uidx
  ON public.registrations (upper(btrim(registration_number)))
  WHERE registration_number IS NOT NULL AND btrim(registration_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS registrations_one_live_per_user_uidx
  ON public.registrations (user_id)
  WHERE status IN ('pending_verification','pending_review','in_progress','resubmission_required');

-- ---------------------------------------------------------------------------
-- 3. Mandatory entity binding (GAP-F3-18)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.registrations
     WHERE status <> 'withdrawn'
       AND NOT EXISTS (SELECT 1 FROM public.registration_entity_bindings b
                        WHERE b.registration_id = registrations.id)
  LOOP
    BEGIN
      PERFORM public.onboarding_form_first_resolve_service(r.id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'binding backfill failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.registration_binding_coverage()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'unbound', count(*) FILTER (WHERE b.registration_id IS NULL),
    'unbound_references', COALESCE(
      jsonb_agg(r.registration_reference) FILTER (WHERE b.registration_id IS NULL), '[]'::jsonb))
  FROM public.registrations r
  LEFT JOIN LATERAL (
    SELECT registration_id FROM public.registration_entity_bindings x
     WHERE x.registration_id = r.id LIMIT 1) b ON true
  WHERE r.status <> 'withdrawn';
$$;
REVOKE ALL ON FUNCTION public.registration_binding_coverage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_binding_coverage() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Registration decision authority (GAP-F3-09)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_wf uuid;
  v_step1 uuid; v_step2 uuid;
  v_officer uuid := '745d7e65-6d87-4014-9b7f-0cc9d07d0054';  -- Licensing Officer
  v_approver uuid := 'b5c0d563-3923-4164-88d3-4b93bdb45509'; -- Approver/Decision-Maker
  v_old jsonb;
BEGIN
  SELECT id INTO v_wf FROM public.approval_workflows
   WHERE entity_type = 'registration' AND is_active ORDER BY updated_at DESC LIMIT 1;
  IF v_wf IS NULL THEN RETURN; END IF;

  SELECT id INTO v_step1 FROM public.approval_steps WHERE workflow_id = v_wf ORDER BY step_order ASC LIMIT 1;
  SELECT id INTO v_step2 FROM public.approval_steps WHERE workflow_id = v_wf ORDER BY step_order DESC LIMIT 1;
  IF v_step1 IS NULL OR v_step1 = v_step2 THEN RETURN; END IF;

  SELECT jsonb_agg(jsonb_build_object('step_id', id, 'approver_role', approver_role,
                                      'approver_role_id', approver_role_id,
                                      'approver_config', approver_config))
    INTO v_old FROM public.approval_steps WHERE id IN (v_step1, v_step2);

  UPDATE public.approval_steps
     SET approver_role = 'licensing_officer'::app_role,
         approver_role_id = v_officer,
         approver_type = COALESCE(approver_type, 'role_based_user'),
         approver_config = COALESCE(approver_config, '{}'::jsonb)
                           || jsonb_build_object('allow_system_role_equivalence', true),
         allowed_actions = '["approve","reject","request_resubmission","return_for_correction","request_more_info","send_back"]'::jsonb
   WHERE id = v_step1;

  UPDATE public.approval_steps
     SET approver_role = 'admin'::app_role,
         approver_role_id = v_approver,
         approver_type = COALESCE(approver_type, 'role_based_user'),
         approver_config = COALESCE(approver_config, '{}'::jsonb)
                           || jsonb_build_object('allow_system_role_equivalence', true),
         allowed_actions = '["approve","reject","send_back","request_resubmission"]'::jsonb
   WHERE id = v_step2;

  INSERT INTO public.config_change_log (table_name, record_id, action, old_data, new_data, reason)
  VALUES ('approval_steps', v_wf, 'UPDATE', v_old,
          (SELECT jsonb_agg(jsonb_build_object('step_id', id, 'approver_role', approver_role,
                                               'approver_role_id', approver_role_id,
                                               'approver_config', approver_config,
                                               'allowed_actions', allowed_actions))
             FROM public.approval_steps WHERE id IN (v_step1, v_step2)),
          'F3-B GAP-F3-09: registration decision authority configured as maker-checker (Licensing Officer -> Approver/Decision-Maker) instead of super_admin-only steps.');
END $$;

UPDATE public.decision_authority_rules
   SET requires_maker_checker = true, updated_at = now()
 WHERE decision_type IN ('registration.approve','registration.reject');