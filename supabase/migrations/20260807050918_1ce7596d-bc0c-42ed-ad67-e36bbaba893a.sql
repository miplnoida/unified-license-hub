-- ============ 1. security_event_logs hardening ============
ALTER TABLE public.security_event_logs
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS object_type text,
  ADD COLUMN IF NOT EXISTS object_id text,
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS idx_security_event_logs_time ON public.security_event_logs (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_type ON public.security_event_logs (event_type, event_time DESC);

-- Redact credential-like keys from any jsonb payload before persistence.
CREATE OR REPLACE FUNCTION public.redact_sensitive_jsonb(_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN _payload
    ELSE (
      SELECT coalesce(jsonb_object_agg(
        k,
        CASE WHEN lower(k) ~ '(token|secret|password|passwd|api[_-]?key|authorization|bearer|service[_-]?role|credential|private[_-]?key)'
             THEN to_jsonb('[redacted]'::text)
             ELSE v END
      ), '{}'::jsonb)
      FROM jsonb_each(_payload) AS e(k, v)
    )
  END
$$;

DROP FUNCTION IF EXISTS public.log_security_event(security_event_type, text, inet, text, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type security_event_type,
  _target_resource text DEFAULT NULL,
  _ip_address inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _detail jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _severity text DEFAULT 'medium',
  _module text DEFAULT NULL,
  _action text DEFAULT NULL,
  _object_type text DEFAULT NULL,
  _object_id text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user
  ORDER BY CASE role::text
    WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 WHEN 'supervisor' THEN 3 ELSE 9 END
  LIMIT 1;

  INSERT INTO public.security_event_logs (
    user_id, user_role, event_type, ip_address, user_agent, target_resource,
    detail, metadata, severity, module, action, object_type, object_id, correlation_id
  ) VALUES (
    v_user, v_role, _event_type, _ip_address, _user_agent, _target_resource,
    public.redact_sensitive_jsonb(_detail), public.redact_sensitive_jsonb(_metadata),
    coalesce(nullif(btrim(_severity), ''), 'medium'), _module, _action, _object_type, _object_id, _correlation_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.log_security_event_as_actor(uuid, security_event_type, text, inet, text, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.log_security_event_as_actor(
  _actor_id uuid,
  _event_type security_event_type,
  _target_resource text DEFAULT NULL,
  _ip_address inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _detail jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _severity text DEFAULT 'medium',
  _module text DEFAULT NULL,
  _action text DEFAULT NULL,
  _object_type text DEFAULT NULL,
  _object_id text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = _actor_id
  ORDER BY CASE role::text
    WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 WHEN 'supervisor' THEN 3 ELSE 9 END
  LIMIT 1;

  INSERT INTO public.security_event_logs (
    user_id, user_role, event_type, ip_address, user_agent, target_resource,
    detail, metadata, severity, module, action, object_type, object_id, correlation_id
  ) VALUES (
    _actor_id, v_role, _event_type, _ip_address, _user_agent, _target_resource,
    public.redact_sensitive_jsonb(_detail), public.redact_sensitive_jsonb(_metadata),
    coalesce(nullif(btrim(_severity), ''), 'medium'), _module, _action, _object_type, _object_id, _correlation_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Append-only enforcement for the security log
REVOKE UPDATE, DELETE ON public.security_event_logs FROM authenticated, anon;
DROP POLICY IF EXISTS security_event_logs_no_update ON public.security_event_logs;
CREATE POLICY security_event_logs_no_update ON public.security_event_logs
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
DROP POLICY IF EXISTS security_event_logs_no_delete ON public.security_event_logs;
CREATE POLICY security_event_logs_no_delete ON public.security_event_logs
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- ============ 2. rule_overrides (override & justification registry) ============
ALTER TABLE public.rule_overrides
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS source_route text,
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

REVOKE UPDATE, DELETE ON public.rule_overrides FROM authenticated, anon;
DROP POLICY IF EXISTS rule_overrides_no_update ON public.rule_overrides;
CREATE POLICY rule_overrides_no_update ON public.rule_overrides
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
DROP POLICY IF EXISTS rule_overrides_no_delete ON public.rule_overrides;
CREATE POLICY rule_overrides_no_delete ON public.rule_overrides
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
DROP POLICY IF EXISTS external_users_denied_rule_overrides ON public.rule_overrides;
CREATE POLICY external_users_denied_rule_overrides ON public.rule_overrides
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.has_external_role(auth.uid()))
  WITH CHECK (NOT public.has_external_role(auth.uid()));

-- ============ 3. Decision readiness gates ============
CREATE OR REPLACE FUNCTION public.decision_gate_status(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval RECORD;
  v_blockers int := 0;
  v_open_rfi int := 0;
  v_paid numeric := 0;
  v_gates jsonb := '[]'::jsonb;
  v_blocking int := 0;
BEGIN
  SELECT * INTO v_eval
  FROM public.sufficiency_evaluations
  WHERE application_id = _application_id
  ORDER BY evaluated_at DESC
  LIMIT 1;

  IF v_eval.id IS NOT NULL THEN
    SELECT count(*) INTO v_blockers
    FROM public.sufficiency_evaluation_results r
    WHERE r.evaluation_id = v_eval.id
      AND r.status = 'fail'
      AND r.severity = 'blocker'
      AND NOT EXISTS (
        SELECT 1 FROM public.sufficiency_overrides o WHERE o.evaluation_result_id = r.id
      );
  END IF;

  SELECT count(*) INTO v_open_rfi
  FROM public.application_rfis
  WHERE application_id = _application_id AND status = 'open';

  SELECT coalesce(sum(amount), 0) INTO v_paid
  FROM public.payments
  WHERE application_id = _application_id AND status IN ('paid', 'completed', 'verified', 'success');

  v_gates := v_gates || jsonb_build_object(
    'key', 'sufficiency_blockers',
    'label', 'Sufficiency blockers resolved or overridden',
    'blocking', true,
    'passed', (v_eval.id IS NOT NULL AND v_blockers = 0),
    'detail', CASE
      WHEN v_eval.id IS NULL THEN 'No sufficiency evaluation has been run'
      WHEN v_blockers > 0 THEN v_blockers || ' unresolved blocker(s)'
      ELSE 'All blockers cleared'
    END
  );

  v_gates := v_gates || jsonb_build_object(
    'key', 'open_rfis',
    'label', 'No open requests for information',
    'blocking', true,
    'passed', (v_open_rfi = 0),
    'detail', CASE WHEN v_open_rfi > 0 THEN v_open_rfi || ' open RFI(s)' ELSE 'None open' END
  );

  v_gates := v_gates || jsonb_build_object(
    'key', 'payment',
    'label', 'Application fees settled',
    'blocking', false,
    'passed', (v_paid > 0),
    'detail', CASE WHEN v_paid > 0 THEN 'Settled amount ' || v_paid::text ELSE 'No settled payment recorded' END
  );

  SELECT count(*) INTO v_blocking
  FROM jsonb_array_elements(v_gates) g
  WHERE (g->>'blocking')::boolean AND NOT (g->>'passed')::boolean;

  RETURN jsonb_build_object(
    'application_id', _application_id,
    'ready', v_blocking = 0,
    'blocking_unmet', v_blocking,
    'evaluated_at', now(),
    'gates', v_gates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decision_gate_status(uuid) TO authenticated, service_role;

-- ============ 4. Immutable issued decision artifacts ============
CREATE TABLE IF NOT EXISTS public.decision_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (artifact_type IN ('decision_letter', 'license_certificate')),
  version integer NOT NULL,
  decision text,
  template_id uuid,
  template_version text,
  rendered_html text,
  merge_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  issuing_regulator_id uuid,
  effective_date date,
  expiry_date date,
  checksum text,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, artifact_type, version)
);

GRANT SELECT, INSERT ON public.decision_artifacts TO authenticated;
GRANT ALL ON public.decision_artifacts TO service_role;
ALTER TABLE public.decision_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_artifacts_internal_read ON public.decision_artifacts
  FOR SELECT TO authenticated
  USING (NOT public.has_external_role(auth.uid()));

CREATE POLICY decision_artifacts_no_update ON public.decision_artifacts
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY decision_artifacts_no_delete ON public.decision_artifacts
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
REVOKE UPDATE, DELETE ON public.decision_artifacts FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.issue_decision_artifact(
  _application_id uuid,
  _artifact_type text,
  _rendered_html text,
  _merge_data jsonb DEFAULT '{}'::jsonb,
  _decision text DEFAULT NULL,
  _template_id uuid DEFAULT NULL,
  _template_version text DEFAULT NULL,
  _rationale text DEFAULT NULL,
  _conditions jsonb DEFAULT '[]'::jsonb,
  _issuing_regulator_id uuid DEFAULT NULL,
  _effective_date date DEFAULT NULL,
  _expiry_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_missing text[] := '{}';
  v_version int;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF public.has_external_role(v_actor) THEN
    RAISE EXCEPTION 'not authorised to issue decision artifacts';
  END IF;
  IF _artifact_type NOT IN ('decision_letter', 'license_certificate') THEN
    RAISE EXCEPTION 'invalid artifact_type';
  END IF;

  -- required merge fields
  IF coalesce(nullif(btrim(coalesce(_merge_data->>'application_number', '')), ''), '') = '' THEN
    v_missing := v_missing || 'application_number';
  END IF;
  IF coalesce(nullif(btrim(coalesce(_merge_data->>'applicant_name', '')), ''), '') = '' THEN
    v_missing := v_missing || 'applicant_name';
  END IF;
  IF coalesce(nullif(btrim(coalesce(_merge_data->>'license_type', '')), ''), '') = '' THEN
    v_missing := v_missing || 'license_type';
  END IF;
  IF _artifact_type = 'decision_letter' AND coalesce(btrim(coalesce(_rationale, '')), '') = '' THEN
    v_missing := v_missing || 'rationale';
  END IF;
  IF _artifact_type = 'license_certificate' AND _effective_date IS NULL THEN
    v_missing := v_missing || 'effective_date';
  END IF;
  IF coalesce(btrim(coalesce(_rendered_html, '')), '') = '' THEN
    v_missing := v_missing || 'rendered_document';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MISSING_MERGE_FIELDS', 'missing', to_jsonb(v_missing));
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.decision_artifacts
  WHERE application_id = _application_id AND artifact_type = _artifact_type;

  INSERT INTO public.decision_artifacts (
    application_id, artifact_type, version, decision, template_id, template_version,
    rendered_html, merge_data, rationale, conditions, issuing_regulator_id,
    effective_date, expiry_date, checksum, issued_by
  ) VALUES (
    _application_id, _artifact_type, v_version, _decision, _template_id, _template_version,
    _rendered_html, coalesce(_merge_data, '{}'::jsonb), _rationale, coalesce(_conditions, '[]'::jsonb),
    _issuing_regulator_id, _effective_date, _expiry_date,
    md5(coalesce(_rendered_html, '') || coalesce(_merge_data::text, '')), v_actor
  ) RETURNING id INTO v_id;

  PERFORM public.log_compliance_audit(
    'APPROVE'::compliance_audit_action,
    'decision_artifact',
    v_id::text,
    NULL,
    jsonb_build_object('application_id', _application_id, 'artifact_type', _artifact_type, 'version', v_version),
    NULL, NULL, NULL,
    jsonb_build_object('source', 'issue_decision_artifact')
  );

  RETURN jsonb_build_object('success', true, 'id', v_id, 'version', v_version);
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_decision_artifact(uuid, text, text, jsonb, text, uuid, text, text, jsonb, uuid, date, date) TO authenticated, service_role;