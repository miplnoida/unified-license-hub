-- =====================================================================
-- MC-02 PART 3 — RISK-BASED TRIAGE
-- =====================================================================

-- ---------- 1. CANONICAL DIMENSIONS ---------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS consumer_harm text,
  ADD COLUMN IF NOT EXISTS conduct_risk_level text,
  ADD COLUMN IF NOT EXISTS systemic_potential text NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS triage_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS triage_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS triage_confirmation_status text,
  ADD COLUMN IF NOT EXISTS triage_override_reason text,
  ADD COLUMN IF NOT EXISTS systemic_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS systemic_confirmed_at timestamptz;

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_consumer_harm_chk;
ALTER TABLE public.complaints ADD CONSTRAINT complaints_consumer_harm_chk
  CHECK (consumer_harm IS NULL OR consumer_harm IN ('LOW','MODERATE','HIGH','SEVERE'));
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_conduct_risk_level_chk;
ALTER TABLE public.complaints ADD CONSTRAINT complaints_conduct_risk_level_chk
  CHECK (conduct_risk_level IS NULL OR conduct_risk_level IN ('LOW','MODERATE','HIGH','CRITICAL'));
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_systemic_potential_chk;
ALTER TABLE public.complaints ADD CONSTRAINT complaints_systemic_potential_chk
  CHECK (systemic_potential IN ('INDIVIDUAL','RECURRING','POTENTIAL_SYSTEMIC','CONFIRMED_SYSTEMIC'));
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_triage_confirmation_chk;
ALTER TABLE public.complaints ADD CONSTRAINT complaints_triage_confirmation_chk
  CHECK (triage_confirmation_status IS NULL OR triage_confirmation_status IN ('PENDING','CONFIRMED','OVERRIDDEN'));

-- compatibility mapping helpers (severity remains an operational projection)
CREATE OR REPLACE FUNCTION public.complaint_harm_to_severity(_harm text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(coalesce(_harm,''))
           WHEN 'LOW' THEN 'low' WHEN 'MODERATE' THEN 'medium'
           WHEN 'HIGH' THEN 'high' WHEN 'SEVERE' THEN 'critical' ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.complaint_severity_to_harm(_severity text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_severity,''))
           WHEN 'low' THEN 'LOW' WHEN 'medium' THEN 'MODERATE'
           WHEN 'high' THEN 'HIGH' WHEN 'critical' THEN 'SEVERE' ELSE NULL END;
$$;

-- backfill consumer_harm from legacy severity without reinterpreting anything else
UPDATE public.complaints
   SET consumer_harm = public.complaint_severity_to_harm(severity)
 WHERE consumer_harm IS NULL AND severity IS NOT NULL;

-- ---------- 2. IMMUTABLE TRIAGE RULE VERSIONS ------------------------
ALTER TABLE public.conduct_triage_rules
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.conduct_triage_rule_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          uuid NOT NULL REFERENCES public.conduct_triage_rules(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  status           text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED','RETIRED')),
  match_mode       text NOT NULL,
  conditions       jsonb NOT NULL,
  outputs          jsonb NOT NULL,
  priority_order   integer NOT NULL DEFAULT 100,
  effective_from   timestamptz NOT NULL DEFAULT now(),
  effective_to     timestamptz,
  change_rationale text,
  supersedes_id    uuid REFERENCES public.conduct_triage_rule_versions(id) ON DELETE SET NULL,
  created_by       uuid,
  published_by     uuid,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version)
);
GRANT SELECT ON public.conduct_triage_rule_versions TO authenticated;
GRANT ALL ON public.conduct_triage_rule_versions TO service_role;
ALTER TABLE public.conduct_triage_rule_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ctrv_read ON public.conduct_triage_rule_versions;
CREATE POLICY ctrv_read ON public.conduct_triage_rule_versions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view')
         OR public.has_complaint_perm(auth.uid(),'view'));

CREATE OR REPLACE FUNCTION public.mc02_triage_version_appendonly()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Triage rule versions are append-only' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'PUBLISHED' AND (
       NEW.conditions IS DISTINCT FROM OLD.conditions
    OR NEW.outputs IS DISTINCT FROM OLD.outputs
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.match_mode IS DISTINCT FROM OLD.match_mode
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from) THEN
    RAISE EXCEPTION 'Published triage rule versions are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ctrv_appendonly ON public.conduct_triage_rule_versions;
CREATE TRIGGER trg_ctrv_appendonly BEFORE UPDATE OR DELETE ON public.conduct_triage_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.mc02_triage_version_appendonly();

-- publish a new immutable version from the current rule definition
CREATE OR REPLACE FUNCTION public.conduct_triage_rule_publish_version(
  _rule_id uuid, _change_rationale text DEFAULT NULL, _effective_from timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r public.conduct_triage_rules; v_prev uuid; v_ver integer; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'market_conduct','manage_monitoring_rules')) THEN
    RAISE EXCEPTION 'not_authorized: market_conduct.manage_monitoring_rules' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.conduct_triage_rules WHERE id = _rule_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Triage rule not found' USING ERRCODE = 'P0002'; END IF;

  SELECT id INTO v_prev FROM public.conduct_triage_rule_versions
   WHERE rule_id = _rule_id AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1;
  SELECT COALESCE(MAX(version),0) + 1 INTO v_ver FROM public.conduct_triage_rule_versions WHERE rule_id = _rule_id;

  INSERT INTO public.conduct_triage_rule_versions
    (rule_id, version, status, match_mode, conditions, outputs, priority_order,
     effective_from, change_rationale, supersedes_id, created_by, published_by, published_at)
  VALUES (_rule_id, v_ver, 'PUBLISHED', r.match_mode, r.conditions, r.outputs, r.priority_order,
          COALESCE(_effective_from, now()), NULLIF(btrim(coalesce(_change_rationale,'')),''),
          v_prev, v_uid, v_uid, now())
  RETURNING id INTO v_id;

  IF v_prev IS NOT NULL THEN
    UPDATE public.conduct_triage_rule_versions
       SET status = 'SUPERSEDED', effective_to = COALESCE(_effective_from, now())
     WHERE id = v_prev;
  END IF;
  UPDATE public.conduct_triage_rules SET current_version = v_ver, updated_at = now(), updated_by = v_uid
   WHERE id = _rule_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'conduct.triage_rule.version_published', 'conduct_triage_rule', _rule_id,
          jsonb_build_object('version', v_ver, 'version_id', v_id));
  RETURN jsonb_build_object('version_id', v_id, 'version', v_ver);
END;
$$;
REVOKE ALL ON FUNCTION public.conduct_triage_rule_publish_version(uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_triage_rule_publish_version(uuid,text,timestamptz) TO authenticated, service_role;

-- seed v1 for every existing rule so evaluations always have a version to cite
INSERT INTO public.conduct_triage_rule_versions
  (rule_id, version, status, match_mode, conditions, outputs, priority_order, effective_from,
   change_rationale, published_at)
SELECT r.id, 1, 'PUBLISHED', r.match_mode, r.conditions, r.outputs, r.priority_order,
       COALESCE(r.created_at, now()), 'MC-02 baseline version captured from existing configuration', now()
FROM public.conduct_triage_rules r
WHERE NOT EXISTS (SELECT 1 FROM public.conduct_triage_rule_versions v WHERE v.rule_id = r.id);
UPDATE public.conduct_triage_rules r
   SET current_version = v.version
  FROM (SELECT rule_id, MAX(version) AS version FROM public.conduct_triage_rule_versions GROUP BY rule_id) v
 WHERE v.rule_id = r.id AND r.current_version <> v.version;

-- ---------- 3. TRIAGE EVALUATION LEDGER ------------------------------
CREATE TABLE IF NOT EXISTS public.complaint_triage_evaluations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id       uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  source             text NOT NULL CHECK (source IN ('auto','manual_confirm','manual_override','auto_retry')),
  rule_id            uuid REFERENCES public.conduct_triage_rules(id) ON DELETE SET NULL,
  rule_version_id    uuid REFERENCES public.conduct_triage_rule_versions(id) ON DELETE SET NULL,
  rule_version       integer,
  input_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumer_harm      text,
  priority           text,
  conduct_risk_level text,
  systemic_potential text,
  sla_days           integer,
  override_reason    text,
  evaluated_by       uuid,
  evaluated_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cte_complaint ON public.complaint_triage_evaluations(complaint_id, evaluated_at DESC);
GRANT SELECT ON public.complaint_triage_evaluations TO authenticated;
GRANT ALL ON public.complaint_triage_evaluations TO service_role;
ALTER TABLE public.complaint_triage_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cte_read ON public.complaint_triage_evaluations;
CREATE POLICY cte_read ON public.complaint_triage_evaluations
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(),'view'));

CREATE OR REPLACE FUNCTION public.mc02_triage_eval_appendonly()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Triage evaluations are append-only' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_cte_appendonly ON public.complaint_triage_evaluations;
CREATE TRIGGER trg_cte_appendonly BEFORE UPDATE OR DELETE ON public.complaint_triage_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.mc02_triage_eval_appendonly();

-- ---------- 4. TRIAGE INPUT SNAPSHOT --------------------------------
CREATE OR REPLACE FUNCTION public.complaint_triage_inputs(_complaint_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'complaint_id', c.id,
    'complaint_type_id', c.complaint_type_id,
    'conduct_risk_category_id', c.conduct_risk_category_id,
    'product_id', c.product_id,
    'channel_id', c.channel_id,
    'customer_type', c.customer_type,
    'incident_date', c.incident_date,
    'intake_source', c.intake_source,
    'repeat_complaint_count', c.repeat_complaint_count,
    'vulnerability_self_declared', COALESCE(v.support_required, c.vulnerability_indicator, false),
    'vulnerability_staff_confirmed', v.staff_support_required,
    'respondent_match_state', (SELECT r.match_state FROM public.complaint_respondents r
                                WHERE r.complaint_id = c.id ORDER BY r.is_primary DESC LIMIT 1),
    'respondent_regulated', (SELECT r.licensee_id IS NOT NULL FROM public.complaint_respondents r
                                WHERE r.complaint_id = c.id ORDER BY r.is_primary DESC LIMIT 1),
    'customer_segment', d.customer_segment,
    'claimed_loss', d.claimed_loss,
    'amount_disputed', d.amount_disputed,
    'continuing_loss', d.continuing_loss,
    'urgent_funds_access', d.urgent_funds_access,
    'suspected_fraud', d.suspected_fraud,
    'raised_with_entity', d.raised_with_entity,
    'final_response_received', d.final_response_received,
    'duplicate_cluster', EXISTS (SELECT 1 FROM public.complaint_duplicate_pairs p
                                  WHERE p.primary_complaint_id = c.id OR p.candidate_complaint_id = c.id),
    'open_alerts', (SELECT count(*) FROM public.conduct_alerts a
                     WHERE a.licensee_id = c.licensee_id AND a.status IN ('open','acknowledged')),
    'captured_at', now()
  )
  FROM public.complaints c
  LEFT JOIN public.complaint_vulnerability_assessments v ON v.complaint_id = c.id
  LEFT JOIN public.complaint_intake_details d ON d.complaint_id = c.id
  WHERE c.id = _complaint_id;
$$;
REVOKE ALL ON FUNCTION public.complaint_triage_inputs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_triage_inputs(uuid) TO authenticated, service_role;

-- ---------- 5. CANONICAL TRIAGE DECISION -----------------------------
CREATE OR REPLACE FUNCTION public.complaint_triage_confirm(
  _complaint_id uuid, _payload jsonb, _expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); c public.complaints;
  v_harm text; v_priority text; v_risk text; v_sys text; v_reason text; v_sla int;
  v_auto public.complaint_triage_evaluations; v_material boolean := false;
  v_status text; v_eval uuid; v_rule_version_id uuid; v_rule_version int;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'triage');
  IF _expected_updated_at IS NOT NULL THEN
    PERFORM public._assert_complaint_fresh(_complaint_id, _expected_updated_at);
  END IF;

  v_harm     := NULLIF(upper(btrim(coalesce(_payload->>'consumer_harm',''))), '');
  v_priority := NULLIF(lower(btrim(coalesce(_payload->>'priority',''))), '');
  v_risk     := NULLIF(upper(btrim(coalesce(_payload->>'conduct_risk_level',''))), '');
  v_sys      := NULLIF(upper(btrim(coalesce(_payload->>'systemic_potential',''))), '');
  v_reason   := NULLIF(btrim(coalesce(_payload->>'override_reason','')), '');
  v_sla      := NULLIF(_payload->>'sla_days','')::int;

  IF v_harm IS NOT NULL AND v_harm NOT IN ('LOW','MODERATE','HIGH','SEVERE') THEN
    RAISE EXCEPTION 'Invalid consumer harm level' USING ERRCODE = '22023'; END IF;
  IF v_priority IS NOT NULL AND v_priority NOT IN ('p1','p2','p3','p4') THEN
    RAISE EXCEPTION 'Invalid case priority' USING ERRCODE = '22023'; END IF;
  IF v_risk IS NOT NULL AND v_risk NOT IN ('LOW','MODERATE','HIGH','CRITICAL') THEN
    RAISE EXCEPTION 'Invalid conduct risk level' USING ERRCODE = '22023'; END IF;
  IF v_sys IS NOT NULL AND v_sys NOT IN ('INDIVIDUAL','RECURRING','POTENTIAL_SYSTEMIC','CONFIRMED_SYSTEMIC') THEN
    RAISE EXCEPTION 'Invalid systemic potential' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_auto FROM public.complaint_triage_evaluations
   WHERE complaint_id = _complaint_id AND source IN ('auto','auto_retry')
   ORDER BY evaluated_at DESC LIMIT 1;

  -- material change against the deterministic recommendation (or the stored original values)
  v_material := (v_harm IS NOT NULL AND v_harm IS DISTINCT FROM COALESCE(v_auto.consumer_harm,
                    public.complaint_severity_to_harm(c.triage_original_values #>> '{values,severity}')))
             OR (v_priority IS NOT NULL AND v_priority IS DISTINCT FROM COALESCE(v_auto.priority,
                    c.triage_original_values #>> '{values,priority}'))
             OR (v_risk IS NOT NULL AND v_auto.conduct_risk_level IS NOT NULL
                    AND v_risk IS DISTINCT FROM v_auto.conduct_risk_level)
             OR (v_sys IS NOT NULL AND v_auto.systemic_potential IS NOT NULL
                    AND v_sys IS DISTINCT FROM v_auto.systemic_potential);

  IF v_material THEN
    IF NOT public.has_complaint_perm(v_uid, 'override_triage') THEN
      RAISE EXCEPTION 'not_authorized: complaint_management.override_triage' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'A reason of at least 10 characters is required to change the triage recommendation'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_sys = 'CONFIRMED_SYSTEMIC' THEN
    IF NOT public.has_complaint_perm(v_uid, 'override_triage') THEN
      RAISE EXCEPTION 'not_authorized: confirming a systemic issue requires triage override authority'
        USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'Confirming a systemic issue requires a written justification' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_status := CASE WHEN v_material THEN 'OVERRIDDEN' ELSE 'CONFIRMED' END;
  v_rule_version_id := v_auto.rule_version_id;
  v_rule_version := v_auto.rule_version;

  UPDATE public.complaints
     SET consumer_harm = COALESCE(v_harm, consumer_harm),
         priority = COALESCE(v_priority, priority),
         conduct_risk_level = COALESCE(v_risk, conduct_risk_level),
         systemic_potential = COALESCE(v_sys, systemic_potential),
         severity = COALESCE(public.complaint_harm_to_severity(v_harm), severity),
         sla_days = COALESCE(v_sla, sla_days),
         triage_confirmed_at = now(),
         triage_confirmed_by = v_uid,
         triage_confirmation_status = v_status,
         triage_override_status = CASE WHEN v_material THEN 'overridden' ELSE triage_override_status END,
         triage_override_reason = COALESCE(v_reason, triage_override_reason),
         systemic_confirmed_by = CASE WHEN v_sys = 'CONFIRMED_SYSTEMIC' THEN v_uid ELSE systemic_confirmed_by END,
         systemic_confirmed_at = CASE WHEN v_sys = 'CONFIRMED_SYSTEMIC' THEN now() ELSE systemic_confirmed_at END,
         updated_at = now()
   WHERE id = _complaint_id;

  INSERT INTO public.complaint_triage_evaluations
    (complaint_id, source, rule_id, rule_version_id, rule_version, input_snapshot, output_snapshot,
     consumer_harm, priority, conduct_risk_level, systemic_potential, sla_days, override_reason, evaluated_by)
  VALUES (_complaint_id,
          CASE WHEN v_material THEN 'manual_override' ELSE 'manual_confirm' END,
          c.triage_rule_id, v_rule_version_id, v_rule_version,
          public.complaint_triage_inputs(_complaint_id),
          jsonb_build_object('consumer_harm', v_harm, 'priority', v_priority,
                             'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
                             'sla_days', v_sla, 'decided_by_human', true,
                             'auto_recommendation', CASE WHEN v_auto.id IS NULL THEN NULL
                                                         ELSE v_auto.output_snapshot END),
          v_harm, v_priority, v_risk, v_sys, v_sla, v_reason, v_uid)
  RETURNING id INTO v_eval;

  PERFORM public.notification_enqueue_event('complaint_triage_completed','complaint',_complaint_id,
    jsonb_build_object('complaint_id', _complaint_id, 'complaint_number', c.complaint_number,
                       'priority', COALESCE(v_priority, c.priority),
                       'cta_url', '/complaints/' || _complaint_id, 'cta_label', 'Open complaint'),
    v_eval::text);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, CASE WHEN v_material THEN 'complaint.triage.overridden' ELSE 'complaint.triage.confirmed' END,
          'complaint', _complaint_id,
          jsonb_build_object('evaluation_id', v_eval, 'consumer_harm', v_harm, 'priority', v_priority,
                             'conduct_risk_level', v_risk, 'systemic_potential', v_sys,
                             'rule_version', v_rule_version, 'reason', v_reason));

  RETURN jsonb_build_object('evaluation_id', v_eval, 'status', v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_triage_confirm(uuid,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_triage_confirm(uuid,jsonb,timestamptz) TO authenticated, service_role;

-- ---------- 6. classify_complaint stays the single write authority ----
CREATE OR REPLACE FUNCTION public.classify_complaint(_id uuid, _payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_sev text; v_harm text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  PERFORM public.mc02_complaint_guard(_id, 'triage');

  v_sev := NULLIF(_payload->>'severity','');
  IF v_sev IS NOT NULL AND v_sev NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid severity' USING ERRCODE = '22023';
  END IF;

  -- classification attributes (not risk dimensions)
  UPDATE public.complaints
     SET conduct_risk_category_id = NULLIF(_payload->>'conduct_risk_category_id','')::uuid,
         product_id               = NULLIF(_payload->>'product_id','')::uuid,
         channel_id               = NULLIF(_payload->>'channel_id','')::uuid,
         customer_type            = NULLIF(_payload->>'customer_type',''),
         vulnerability_indicator  = COALESCE((_payload->>'vulnerability_indicator')::boolean, vulnerability_indicator, false),
         vulnerability_notes      = NULLIF(_payload->>'vulnerability_notes',''),
         assigned_team            = COALESCE(NULLIF(_payload->>'assigned_team',''), assigned_team),
         triage_source            = COALESCE(NULLIF(_payload->>'triage_source',''), triage_source),
         updated_at = now()
   WHERE id = _id;

  -- risk dimensions go through the canonical triage decision
  v_harm := COALESCE(NULLIF(upper(coalesce(_payload->>'consumer_harm','')),''),
                     public.complaint_severity_to_harm(v_sev));
  IF v_harm IS NOT NULL OR NULLIF(_payload->>'priority','') IS NOT NULL
     OR NULLIF(_payload->>'conduct_risk_level','') IS NOT NULL
     OR NULLIF(_payload->>'systemic_potential','') IS NOT NULL THEN
    PERFORM public.complaint_triage_confirm(_id, jsonb_strip_nulls(jsonb_build_object(
      'consumer_harm', v_harm,
      'priority', NULLIF(_payload->>'priority',''),
      'conduct_risk_level', NULLIF(upper(coalesce(_payload->>'conduct_risk_level','')),''),
      'systemic_potential', NULLIF(upper(coalesce(_payload->>'systemic_potential','')),''),
      'sla_days', NULLIF(_payload->>'sla_days',''),
      'override_reason', NULLIF(_payload->>'override_reason','')
    )), NULL);
  ELSIF NULLIF(_payload->>'sla_days','') IS NOT NULL THEN
    UPDATE public.complaints SET sla_days = (_payload->>'sla_days')::int WHERE id = _id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.classification_updated', 'complaint', _id, _payload);
END;
$$;

-- ---------- 7. INTAKE QUEUE ------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_intake_queue(
  _filters jsonb DEFAULT '{}'::jsonb, _page integer DEFAULT 1,
  _page_size integer DEFAULT 25, _search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_rows jsonb; v_total bigint;
        v_limit int := LEAST(GREATEST(COALESCE(_page_size,25),1),200);
        v_offset int := (GREATEST(COALESCE(_page,1),1) - 1) * LEAST(GREATEST(COALESCE(_page_size,25),1),200);
BEGIN
  IF v_uid IS NULL OR NOT public.has_complaint_perm(v_uid,'view') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT c.id, c.complaint_number, c.created_at, c.subject, c.status,
           c.complainant_name, c.priority, c.consumer_harm, c.conduct_risk_level,
           c.systemic_potential, c.intake_source, c.sla_due_at, c.investigator_id,
           c.regulator_id, c.licensee_id, c.triage_confirmation_status,
           COALESCE(a.status,'PENDING_ASSESSMENT') AS jurisdiction_status,
           a.decision_outcome,
           r.legal_name AS respondent_name, r.trading_name AS respondent_trading_name,
           r.match_state AS respondent_match_state,
           (r.licensee_id IS NOT NULL) AS respondent_regulated,
           p.name AS product_name,
           COALESCE(v.support_required,false) AS support_declared,
           COALESCE(v.staff_review_state,'pending') AS support_review_state,
           prof.full_name AS assigned_officer,
           EXTRACT(day FROM now() - c.created_at)::int AS age_days
    FROM public.complaints c
    LEFT JOIN public.complaint_jurisdiction_assessments a ON a.complaint_id = c.id
    LEFT JOIN LATERAL (SELECT * FROM public.complaint_respondents x
                        WHERE x.complaint_id = c.id ORDER BY x.is_primary DESC LIMIT 1) r ON true
    LEFT JOIN public.conduct_products p ON p.id = c.product_id
    LEFT JOIN public.complaint_vulnerability_assessments v ON v.complaint_id = c.id
    LEFT JOIN public.profiles prof ON prof.id = c.investigator_id
    WHERE (public.is_super_admin(v_uid) OR public.regulatory_scope_allows(
             v_uid,'complaint_management','view', c.regulator_id, NULL, NULL, c.licensee_id, NULL))
      AND (NULLIF(_filters->>'regulator_id','') IS NULL OR c.regulator_id = (_filters->>'regulator_id')::uuid)
      AND (NULLIF(_filters->>'assigned_officer','') IS NULL OR c.investigator_id = (_filters->>'assigned_officer')::uuid)
      AND (NULLIF(_filters->>'priority','') IS NULL OR c.priority = _filters->>'priority')
      AND (NULLIF(_filters->>'intake_source','') IS NULL OR c.intake_source = _filters->>'intake_source')
      AND (NULLIF(_filters->>'jurisdiction_status','') IS NULL
           OR COALESCE(a.status,'PENDING_ASSESSMENT') = _filters->>'jurisdiction_status')
      AND (NULLIF(_filters->>'respondent_match_state','') IS NULL OR r.match_state = _filters->>'respondent_match_state')
      AND (NULLIF(_filters->>'support_review_state','') IS NULL
           OR COALESCE(v.staff_review_state,'pending') = _filters->>'support_review_state')
      AND (NULLIF(_filters->>'min_age_days','') IS NULL
           OR c.created_at <= now() - ((_filters->>'min_age_days')::int || ' days')::interval)
      AND (COALESCE((_filters->>'support_declared')::boolean, false) = false OR COALESCE(v.support_required,false))
      AND (COALESCE((_filters->>'suspected_unauthorised')::boolean, false) = false
           OR r.match_state IN ('suspected_unlicensed','unmatched'))
      AND (COALESCE((_filters->>'overdue_only')::boolean, false) = false
           OR (c.sla_due_at IS NOT NULL AND c.sla_due_at < now()))
      AND (NULLIF(_search,'') IS NULL
           OR c.complaint_number ILIKE '%'||_search||'%'
           OR c.subject ILIKE '%'||_search||'%'
           OR COALESCE(c.complainant_name,'') ILIKE '%'||_search||'%'
           OR COALESCE(r.legal_name,'') ILIKE '%'||_search||'%')
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at), '[]'::jsonb), (SELECT count(*) FROM base)
    INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at LIMIT v_limit OFFSET v_offset) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'page', GREATEST(COALESCE(_page,1),1),
                            'page_size', v_limit);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_intake_queue(jsonb,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_intake_queue(jsonb,integer,integer,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complaint_intake_queue_counts(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_complaint_perm(v_uid,'view') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  WITH base AS (
    SELECT c.id, c.priority, c.sla_due_at, c.created_at, c.triage_confirmation_status,
           COALESCE(a.status,'PENDING_ASSESSMENT') AS jstatus, a.decision_outcome,
           a.assessment_started_at,
           r.match_state, COALESCE(v2.support_required,false) AS support_declared,
           COALESCE(v2.staff_review_state,'pending') AS support_state
    FROM public.complaints c
    LEFT JOIN public.complaint_jurisdiction_assessments a ON a.complaint_id = c.id
    LEFT JOIN LATERAL (SELECT * FROM public.complaint_respondents x
                        WHERE x.complaint_id = c.id ORDER BY x.is_primary DESC LIMIT 1) r ON true
    LEFT JOIN public.complaint_vulnerability_assessments v2 ON v2.complaint_id = c.id
    WHERE (public.is_super_admin(v_uid) OR public.regulatory_scope_allows(
             v_uid,'complaint_management','view', c.regulator_id, NULL, NULL, c.licensee_id, NULL))
      AND (NULLIF(_scope->>'regulator_id','') IS NULL OR c.regulator_id = (_scope->>'regulator_id')::uuid)
  )
  SELECT jsonb_build_object(
    'awaiting_jurisdiction_assessment', count(*) FILTER (WHERE jstatus IN ('PENDING_ASSESSMENT','IN_ASSESSMENT')),
    'waiting_for_information', count(*) FILTER (WHERE jstatus = 'PENDING_INFORMATION'),
    'ready_for_triage', count(*) FILTER (WHERE jstatus = 'DECIDED'
        AND decision_outcome IN ('ACCEPTED','PARTIALLY_ACCEPTED')
        AND COALESCE(triage_confirmation_status,'PENDING') = 'PENDING'),
    'p1_complaints', count(*) FILTER (WHERE priority = 'p1'),
    'support_reviews_pending', count(*) FILTER (WHERE support_declared AND support_state = 'pending'),
    'unmatched_respondents', count(*) FILTER (WHERE match_state = 'unmatched' OR match_state IS NULL),
    'suspected_unauthorised', count(*) FILTER (WHERE match_state = 'suspected_unlicensed'),
    'overdue_jurisdiction_assessments', count(*) FILTER (
        WHERE jstatus IN ('PENDING_ASSESSMENT','IN_ASSESSMENT') AND created_at < now() - interval '5 days')
  ) INTO v FROM base;
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_intake_queue_counts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_intake_queue_counts(jsonb) TO authenticated, service_role;