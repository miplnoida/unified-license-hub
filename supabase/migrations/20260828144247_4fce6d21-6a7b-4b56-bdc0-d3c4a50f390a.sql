-- =====================================================================
-- F4-B PART 1: approval-path consolidation, F3->F4 contract, workflow authority
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GAP-F4-01: retire the manual (ungoverned) final-approval path.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.perform_manual_application_approval(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.perform_manual_application_approval(uuid, text);
DROP FUNCTION IF EXISTS public.perform_manual_application_approval(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.perform_manual_application_approval(uuid);

-- ---------------------------------------------------------------------
-- 2. GAP-F4-07: canonical application status vocabulary (server enforced)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.application_status_vocabulary()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY[
    'draft','in_progress','submitted','under_review','review','pending_review',
    'query_raised','resubmission_requested','resubmission_required',
    'returned_for_correction','info_requested',
    'approved','rejected','cancelled','withdrawn'
  ]::text[]
$$;

CREATE OR REPLACE FUNCTION public.enforce_application_status_vocabulary()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS NULL THEN
    RAISE EXCEPTION 'INVALID_APPLICATION_STATUS: status is required' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW; -- untouched historical value stays as-is
  END IF;
  IF NOT (NEW.status = ANY (public.application_status_vocabulary())) THEN
    RAISE EXCEPTION 'INVALID_APPLICATION_STATUS: %', NEW.status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_applications_status_vocabulary ON public.applications;
CREATE TRIGGER trg_applications_status_vocabulary
  BEFORE INSERT OR UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_application_status_vocabulary();

-- ---------------------------------------------------------------------
-- 3. GAP-F4-02 / F4-11: F3 -> F4 handoff contract integrity
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.registration_licensing_handoffs'::regclass
       AND contype = 'f'
       AND pg_get_constraintdef(oid) ILIKE '%application_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.registration_licensing_handoffs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.registration_licensing_handoffs
  ADD CONSTRAINT registration_licensing_handoffs_application_fk
  FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.registration_licensing_handoffs WHERE application_id IS NULL) THEN
    ALTER TABLE public.registration_licensing_handoffs ALTER COLUMN application_id SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS registration_licensing_handoffs_application_uk
  ON public.registration_licensing_handoffs (application_id)
  WHERE application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registration_licensing_handoffs_registration_uk
  ON public.registration_licensing_handoffs (registration_id);

COMMENT ON COLUMN public.registration_licensing_handoffs.application_id IS
  'F4 authoritative: exactly one licensing application per approved registration handoff (unique, ON DELETE RESTRICT).';

-- Is this application an initial/new-licence application (F4) rather than a
-- post-licensing service request (F5)?
CREATE OR REPLACE FUNCTION public.application_is_initial_licence(_application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN a.id IS NULL THEN NULL
    ELSE NOT (
      COALESCE(NULLIF(a.data->>'service_id',''), NULL) IS NOT NULL
      OR COALESCE(NULLIF(a.data->>'license_id',''), NULL) IS NOT NULL
      OR lower(COALESCE(a.data->>'type','')) = 'post_license'
    )
  END
  FROM public.applications a WHERE a.id = _application_id
$$;

-- ---------------------------------------------------------------------
-- 4. GAP-F4-02: create_application_draft enforces the F3 consumer contract
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_application_draft(_license_type text, _data jsonb DEFAULT '{}'::jsonb, _regulator_id uuid DEFAULT NULL::uuid)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_application public.applications;
  v_entity_id uuid;
  v_is_post boolean;
  v_is_staff boolean;
  v_license_id uuid := NULLIF(_data->>'license_id','')::uuid;
  v_claimed_entity uuid := NULLIF(_data->>'licensee_id','')::uuid;
  v_license_holder uuid;
  v_service_id text := NULLIF(_data->>'service_id','');
  v_existing uuid;
  v_reg_id uuid := NULLIF(_data->>'registration_id','')::uuid;
  v_handoff record;
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  v_is_staff := public.is_super_admin(v_uid)
                OR public.has_permission(v_uid, 'application_management', 'create');

  IF NOT (
    v_is_staff
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'APPLICATION_CREATE_FORBIDDEN: You do not have permission to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.entity_id INTO v_entity_id
    FROM public.entity_user_memberships m
    JOIN public.licensees l ON l.id = m.entity_id
   WHERE m.user_id = v_uid AND m.status = 'APPROVED' AND l.merged_into_entity_id IS NULL
   ORDER BY m.approved_at DESC NULLS LAST
   LIMIT 1;

  IF v_entity_id IS NULL THEN
    SELECT p.licensee_id INTO v_entity_id
      FROM public.profiles p JOIN public.licensees l ON l.id = p.licensee_id
     WHERE p.id = v_uid AND l.merged_into_entity_id IS NULL;
  END IF;

  IF v_entity_id IS NULL THEN
    SELECT l.id INTO v_entity_id
      FROM public.licensees l
     WHERE l.applicant_id = v_uid AND l.merged_into_entity_id IS NULL
     ORDER BY l.created_at
     LIMIT 1;
  END IF;

  -- Post-licence services are entitlements of an existing, eligible licence.
  v_is_post := (v_service_id IS NOT NULL)
               OR lower(COALESCE(_data->>'type','')) = 'post_license'
               OR v_license_id IS NOT NULL;

  IF v_is_post THEN
    -- Ownership is derived from the selected licence, never from a membership guess.
    IF v_license_id IS NULL THEN
      IF NOT v_is_staff THEN
        RAISE EXCEPTION 'LICENSE_REQUIRED: Select the licence this post-licence service relates to.'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT holder_id INTO v_license_holder FROM public.licenses WHERE id = v_license_id;
      IF v_license_holder IS NULL THEN
        RAISE EXCEPTION 'LICENSE_NOT_FOUND: The selected licence could not be found.'
          USING ERRCODE = '22023';
      END IF;
      IF v_claimed_entity IS NOT NULL AND v_claimed_entity IS DISTINCT FROM v_license_holder THEN
        RAISE EXCEPTION 'LICENSE_ENTITY_MISMATCH: The selected licence does not belong to the selected entity.'
          USING ERRCODE = '42501';
      END IF;
      v_entity_id := v_license_holder;

      IF NOT v_is_staff THEN
        IF NOT public.can_act_on_specific_license(
             v_license_id,
             v_license_holder,
             NULLIF(_data->>'sector_id','')::uuid,
             NULLIF(_data->>'sub_sector_id','')::uuid,
             NULLIF(_data->>'category_id','')::uuid
           ) THEN
          RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;

    IF v_license_id IS NULL AND NOT v_is_staff THEN
      IF NOT public.can_act_on_license(
           COALESCE(v_claimed_entity, v_entity_id),
           NULLIF(_data->>'sector_id','')::uuid,
           NULLIF(_data->>'sub_sector_id','')::uuid,
           NULLIF(_data->>'category_id','')::uuid
         ) THEN
        RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Duplicate protection: same licence + same service + open request.
    IF v_license_id IS NOT NULL AND v_service_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('post_license_request:' || v_license_id::text || ':' || v_service_id, 0)
      );

      SELECT a.id INTO v_existing
        FROM public.applications a
       WHERE COALESCE(a.data->>'license_id','') = v_license_id::text
         AND COALESCE(a.data->>'service_id','') = v_service_id
         AND a.status = ANY (public.post_license_open_statuses())
       ORDER BY a.created_at
       LIMIT 1;

      IF v_existing IS NOT NULL THEN
        RAISE EXCEPTION 'DUPLICATE_POST_LICENSE_REQUEST: %', v_existing
          USING ERRCODE = 'unique_violation',
                HINT = v_existing::text;
      END IF;
    END IF;
  ELSE
    -- ================= F4-02 / F4-11: F3 consumer contract ==============
    -- An initial/new licence application may only exist for an approved F3
    -- registration handoff, and each handoff owns exactly one application.
    IF NOT v_trusted THEN
      IF v_reg_id IS NULL THEN
        SELECT h.registration_id INTO v_reg_id
          FROM public.registration_licensing_handoffs h
          JOIN public.registrations r ON r.id = h.registration_id
         WHERE r.user_id = v_uid AND lower(r.status) = 'approved'
         ORDER BY h.created_at DESC
         LIMIT 1;
      END IF;

      IF v_reg_id IS NULL THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      SELECT h.*, r.status AS reg_status, r.user_id AS reg_user
        INTO v_handoff
        FROM public.registration_licensing_handoffs h
        JOIN public.registrations r ON r.id = h.registration_id
       WHERE h.registration_id = v_reg_id;

      IF NOT FOUND OR lower(COALESCE(v_handoff.reg_status,'')) <> 'approved' THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_is_staff AND v_handoff.reg_user IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_FORBIDDEN: This registration handoff does not belong to you.'
          USING ERRCODE = '42501';
      END IF;

      -- Idempotent: the handoff application is authoritative, never duplicated.
      IF v_handoff.application_id IS NOT NULL THEN
        SELECT * INTO v_application FROM public.applications WHERE id = v_handoff.application_id;
        IF FOUND THEN
          RETURN v_application;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    COALESCE(_data, '{}'::jsonb) || CASE WHEN v_reg_id IS NOT NULL
      THEN jsonb_build_object('registration_id', v_reg_id) ELSE '{}'::jsonb END,
    _regulator_id,
    v_entity_id
  )
  RETURNING * INTO v_application;

  IF NOT v_is_post AND v_reg_id IS NOT NULL THEN
    UPDATE public.registration_licensing_handoffs
       SET application_id = v_application.id, updated_at = now()
     WHERE registration_id = v_reg_id AND application_id IS NULL;
  END IF;

  RETURN v_application;
END $function$;

-- ---------------------------------------------------------------------
-- 5. GAP-F4-09 / F4-10: canonical, server-side application workflow authority
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_workflow_vocabulary (
  entity_type text PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('initial_licensing','post_licensing')),
  instance_entity_type text NOT NULL DEFAULT 'application',
  is_canonical boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.application_workflow_vocabulary TO authenticated;
GRANT ALL ON public.application_workflow_vocabulary TO service_role;
ALTER TABLE public.application_workflow_vocabulary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read the workflow vocabulary" ON public.application_workflow_vocabulary;
CREATE POLICY "Signed-in users can read the workflow vocabulary"
  ON public.application_workflow_vocabulary FOR SELECT TO authenticated USING (true);

INSERT INTO public.application_workflow_vocabulary (entity_type, phase, instance_entity_type, is_canonical, notes) VALUES
  ('pre_application','initial_licensing','application', true,  'F4 initial/new licence applications'),
  ('post_application','post_licensing','application', true,  'F5 post-licensing service requests'),
  ('application','initial_licensing','application', false, 'Legacy alias retained for historical configurations')
ON CONFLICT (entity_type) DO UPDATE
  SET phase = EXCLUDED.phase,
      instance_entity_type = EXCLUDED.instance_entity_type,
      is_canonical = EXCLUDED.is_canonical,
      notes = EXCLUDED.notes,
      updated_at = now();

CREATE OR REPLACE FUNCTION public.application_workflow_resolve(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_phase text;
  v_types text[];
  v_match record;
BEGIN
  SELECT a.id, a.license_type, a.regulator_id, a.data,
         NULLIF(a.data->>'sector_id','')::uuid AS sector_id,
         NULLIF(a.data->>'sub_sector_id','')::uuid AS sub_sector_id,
         NULLIF(a.data->>'category_id','')::uuid AS category_id,
         NULLIF(a.data->>'service_id','') AS service_id
    INTO v_app FROM public.applications a WHERE a.id = _application_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','NOT_FOUND','workflow_id',NULL);
  END IF;

  v_phase := CASE WHEN public.application_is_initial_licence(_application_id)
                  THEN 'initial_licensing' ELSE 'post_licensing' END;

  SELECT array_agg(entity_type) INTO v_types
    FROM public.application_workflow_vocabulary WHERE phase = v_phase;

  SELECT w.id, w.name, w.entity_type,
         (CASE WHEN w.service_id IS NOT NULL THEN 16 ELSE 0 END
          + CASE WHEN w.category_id IS NOT NULL THEN 8 ELSE 0 END
          + CASE WHEN w.sub_sector_id IS NOT NULL THEN 4 ELSE 0 END
          + CASE WHEN w.sector_id IS NOT NULL THEN 2 ELSE 0 END
          + CASE WHEN w.license_type IS NOT NULL THEN 1 ELSE 0 END) AS specificity
    INTO v_match
    FROM public.approval_workflows w
   WHERE w.is_active = true
     AND w.retired_at IS NULL
     AND w.entity_type = ANY (v_types)
     AND (w.regulator_id IS NULL OR v_app.regulator_id IS NULL OR w.regulator_id = v_app.regulator_id)
     AND (w.service_id IS NULL OR w.service_id::text = v_app.service_id)
     AND (w.category_id IS NULL OR w.category_id = v_app.category_id)
     AND (w.sub_sector_id IS NULL OR w.sub_sector_id = v_app.sub_sector_id)
     AND (w.sector_id IS NULL OR w.sector_id = v_app.sector_id)
     AND (w.license_type IS NULL OR lower(w.license_type) = lower(COALESCE(v_app.license_type,'')))
     AND EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.workflow_id = w.id)
   ORDER BY specificity DESC, w.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object(
      'state','BUSINESS_CONFIGURATION_REQUIRED',
      'phase', v_phase,
      'workflow_id', NULL,
      'reason','No active approval workflow with steps matches this application');
  END IF;

  RETURN jsonb_build_object(
    'state','RESOLVED',
    'phase', v_phase,
    'workflow_id', v_match.id,
    'workflow_name', v_match.name,
    'configured_entity_type', v_match.entity_type,
    'instance_entity_type', 'application',
    'specificity', v_match.specificity);
END $$;

REVOKE ALL ON FUNCTION public.application_workflow_resolve(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_workflow_resolve(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.application_is_initial_licence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_is_initial_licence(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. GAP-F4-04 / 05 / 13: governed licensing gate configuration
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.licensing_gate_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_key text NOT NULL CHECK (gate_key IN ('forms_documents','fees','fit_and_proper','conditions','inspection')),
  applicability text NOT NULL CHECK (applicability IN ('REQUIRED','NOT_APPLICABLE')),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  license_type text,
  service_id text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  retired_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS licensing_gate_configs_scope_uk
  ON public.licensing_gate_configs (
    gate_key,
    COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(sub_sector_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(COALESCE(license_type, '')),
    COALESCE(service_id, '')
  ) WHERE retired_at IS NULL;

GRANT SELECT ON public.licensing_gate_configs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.licensing_gate_configs TO authenticated;
GRANT ALL ON public.licensing_gate_configs TO service_role;
ALTER TABLE public.licensing_gate_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view licensing gate configuration" ON public.licensing_gate_configs;
CREATE POLICY "Staff can view licensing gate configuration"
  ON public.licensing_gate_configs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'system_settings', 'view')
         OR public.has_permission(auth.uid(), 'application_management', 'view'));

DROP POLICY IF EXISTS "Admins manage licensing gate configuration" ON public.licensing_gate_configs;
CREATE POLICY "Admins manage licensing gate configuration"
  ON public.licensing_gate_configs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'system_settings', 'edit'))
  WITH CHECK (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'system_settings', 'edit'));

DROP TRIGGER IF EXISTS trg_licensing_gate_configs_updated_at ON public.licensing_gate_configs;
CREATE TRIGGER trg_licensing_gate_configs_updated_at
  BEFORE UPDATE ON public.licensing_gate_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.config_governed_tables (table_name, domain, required_module_key, required_create_action, required_edit_action, soft_delete_column, soft_delete_retired_value, allow_hard_delete, notes)
VALUES ('licensing_gate_configs', 'licensing', 'system_settings', 'edit', 'edit', 'retired_at', NULL, false,
        'F4-B: declares whether forms/documents, fees, fit & proper, conditions and inspection are prerequisites for a licensing decision.')
ON CONFLICT (table_name) DO NOTHING;

-- Scope-aware resolution: most specific active configuration wins.
CREATE OR REPLACE FUNCTION public.licensing_gate_applicability(_application_id uuid, _gate_key text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_result text;
BEGIN
  SELECT a.license_type, a.regulator_id,
         NULLIF(a.data->>'sector_id','')::uuid AS sector_id,
         NULLIF(a.data->>'sub_sector_id','')::uuid AS sub_sector_id,
         NULLIF(a.data->>'category_id','')::uuid AS category_id,
         NULLIF(a.data->>'service_id','') AS service_id
    INTO v_app FROM public.applications a WHERE a.id = _application_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT c.applicability INTO v_result
    FROM public.licensing_gate_configs c
   WHERE c.gate_key = _gate_key
     AND c.is_active = true AND c.retired_at IS NULL
     AND (c.regulator_id IS NULL OR c.regulator_id = v_app.regulator_id)
     AND (c.service_id IS NULL OR c.service_id = v_app.service_id)
     AND (c.category_id IS NULL OR c.category_id = v_app.category_id)
     AND (c.sub_sector_id IS NULL OR c.sub_sector_id = v_app.sub_sector_id)
     AND (c.sector_id IS NULL OR c.sector_id = v_app.sector_id)
     AND (c.license_type IS NULL OR lower(c.license_type) = lower(COALESCE(v_app.license_type,'')))
   ORDER BY (CASE WHEN c.service_id IS NOT NULL THEN 16 ELSE 0 END
             + CASE WHEN c.category_id IS NOT NULL THEN 8 ELSE 0 END
             + CASE WHEN c.sub_sector_id IS NOT NULL THEN 4 ELSE 0 END
             + CASE WHEN c.sector_id IS NOT NULL THEN 2 ELSE 0 END
             + CASE WHEN c.license_type IS NOT NULL THEN 1 ELSE 0 END) DESC,
            c.updated_at DESC
   LIMIT 1;

  RETURN v_result; -- NULL => BUSINESS_CONFIGURATION_REQUIRED
END $$;

REVOKE ALL ON FUNCTION public.licensing_gate_applicability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licensing_gate_applicability(uuid, text) TO authenticated, service_role;