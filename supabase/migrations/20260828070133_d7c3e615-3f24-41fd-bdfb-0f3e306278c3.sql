-- =====================================================================
-- F1-B — remaining gap closure: decision authority (GAP-F1-01),
-- service completeness (GAP-F1-04), anon config reads (GAP-F1-02),
-- fee/verification governed writes (GAP-F1-05).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GAP-F1-02 — remove anon SELECT on non-allowlisted configuration tables
-- ---------------------------------------------------------------------
REVOKE SELECT ON public.form_templates FROM anon;
REVOKE SELECT ON public.notification_templates FROM anon;
REVOKE SELECT ON public.escalation_rules FROM anon;
REVOKE SELECT ON public.engine_rules FROM anon;
REVOKE SELECT ON public.license_fee_bindings FROM anon;
REVOKE SELECT ON public.license_verification_templates FROM anon;
REVOKE SELECT ON public.process_templates FROM anon;
REVOKE SELECT ON public.license_lifecycle_configs FROM anon;

-- ---------------------------------------------------------------------
-- 2. GAP-F1-01 — governed decision authority writers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decision_authority_rule_upsert(
  _decision_type text,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _required_module_key text DEFAULT NULL,
  _required_permission_key text DEFAULT NULL,
  _requires_maker_checker boolean DEFAULT true,
  _requires_committee boolean DEFAULT false,
  _committee_kind text DEFAULT NULL,
  _minimum_quorum integer DEFAULT NULL,
  _requires_conflict_clearance boolean DEFAULT true,
  _allow_delegation boolean DEFAULT true,
  _enforcement_mode text DEFAULT 'OBSERVE_ONLY',
  _notes text DEFAULT NULL,
  _id uuid DEFAULT NULL,
  _effective_from timestamptz DEFAULT NULL,
  _effective_to timestamptz DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_from timestamptz := coalesce(_effective_from, now());
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT (public.has_permission(v_uid, 'role_management', 'manage_config')
          OR public.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorised: decision authority configuration requires role_management.manage_config';
  END IF;

  IF _decision_type IS NULL OR btrim(_decision_type) = '' THEN
    RAISE EXCEPTION 'decision_type_required';
  END IF;
  IF _enforcement_mode IS NULL OR _enforcement_mode NOT IN ('OFF','OBSERVE_ONLY','ENFORCED') THEN
    RAISE EXCEPTION 'invalid_enforcement_mode: use OFF, OBSERVE_ONLY or ENFORCED';
  END IF;
  IF _effective_to IS NOT NULL AND _effective_to <= v_from THEN
    RAISE EXCEPTION 'invalid_effective_window: effective_to must be after effective_from';
  END IF;
  IF _enforcement_mode = 'ENFORCED'
     AND (_required_module_key IS NULL OR _required_permission_key IS NULL)
     AND NOT _requires_committee THEN
    RAISE EXCEPTION 'enforced_rule_needs_requirement: an enforced rule must require a permission or a committee';
  END IF;

  -- Conflict validation: no two active rules for identical scope may overlap.
  IF EXISTS (
    SELECT 1 FROM public.decision_authority_rules r
     WHERE r.status = 'active'
       AND (_id IS NULL OR r.id <> _id)
       AND r.decision_type = _decision_type
       AND r.regulator_id IS NOT DISTINCT FROM _regulator_id
       AND r.regulatory_function_id IS NOT DISTINCT FROM _regulatory_function_id
       AND r.sector_id IS NOT DISTINCT FROM _sector_id
       AND r.sub_sector_id IS NOT DISTINCT FROM _sub_sector_id
       AND r.service_id IS NOT DISTINCT FROM _service_id
       AND tstzrange(r.effective_from, r.effective_to, '[)')
           && tstzrange(v_from, _effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'decision_authority_conflict: an active rule for the same scope already covers this period';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.decision_authority_rules(
      regulator_id, regulatory_function_id, decision_type, sector_id, sub_sector_id,
      service_id, required_module_key, required_permission_key, requires_maker_checker,
      requires_committee, committee_kind, minimum_quorum, requires_conflict_clearance,
      allow_delegation, enforcement_mode, notes, created_by, effective_from, effective_to)
    VALUES (_regulator_id, _regulatory_function_id, _decision_type, _sector_id, _sub_sector_id,
      _service_id, _required_module_key, _required_permission_key, _requires_maker_checker,
      _requires_committee, _committee_kind, _minimum_quorum, _requires_conflict_clearance,
      _allow_delegation, _enforcement_mode, _notes, v_uid, v_from, _effective_to)
    RETURNING id, to_jsonb(decision_authority_rules.*) INTO v_id, v_new;

    INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by)
    VALUES ('decision_authority_rules', v_id, 'CREATE', NULL, v_new, _reason, v_uid);
  ELSE
    SELECT to_jsonb(r.*) INTO v_old FROM public.decision_authority_rules r WHERE r.id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

    UPDATE public.decision_authority_rules SET
      regulator_id = _regulator_id,
      regulatory_function_id = _regulatory_function_id,
      decision_type = _decision_type,
      sector_id = _sector_id,
      sub_sector_id = _sub_sector_id,
      service_id = _service_id,
      required_module_key = _required_module_key,
      required_permission_key = _required_permission_key,
      requires_maker_checker = _requires_maker_checker,
      requires_committee = _requires_committee,
      committee_kind = _committee_kind,
      minimum_quorum = _minimum_quorum,
      requires_conflict_clearance = _requires_conflict_clearance,
      allow_delegation = _allow_delegation,
      enforcement_mode = _enforcement_mode,
      notes = _notes,
      effective_from = v_from,
      effective_to = _effective_to,
      updated_at = now()
    WHERE id = _id
    RETURNING id, to_jsonb(decision_authority_rules.*) INTO v_id, v_new;

    INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by)
    VALUES ('decision_authority_rules', v_id, 'UPDATE', v_old, v_new, _reason, v_uid);
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decision_authority_rule_set_status(
  _id uuid, _status text, _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_old jsonb; v_new jsonb;
BEGIN
  IF NOT (public.has_permission(v_uid, 'role_management', 'manage_config')
          OR public.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorised: decision authority configuration requires role_management.manage_config';
  END IF;
  IF _status NOT IN ('active','retired') THEN
    RAISE EXCEPTION 'invalid_status: use active or retired';
  END IF;

  SELECT to_jsonb(r.*) INTO v_old FROM public.decision_authority_rules r WHERE r.id = _id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  IF _status = 'active' AND EXISTS (
    SELECT 1 FROM public.decision_authority_rules r, public.decision_authority_rules t
     WHERE t.id = _id AND r.id <> _id AND r.status = 'active'
       AND r.decision_type = t.decision_type
       AND r.regulator_id IS NOT DISTINCT FROM t.regulator_id
       AND r.regulatory_function_id IS NOT DISTINCT FROM t.regulatory_function_id
       AND r.sector_id IS NOT DISTINCT FROM t.sector_id
       AND r.sub_sector_id IS NOT DISTINCT FROM t.sub_sector_id
       AND r.service_id IS NOT DISTINCT FROM t.service_id
       AND tstzrange(r.effective_from, r.effective_to, '[)')
           && tstzrange(t.effective_from, t.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'decision_authority_conflict: reactivating this rule would overlap an active rule for the same scope';
  END IF;

  UPDATE public.decision_authority_rules
     SET status = _status,
         effective_to = CASE WHEN _status = 'retired' THEN least(coalesce(effective_to, now()), now()) ELSE effective_to END,
         updated_at = now()
   WHERE id = _id
  RETURNING to_jsonb(decision_authority_rules.*) INTO v_new;

  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by)
  VALUES ('decision_authority_rules', _id,
          CASE WHEN _status = 'retired' THEN 'RETIRE' ELSE 'REACTIVATE' END,
          v_old, v_new, _reason, v_uid);

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.decision_authority_rule_upsert(text,uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean,text,integer,boolean,boolean,text,text,uuid,timestamptz,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decision_authority_rule_upsert(text,uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean,text,integer,boolean,boolean,text,text,uuid,timestamptz,timestamptz,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decision_authority_rule_set_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decision_authority_rule_set_status(uuid,text,text) TO authenticated, service_role;

-- Operator overview: rules with human labels + observation telemetry.
CREATE OR REPLACE FUNCTION public.decision_authority_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_internal_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'rules', coalesce((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.decision_type, x.effective_from DESC) FROM (
        SELECT r.id, r.decision_type, r.enforcement_mode, r.status,
               r.required_module_key, r.required_permission_key,
               r.requires_maker_checker, r.requires_committee, r.committee_kind,
               r.minimum_quorum, r.requires_conflict_clearance, r.allow_delegation,
               r.effective_from, r.effective_to, r.notes,
               r.regulator_id, r.regulatory_function_id, r.sector_id, r.sub_sector_id, r.service_id,
               reg.name AS regulator_name, rf.name AS regulatory_function_name,
               sec.name AS sector_name, ss.name AS sub_sector_name, svc.name AS service_name,
               (SELECT count(*) FROM public.decision_authority_observations o WHERE o.rule_id = r.id) AS observation_count,
               (SELECT count(*) FROM public.decision_authority_observations o WHERE o.rule_id = r.id AND o.would_allow = false) AS would_deny_count
          FROM public.decision_authority_rules r
          LEFT JOIN public.regulators reg ON reg.id = r.regulator_id
          LEFT JOIN public.regulatory_functions rf ON rf.id = r.regulatory_function_id
          LEFT JOIN public.sectors sec ON sec.id = r.sector_id
          LEFT JOIN public.sub_sectors ss ON ss.id = r.sub_sector_id
          LEFT JOIN public.services svc ON svc.id = r.service_id
      ) x), '[]'::jsonb),
    'observation_summary', coalesce((
      SELECT jsonb_agg(to_jsonb(y) ORDER BY y.decision_type) FROM (
        SELECT o.decision_type, o.evaluated_mode,
               count(*) AS evaluations,
               count(*) FILTER (WHERE o.would_allow = false) AS would_deny,
               max(o.created_at) AS last_evaluated_at
          FROM public.decision_authority_observations o
         GROUP BY o.decision_type, o.evaluated_mode
      ) y), '[]'::jsonb),
    'recent_observations', coalesce((
      SELECT jsonb_agg(to_jsonb(z) ORDER BY z.created_at DESC) FROM (
        SELECT o.id, o.decision_type, o.evaluated_mode, o.would_allow, o.reasons,
               o.subject_reference, o.actor_id, o.created_at
          FROM public.decision_authority_observations o
         ORDER BY o.created_at DESC LIMIT 100
      ) z), '[]'::jsonb),
    'decision_type_census', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.decision_type) FROM (
        SELECT coalesce(s.decision_type, '(unclassified)') AS decision_type, count(*) AS services
          FROM public.services s GROUP BY 1
      ) c), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.decision_authority_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decision_authority_overview() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. GAP-F1-01 — the resolver is now consumed by the product decision path.
--    Every recorded approval action evaluates decision authority and records
--    an observation. Behaviour changes only where an operator set ENFORCED.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_approval_action_decision_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_decision_type text;
  v_regulator uuid;
  v_entity uuid;
  v_res jsonb;
BEGIN
  v_decision_type := lower(coalesce(nullif(NEW.entity_type, ''), 'application'))
                     || '.' || lower(coalesce(nullif(NEW.action_type, ''), nullif(NEW.action, ''), 'unknown'));
  BEGIN
    IF NEW.application_id IS NOT NULL THEN
      SELECT a.regulator_id, a.entity_id INTO v_regulator, v_entity
        FROM public.applications a WHERE a.id = NEW.application_id;
    END IF;

    v_res := public.resolve_decision_authority(
      NEW.actor_id, v_decision_type, v_regulator, NULL, v_entity,
      NULL, NULL, NULL, coalesce(NEW.application_id, NEW.entity_id)::text, true);
  EXCEPTION WHEN OTHERS THEN
    -- Observation must never break a regulatory decision that RBAC allowed.
    RETURN NEW;
  END;

  IF v_res IS NOT NULL
     AND coalesce(v_res->>'mode', 'OFF') = 'ENFORCED'
     AND coalesce((v_res->>'allowed')::boolean, true) = false THEN
    RAISE EXCEPTION 'DECISION_AUTHORITY_DENIED: % %', v_decision_type, coalesce(v_res->>'reasons', '[]');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_approval_action_decision_authority ON public.approval_actions;
CREATE TRIGGER trg_approval_action_decision_authority
BEFORE INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_approval_action_decision_authority();

-- ---------------------------------------------------------------------
-- 4. GAP-F1-04 — service configuration expectations + completeness model
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_config_expectations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  lifecycle_stage text,
  decision_type text,
  dimension text NOT NULL CHECK (dimension IN ('workflow','fee','forms_documents','sla','decision_authority')),
  disposition text NOT NULL CHECK (disposition IN ('REQUIRED','NOT_APPLICABLE','SHARED_FALLBACK')),
  justification text,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.service_config_expectations TO authenticated;
GRANT ALL ON public.service_config_expectations TO service_role;
ALTER TABLE public.service_config_expectations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_config_expectations_read ON public.service_config_expectations;
CREATE POLICY service_config_expectations_read
  ON public.service_config_expectations FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

DROP TRIGGER IF EXISTS trg_service_config_expectations_updated_at ON public.service_config_expectations;
CREATE TRIGGER trg_service_config_expectations_updated_at
BEFORE UPDATE ON public.service_config_expectations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_service_config_expectations_lookup
  ON public.service_config_expectations(dimension, service_id, lifecycle_stage, decision_type)
  WHERE is_active;

-- Governed configuration registry entries (writes only via config_save/retire).
INSERT INTO public.config_governed_tables(
  table_name, domain, required_module_key, required_create_action, required_edit_action,
  soft_delete_column, soft_delete_retired_value, allow_hard_delete, immutable_columns, notes)
VALUES
  ('service_config_expectations','services','settings','edit','edit','is_active','false',true,
   ARRAY['id','created_at','created_by'],'Per-service configuration expectation classification (GAP-F1-04)'),
  ('license_fee_bindings','fees','settings','edit','edit','is_active','false',false,
   ARRAY['id','created_at'],'P04 licence fee bindings (GAP-F1-05)'),
  ('license_fee_process_settings','fees','settings','edit','edit',NULL,NULL,true,
   ARRAY['id','created_at'],'P04 per-process fee enablement (GAP-F1-05)'),
  ('license_verification_templates','process','settings','edit','edit','is_active','false',false,
   ARRAY['id','created_at'],'P04 verification templates (GAP-F1-05)')
ON CONFLICT (table_name) DO NOTHING;

-- Direct DML is withdrawn: these tables are now governed-writer only.
REVOKE INSERT, UPDATE, DELETE ON public.license_fee_bindings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.license_fee_process_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.license_verification_templates FROM authenticated;

CREATE OR REPLACE VIEW public.service_configuration_completeness
WITH (security_invoker = on) AS
WITH dims(dimension) AS (
  VALUES ('workflow'),('fee'),('forms_documents'),('sla'),('decision_authority')
),
base AS (
  SELECT s.id AS service_id, s.name AS service_name, s.code AS service_code,
         s.status, s.lifecycle_stage, s.decision_type, s.sector_id, s.sub_sector_id,
         s.workflow_id, s.sla_days, d.dimension
    FROM public.services s CROSS JOIN dims d
),
resolved AS (
  SELECT b.*,
         (SELECT e.disposition
            FROM public.service_config_expectations e
           WHERE e.is_active
             AND e.dimension = b.dimension
             AND e.effective_from <= now()
             AND (e.effective_to IS NULL OR e.effective_to > now())
             AND (e.service_id IS NULL OR e.service_id = b.service_id)
             AND (e.lifecycle_stage IS NULL OR e.lifecycle_stage = b.lifecycle_stage)
             AND (e.decision_type IS NULL OR e.decision_type = b.decision_type)
           ORDER BY (e.service_id IS NOT NULL)::int DESC,
                    (e.decision_type IS NOT NULL)::int DESC,
                    (e.lifecycle_stage IS NOT NULL)::int DESC,
                    e.effective_from DESC
           LIMIT 1) AS disposition,
         (SELECT e.justification
            FROM public.service_config_expectations e
           WHERE e.is_active
             AND e.dimension = b.dimension
             AND e.effective_from <= now()
             AND (e.effective_to IS NULL OR e.effective_to > now())
             AND (e.service_id IS NULL OR e.service_id = b.service_id)
             AND (e.lifecycle_stage IS NULL OR e.lifecycle_stage = b.lifecycle_stage)
             AND (e.decision_type IS NULL OR e.decision_type = b.decision_type)
           ORDER BY (e.service_id IS NOT NULL)::int DESC,
                    (e.decision_type IS NOT NULL)::int DESC,
                    (e.lifecycle_stage IS NOT NULL)::int DESC,
                    e.effective_from DESC
           LIMIT 1) AS justification
    FROM base b
),
evaluated AS (
  SELECT r.*,
         CASE r.dimension
           WHEN 'workflow' THEN r.workflow_id IS NOT NULL
           WHEN 'fee' THEN EXISTS (
             SELECT 1 FROM public.fee_configurations f
              WHERE f.service_id = r.service_id AND coalesce(f.is_active, true))
           WHEN 'forms_documents' THEN EXISTS (
             SELECT 1 FROM public.form_templates t
              WHERE t.service_id = r.service_id AND t.status = 'published')
           WHEN 'sla' THEN r.sla_days IS NOT NULL
           WHEN 'decision_authority' THEN EXISTS (
             SELECT 1 FROM public.decision_authority_rules a
              WHERE a.status = 'active' AND a.service_id = r.service_id
                AND a.effective_from <= now()
                AND (a.effective_to IS NULL OR a.effective_to > now()))
         END AS direct_ok,
         CASE r.dimension
           WHEN 'workflow' THEN false
           WHEN 'fee' THEN EXISTS (
             SELECT 1 FROM public.fee_configurations f
              WHERE f.service_id IS NULL AND coalesce(f.is_active, true)
                AND (f.sub_sector_id = r.sub_sector_id OR f.sector_id = r.sector_id))
           WHEN 'forms_documents' THEN EXISTS (
             SELECT 1 FROM public.form_templates t
              WHERE t.service_id IS NULL AND t.status = 'published'
                AND (t.sub_sector_id = r.sub_sector_id OR t.sector_id = r.sector_id))
           WHEN 'sla' THEN EXISTS (
             SELECT 1 FROM public.sla_configurations c
              WHERE c.active AND c.process_type = coalesce(r.lifecycle_stage, ''))
           WHEN 'decision_authority' THEN EXISTS (
             SELECT 1 FROM public.decision_authority_rules a
              WHERE a.status = 'active' AND a.service_id IS NULL
                AND a.decision_type IS NOT DISTINCT FROM r.decision_type
                AND a.effective_from <= now()
                AND (a.effective_to IS NULL OR a.effective_to > now()))
         END AS fallback_ok
    FROM resolved r
)
SELECT service_id, service_name, service_code, status, lifecycle_stage, decision_type,
       sector_id, sub_sector_id, dimension,
       coalesce(disposition, 'REQUIRED') AS disposition,
       justification,
       direct_ok, fallback_ok,
       CASE
         WHEN coalesce(disposition, 'REQUIRED') = 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE'
         WHEN direct_ok THEN 'SATISFIED'
         WHEN fallback_ok THEN 'SATISFIED_BY_FALLBACK'
         ELSE 'MISSING_REQUIRED'
       END AS state,
       CASE
         WHEN coalesce(disposition, 'REQUIRED') = 'NOT_APPLICABLE' THEN true
         WHEN direct_ok OR fallback_ok THEN true
         ELSE false
       END AS is_complete
  FROM evaluated;

GRANT SELECT ON public.service_configuration_completeness TO authenticated;
GRANT SELECT ON public.service_configuration_completeness TO service_role;

CREATE OR REPLACE FUNCTION public.service_configuration_completeness_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_internal_staff(v_uid) THEN RAISE EXCEPTION 'not_authorised'; END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'services', (SELECT count(*) FROM public.services),
    'totals', coalesce((
      SELECT jsonb_object_agg(state, n) FROM (
        SELECT state, count(*) AS n FROM public.service_configuration_completeness GROUP BY state
      ) t), '{}'::jsonb),
    'by_dimension', coalesce((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.dimension) FROM (
        SELECT dimension,
               count(*) AS evaluated,
               count(*) FILTER (WHERE state = 'SATISFIED') AS satisfied,
               count(*) FILTER (WHERE state = 'SATISFIED_BY_FALLBACK') AS satisfied_by_fallback,
               count(*) FILTER (WHERE state = 'NOT_APPLICABLE') AS not_applicable,
               count(*) FILTER (WHERE state = 'MISSING_REQUIRED') AS missing_required
          FROM public.service_configuration_completeness GROUP BY dimension
      ) d), '[]'::jsonb),
    'incomplete_services', (SELECT count(DISTINCT service_id)
                              FROM public.service_configuration_completeness
                             WHERE state = 'MISSING_REQUIRED'),
    'incomplete', coalesce((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.service_name, i.dimension) FROM (
        SELECT service_id, service_name, service_code, lifecycle_stage, decision_type, dimension, disposition
          FROM public.service_configuration_completeness
         WHERE state = 'MISSING_REQUIRED'
      ) i), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.service_configuration_completeness_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_configuration_completeness_report() TO authenticated, service_role;

-- Permanent gate: returns one row per unexplained incomplete active service.
CREATE OR REPLACE FUNCTION public.service_configuration_gate()
RETURNS TABLE(service_id uuid, service_name text, dimension text, disposition text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.service_id, c.service_name, c.dimension, c.disposition
    FROM public.service_configuration_completeness c
   WHERE c.state = 'MISSING_REQUIRED'
     AND coalesce(c.status, 'active') = 'active'
   ORDER BY c.service_name, c.dimension;
$function$;

REVOKE ALL ON FUNCTION public.service_configuration_gate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_configuration_gate() TO authenticated, service_role;