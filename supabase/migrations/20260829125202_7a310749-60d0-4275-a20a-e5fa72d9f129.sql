-- =====================================================================
-- F5-B5X consolidated remediation: canonical classification, single
-- server authority, lifecycle-service completeness, fee-aware boundary.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GAP-F5-16: canonical, server-owned request classification
-- ---------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS request_kind text;

CREATE OR REPLACE FUNCTION public.derive_application_request_kind(_data jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(COALESCE(_data->>'license_id','')),'') ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN 'POST_LICENSE'
    WHEN EXISTS (
      SELECT 1 FROM public.services s
       WHERE NULLIF(btrim(COALESCE(_data->>'service_id','')),'') ~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND s.id = (btrim(_data->>'service_id'))::uuid
         AND lower(COALESCE(s.lifecycle_stage,'')) IN ('post_license','renewal'))
      THEN 'POST_LICENSE'
    WHEN lower(COALESCE(_data->>'type','')) = 'post_license' THEN 'POST_LICENSE'
    ELSE 'INITIAL'
  END
$$;

CREATE OR REPLACE FUNCTION public.applications_set_request_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.request_kind := public.derive_application_request_kind(COALESCE(NEW.data,'{}'::jsonb));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_applications_request_kind ON public.applications;
CREATE TRIGGER trg_applications_request_kind
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_set_request_kind();

UPDATE public.applications
   SET request_kind = public.derive_application_request_kind(COALESCE(data,'{}'::jsonb))
 WHERE request_kind IS NULL
    OR request_kind IS DISTINCT FROM public.derive_application_request_kind(COALESCE(data,'{}'::jsonb));

ALTER TABLE public.applications
  ALTER COLUMN request_kind SET NOT NULL;

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_request_kind_check;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_request_kind_check
  CHECK (request_kind IN ('INITIAL','POST_LICENSE'));

CREATE INDEX IF NOT EXISTS applications_request_kind_status_idx
  ON public.applications (request_kind, status);

CREATE OR REPLACE FUNCTION public.application_request_kind(_application_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.request_kind FROM public.applications a WHERE a.id = _application_id
$$;

REVOKE ALL ON FUNCTION public.derive_application_request_kind(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.applications_set_request_kind() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.application_request_kind(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_request_kind(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. GAP-F5-07 / 07a / 11: single server workflow + status authority
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.application_workflow_view(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_global boolean;
  v_kind text;
  v_is_post boolean;
  v_reg uuid;
  v_wf uuid;
  v_first uuid;
  v_active boolean;
  v_name text;
  v_steps int := 0;
  v_reason text;
BEGIN
  SELECT id, license_type, regulator_id, data, request_kind, workflow_id, current_step_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'enabled', false, 'reason','application_not_found');
  END IF;

  SELECT COALESCE((s.value->>'application_review_enabled')::boolean, true) INTO v_global
    FROM public.site_settings s WHERE s.key = 'review_settings';
  v_global := COALESCE(v_global, true);

  v_kind := v_app.request_kind;
  v_is_post := v_kind = 'POST_LICENSE';

  v_reg := public._resolve_effective_regulator(
    v_app.regulator_id,
    NULLIF(btrim(COALESCE(v_app.data->>'sector_id','')),'')::uuid,
    NULLIF(btrim(COALESCE(v_app.data->>'category_id','')),'')::uuid);

  SELECT r.workflow_id, r.first_step_id INTO v_wf, v_first
    FROM public._resolve_application_workflow(
           v_app.license_type, v_reg,
           NULLIF(btrim(COALESCE(v_app.data->>'sector_id','')),'')::uuid,
           NULLIF(btrim(COALESCE(v_app.data->>'category_id','')),'')::uuid,
           v_is_post,
           NULLIF(btrim(COALESCE(v_app.data->>'service_id','')),'')::uuid,
           NULLIF(btrim(COALESCE(v_app.data->>'sub_sector_id','')),'')::uuid) r;

  IF v_wf IS NOT NULL THEN
    SELECT w.is_active, w.name INTO v_active, v_name
      FROM public.approval_workflows w WHERE w.id = v_wf;
    SELECT count(*) INTO v_steps FROM public.approval_steps st WHERE st.workflow_id = v_wf;
  END IF;

  v_reason := CASE
    WHEN NOT v_global THEN 'global_disabled'
    WHEN v_wf IS NULL THEN 'no_matched_workflow'
    WHEN NOT COALESCE(v_active,false) THEN 'workflow_inactive'
    WHEN v_steps = 0 THEN 'no_steps'
    ELSE 'enabled' END;

  RETURN jsonb_build_object(
    'found', true,
    'application_id', _application_id,
    'request_kind', v_kind,
    'is_post_license', v_is_post,
    'global_review_enabled', v_global,
    'workflow_id', v_wf,
    'workflow_name', v_name,
    'workflow_is_active', COALESCE(v_active,false),
    'step_count', v_steps,
    'first_step_id', v_first,
    'attached_workflow_id', v_app.workflow_id,
    'entity_type', CASE WHEN v_is_post THEN 'post_application' ELSE 'pre_application' END,
    'enabled', v_reason = 'enabled',
    'reason', v_reason,
    'open_statuses', to_jsonb(public.post_license_open_statuses()));
END $$;

REVOKE ALL ON FUNCTION public.application_workflow_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_workflow_view(uuid) TO authenticated, service_role;

-- GAP-F5-06: published form resolution is server-side only.
CREATE OR REPLACE FUNCTION public.post_license_service_form_set(_service_id uuid, _license_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_applicability text;
  v_forms jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_applicability := public.post_license_service_applicability(_service_id, _license_id);
  IF v_applicability <> 'OK' THEN
    RETURN jsonb_build_object('state', v_applicability,
      'message', public.post_license_applicability_message(v_applicability),
      'forms','[]'::jsonb);
  END IF;

  SELECT * INTO v_ctx FROM public.resolve_post_license_intake_context(_license_id, _service_id);
  IF v_ctx.entity_id IS NULL THEN
    RETURN jsonb_build_object('state','LICENSE_NOT_FOUND','forms','[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'form_id', f.form_id,
           'form_version_id', f.form_version_id,
           'name', f.form_name,
           'is_mandatory', f.is_mandatory,
           'display_order', f.display_order) ORDER BY f.display_order), '[]'::jsonb)
    INTO v_forms
    FROM public.application_resolve_form_set(
           v_ctx.sector_id, v_ctx.sub_sector_id, v_ctx.category_id,
           _service_id, 'post_license', NULL) f;

  RETURN jsonb_build_object(
    'state','OK',
    'license_id', _license_id,
    'service_id', _service_id,
    'entity_id', v_ctx.entity_id,
    'sector_id', v_ctx.sector_id,
    'sub_sector_id', v_ctx.sub_sector_id,
    'category_id', v_ctx.category_id,
    'forms', v_forms);
END $$;

REVOKE ALL ON FUNCTION public.post_license_service_form_set(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_license_service_form_set(uuid, uuid) TO authenticated, service_role;

-- Internal resolver is not browser reachable.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = '_resolve_application_workflow'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. GAP-F5-05: licence variation / voluntary surrender inputs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_license_lifecycle_input(_application_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH v AS (
    SELECT dc.code, x.value_text, x.value_date, x.value_json
      FROM public.form_submission_values x
      JOIN public.form_responses r ON r.id = x.response_id
      JOIN public.data_concepts dc ON dc.id = x.data_concept_id
     WHERE r.entity_type = 'application' AND r.entity_id = _application_id
       AND dc.code LIKE 'LICENCE.%'
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'variation_type', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.VARIATION_TYPE' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'variation_rationale', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.VARIATION_RATIONALE' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'variation_items', (SELECT value_json FROM v
        WHERE code = 'LICENCE.VARIATION_ITEMS' AND jsonb_typeof(value_json) = 'array' LIMIT 1),
    'surrender_reason', (SELECT btrim(value_text) FROM v
        WHERE code = 'LICENCE.SURRENDER_REASON' AND btrim(COALESCE(value_text,'')) <> '' LIMIT 1),
    'surrender_effective_date', (SELECT value_date FROM v
        WHERE code = 'LICENCE.SURRENDER_EFFECTIVE_DATE' AND value_date IS NOT NULL LIMIT 1)
  ))
$$;

REVOKE ALL ON FUNCTION public.post_license_lifecycle_input(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_license_lifecycle_input(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.post_license_matter_kind(_service_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(COALESCE(_service_code,''))
           WHEN 'RENEWAL' THEN 'renewal'
           WHEN 'PLS_LICENCE_VARIATION' THEN 'variation'
           WHEN 'PLS_VOLUNTARY_SURRENDER' THEN 'surrender'
           ELSE NULL END
$$;

GRANT EXECUTE ON FUNCTION public.post_license_matter_kind(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. GAP-F5-17: fee-aware submission boundary (no blanket payment gate)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_license_fee_assessment(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_license_id uuid;
  v_service_id uuid;
  v_code text;
  v_matter text;
  v_lines jsonb := '[]'::jsonb;
  v_amount numeric := 0;
  v_currency text := 'JMD';
  v_basis text;
BEGIN
  SELECT id, data, request_kind INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('state','APPLICATION_NOT_FOUND','requires_payment', false, 'amount_due', 0);
  END IF;
  IF v_app.request_kind <> 'POST_LICENSE' THEN
    RETURN jsonb_build_object('state','NOT_POST_LICENSE','requires_payment', true, 'amount_due', NULL);
  END IF;

  v_license_id := NULLIF(btrim(COALESCE(v_app.data->>'license_id','')),'')::uuid;
  v_service_id := NULLIF(btrim(COALESCE(v_app.data->>'service_id','')),'')::uuid;
  v_code := public.post_license_effect_key(v_service_id);
  v_matter := public.post_license_matter_kind(v_code);

  IF v_license_id IS NULL THEN
    RETURN jsonb_build_object('state','LICENSE_NOT_BOUND','requires_payment', false, 'amount_due', 0,
                              'basis','NO_LICENCE_CONTEXT', 'lines','[]'::jsonb);
  END IF;

  IF v_matter IS NULL THEN
    -- No lifecycle fee category is configured for this service class. F6 owns
    -- fee schedules; absent configuration is explicit, not invented pricing.
    RETURN jsonb_build_object('state','NO_FEE_CATEGORY_CONFIGURED',
                              'requires_payment', false, 'amount_due', 0,
                              'basis','BUSINESS_CONFIGURATION_ABSENT',
                              'service_code', v_code, 'lines','[]'::jsonb);
  END IF;

  v_lines := public.license_fee_resolve(v_license_id, v_matter, NULL);

  SELECT COALESCE(sum((x->>'amount')::numeric), 0),
         COALESCE(max(x->>'currency'), 'JMD')
    INTO v_amount, v_currency
    FROM jsonb_array_elements(v_lines) x
   WHERE COALESCE((x->>'blocking')::boolean, true);

  v_basis := CASE
    WHEN jsonb_array_length(v_lines) = 0 THEN 'NO_FEE_RESOLVED'
    WHEN v_amount <= 0 THEN 'WAIVED_OR_ZERO_RATED'
    ELSE 'ASSESSED' END;

  RETURN jsonb_build_object(
    'state','OK',
    'application_id', _application_id,
    'license_id', v_license_id,
    'service_code', v_code,
    'matter_kind', v_matter,
    'amount_due', ROUND(COALESCE(v_amount,0), 2),
    'currency', v_currency,
    'basis', v_basis,
    'requires_payment', COALESCE(v_amount,0) > 0,
    'lines', v_lines);
END $$;

REVOKE ALL ON FUNCTION public.post_license_fee_assessment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_license_fee_assessment(uuid) TO authenticated, service_role;
