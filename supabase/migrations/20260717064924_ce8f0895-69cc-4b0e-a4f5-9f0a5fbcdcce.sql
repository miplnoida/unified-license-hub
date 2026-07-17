
-- =============================================================================
-- Phase 1: Canonical complaint intake
-- =============================================================================

-- 1. Intake rules (regulator + variant configuration) --------------------------
CREATE TABLE IF NOT EXISTS public.complaint_intake_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  variant text NOT NULL CHECK (variant IN ('public','licensee','internal','staff')),
  required_fields text[] NOT NULL DEFAULT '{}',
  allow_anonymous boolean NOT NULL DEFAULT false,
  max_attachments int NOT NULL DEFAULT 5,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, variant)
);

GRANT SELECT ON public.complaint_intake_rules TO authenticated;
GRANT SELECT ON public.complaint_intake_rules TO anon;
GRANT ALL ON public.complaint_intake_rules TO service_role;

ALTER TABLE public.complaint_intake_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intake_rules_read_all" ON public.complaint_intake_rules;
CREATE POLICY "intake_rules_read_all" ON public.complaint_intake_rules
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "intake_rules_admin_write" ON public.complaint_intake_rules;
CREATE POLICY "intake_rules_admin_write" ON public.complaint_intake_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- Seed defaults (one global row per variant when none exist)
INSERT INTO public.complaint_intake_rules (regulator_id, variant, required_fields, allow_anonymous, notes)
SELECT NULL, v.variant, v.req, v.anon, 'Seeded default — Phase 1'
FROM (VALUES
  ('public',   ARRAY['subject','description']::text[],                                   true),
  ('licensee', ARRAY['subject','description','licensee_id','email']::text[],             false),
  ('internal', ARRAY['subject','description','intake_source']::text[],                   false),
  ('staff',    ARRAY['subject','description','intake_source','complaint_type_id']::text[],false)
) AS v(variant, req, anon)
WHERE NOT EXISTS (
  SELECT 1 FROM public.complaint_intake_rules r
  WHERE r.regulator_id IS NULL AND r.variant = v.variant
);

-- 2. Canonical create_complaint(variant, payload) -----------------------------
CREATE OR REPLACE FUNCTION public.create_complaint(_variant text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_variant text := lower(coalesce(_variant,'internal'));
  v_is_internal boolean;
  v_rules public.complaint_intake_rules%ROWTYPE;
  v_regulator uuid := NULLIF(_payload->>'regulator_id','')::uuid;
  v_licensee uuid := NULLIF(_payload->>'licensee_id','')::uuid;
  v_subject text := btrim(coalesce(_payload->>'subject',''));
  v_desc    text := btrim(coalesce(_payload->>'description',''));
  v_email   text := NULLIF(_payload->>'email','');
  v_type_id uuid := NULLIF(_payload->>'complaint_type_id','')::uuid;
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
  v_field text;
  v_row jsonb;
BEGIN
  -- Variant validation
  IF v_variant NOT IN ('public','licensee','internal','staff') THEN
    RAISE EXCEPTION 'Invalid variant: %', v_variant USING ERRCODE='22023';
  END IF;

  -- Auth policy per variant
  IF v_variant IN ('licensee','internal','staff') AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;

  -- Load rules (regulator-scoped first, then default)
  SELECT * INTO v_rules FROM public.complaint_intake_rules
   WHERE variant = v_variant
     AND (regulator_id = v_regulator OR (regulator_id IS NULL))
   ORDER BY regulator_id NULLS LAST
   LIMIT 1;

  IF v_rules.id IS NULL THEN
    -- Fallback rule set — subject + description only
    v_rules.required_fields := ARRAY['subject','description'];
    v_rules.allow_anonymous := (v_variant = 'public');
  END IF;

  -- External variants cannot set severity/priority
  IF v_variant IN ('public','licensee') THEN
    v_sev := 'low';
    v_prio := 'p3';
  ELSE
    v_sev := coalesce(NULLIF(_payload->>'severity',''),'medium');
    v_prio := coalesce(NULLIF(_payload->>'priority',''),'p3');
    IF v_sev NOT IN ('low','medium','high','critical') THEN
      v_errors := v_errors || jsonb_build_object('code','invalid','field','severity','message','Invalid severity');
    END IF;
  END IF;

  -- Structural / required field validation
  IF v_subject = '' OR length(v_subject) < 3 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','subject','message','Subject is required (min 3 chars)');
  END IF;
  IF v_desc = '' OR length(v_desc) < 10 THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','description','message','Description is required (min 10 chars)');
  END IF;

  FOREACH v_field IN ARRAY v_rules.required_fields LOOP
    IF v_field IN ('subject','description') THEN CONTINUE; END IF;  -- checked above
    IF NULLIF(_payload->>v_field,'') IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','required','field',v_field,'message',v_field||' is required');
    END IF;
  END LOOP;

  -- Vulnerability consistency
  IF v_vuln AND v_vuln_notes IS NULL AND v_vuln_cat IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','vulnerability_notes','message','Provide vulnerability notes or category when marked vulnerable');
  END IF;
  IF NOT v_vuln THEN
    v_vuln_notes := NULL; v_vuln_cat := NULL;
  END IF;

  -- Anonymous rule for public variant
  IF v_variant = 'public' AND v_anon = false AND v_email IS NULL THEN
    v_errors := v_errors || jsonb_build_object('code','required','field','email','message','Email required unless anonymous is checked');
  END IF;
  IF v_variant = 'public' AND v_anon = true AND NOT coalesce(v_rules.allow_anonymous, true) THEN
    v_errors := v_errors || jsonb_build_object('code','forbidden','field','anonymous','message','Anonymous submission is not permitted');
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'validation_failed'
      USING ERRCODE = '22023', DETAIL = v_errors::text, HINT = 'complaint_validation';
  END IF;

  -- Determine intake_source default
  v_is_internal := (v_variant IN ('internal','staff'));
  IF v_intake IS NULL THEN
    v_intake := CASE v_variant
      WHEN 'public'   THEN 'consumer_portal'
      WHEN 'licensee' THEN 'licensee_portal'
      WHEN 'internal' THEN 'internal'
      WHEN 'staff'    THEN 'staff_intake'
    END;
  END IF;

  -- Insert the complaint
  INSERT INTO public.complaints (
    complainant_id, subject, description, email, severity, priority, status,
    intake_source, internal_created_by, complaint_type_id, licensee_id, regulator_id,
    vulnerability_indicator, vulnerability_notes
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
    v_vuln, v_vuln_notes
  ) RETURNING id INTO v_id;

  -- Start the workflow (best-effort — if no active version, complaint still created)
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

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.created', 'complaint', v_id,
    jsonb_build_object('variant', v_variant, 'intake_source', v_intake, 'workflow_instance_id', v_wi_id));

  -- Notification outbox (best-effort dedupe via existing unique index)
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
    'complaint', v_row
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_complaint(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_complaint(text, jsonb) TO authenticated;
-- anon can execute for public variant; RLS on the underlying tables + variant checks control access
GRANT EXECUTE ON FUNCTION public.create_complaint(text, jsonb) TO anon;

-- Preserve legacy single-arg signature as a thin wrapper defaulting to internal.
CREATE OR REPLACE FUNCTION public.create_complaint(_payload jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.create_complaint(
    coalesce(_payload->>'variant', CASE WHEN (_payload->>'intake_source') IN ('internal','staff_intake') THEN 'internal' ELSE 'internal' END),
    _payload
  );
$$;

REVOKE ALL ON FUNCTION public.create_complaint(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_complaint(jsonb) TO authenticated;

-- updated_at trigger for intake_rules
CREATE OR REPLACE FUNCTION public._touch_intake_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_complaint_intake_rules_touch ON public.complaint_intake_rules;
CREATE TRIGGER trg_complaint_intake_rules_touch
BEFORE UPDATE ON public.complaint_intake_rules
FOR EACH ROW EXECUTE FUNCTION public._touch_intake_rules();
