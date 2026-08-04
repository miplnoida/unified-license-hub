-- ============================================================
-- Specialised (module-specific) rule tester — read-only
-- ============================================================

CREATE TABLE IF NOT EXISTS public.module_rule_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family text NOT NULL CHECK (family IN (
    'return_validation','prudential','conduct','complaint_triage',
    'sufficiency','rfi_auto','correspondence','escalation'
  )),
  rule_id uuid NOT NULL,
  rule_code text,
  mode text NOT NULL DEFAULT 'dry_run',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  passed boolean NOT NULL DEFAULT false,
  matched boolean,
  error text,
  duration_ms integer,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_rule_tests_family_rule_idx
  ON public.module_rule_tests (family, rule_id, created_at DESC);

GRANT SELECT ON public.module_rule_tests TO authenticated;
GRANT ALL ON public.module_rule_tests TO service_role;

ALTER TABLE public.module_rule_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rule engine viewers read module test history" ON public.module_rule_tests;
CREATE POLICY "Rule engine viewers read module test history"
  ON public.module_rule_tests FOR SELECT TO authenticated
  USING (public.can_view_rule_engine(auth.uid()));

-- No INSERT/UPDATE/DELETE policies: history is written only by the
-- SECURITY DEFINER tester RPC and is immutable thereafter.

-- ------------------------------------------------------------
-- Comparison helper (shared by every specialised evaluator)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rule_test_compare(
  _actual jsonb, _op text, _expected jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a_num numeric; e_num numeric;
  a_txt text := CASE WHEN _actual IS NULL OR jsonb_typeof(_actual)='null' THEN NULL ELSE btrim(_actual #>> '{}') END;
  e_txt text := CASE WHEN _expected IS NULL OR jsonb_typeof(_expected)='null' THEN NULL ELSE btrim(_expected #>> '{}') END;
  op text := lower(coalesce(_op,'='));
BEGIN
  BEGIN a_num := a_txt::numeric; EXCEPTION WHEN others THEN a_num := NULL; END;
  BEGIN e_num := e_txt::numeric; EXCEPTION WHEN others THEN e_num := NULL; END;

  IF op IN ('is_empty','empty','missing') THEN
    RETURN a_txt IS NULL OR a_txt = '';
  ELSIF op IN ('is_present','present','required','not_empty') THEN
    RETURN a_txt IS NOT NULL AND a_txt <> '';
  END IF;

  IF a_txt IS NULL THEN RETURN false; END IF;

  IF op IN ('>','gt') THEN RETURN a_num IS NOT NULL AND e_num IS NOT NULL AND a_num > e_num;
  ELSIF op IN ('>=','gte') THEN RETURN a_num IS NOT NULL AND e_num IS NOT NULL AND a_num >= e_num;
  ELSIF op IN ('<','lt') THEN RETURN a_num IS NOT NULL AND e_num IS NOT NULL AND a_num < e_num;
  ELSIF op IN ('<=','lte') THEN RETURN a_num IS NOT NULL AND e_num IS NOT NULL AND a_num <= e_num;
  ELSIF op IN ('=','==','eq','equals') THEN
    RETURN CASE WHEN a_num IS NOT NULL AND e_num IS NOT NULL THEN a_num = e_num ELSE lower(a_txt) = lower(coalesce(e_txt,'')) END;
  ELSIF op IN ('!=','<>','neq','not_equals') THEN
    RETURN CASE WHEN a_num IS NOT NULL AND e_num IS NOT NULL THEN a_num <> e_num ELSE lower(a_txt) <> lower(coalesce(e_txt,'')) END;
  ELSIF op IN ('contains','ilike') THEN RETURN e_txt IS NOT NULL AND a_txt ILIKE '%'||e_txt||'%';
  ELSIF op IN ('starts_with','prefix') THEN RETURN e_txt IS NOT NULL AND a_txt ILIKE e_txt||'%';
  ELSIF op = 'in' THEN
    RETURN _expected IS NOT NULL AND jsonb_typeof(_expected)='array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(_expected) v WHERE lower(v) = lower(a_txt));
  END IF;
  RETURN false;
END; $$;

-- ------------------------------------------------------------
-- Specialised tester: evaluates a module family's OWN rule row
-- against caller-supplied sample inputs. Strictly read-only:
-- writes nothing except one immutable row in module_rule_tests.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rule_module_test(
  _family text, _rule_id uuid, _inputs jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_corr uuid := gen_random_uuid();
  v_code text;
  v_name text;
  v_conditions jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_matched boolean := false;
  v_notes text;
  v_out jsonb;
  v_in jsonb := coalesce(_inputs, '{}'::jsonb);
  r record;
BEGIN
  IF NOT public.can_manage_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _family IS NULL OR _rule_id IS NULL THEN
    RAISE EXCEPTION 'family and rule id are required' USING ERRCODE = '22023';
  END IF;

  -- ---------------- Return validation ----------------
  IF _family = 'return_validation' THEN
    SELECT * INTO r FROM public.return_validation_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'RVR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    SELECT jsonb_agg(jsonb_build_object(
             'label', 'field ' || f.ref,
             'metric', f.ref,
             'actual', coalesce(v_in->'values'->f.ref, 'null'::jsonb),
             'operator', coalesce(v_in->>'operator', 'is_present'),
             'expected', coalesce(v_in->'expected', 'null'::jsonb),
             'passed', public.rule_test_compare(v_in->'values'->f.ref,
                        coalesce(v_in->>'operator','is_present'), v_in->'expected'),
             'reason', CASE WHEN (v_in->'values'->f.ref) IS NULL
                            THEN 'no sample value supplied for this field'
                            ELSE 'evaluated against sample value' END))
      INTO v_conditions
      FROM jsonb_array_elements_text(coalesce(r.field_refs,'[]'::jsonb)) AS f(ref);
    v_conditions := coalesce(v_conditions, '[]'::jsonb);
    v_matched := EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE (c->>'passed')::boolean IS FALSE);
    v_actions := jsonb_build_array(jsonb_build_object(
      'index', 0, 'type', 'validation_finding', 'severity', r.severity,
      'message', r.error_message,
      'blocks_submission', (lower(coalesce(r.severity,'')) IN ('error','critical'))));
    v_notes := 'Expression: ' || coalesce(r.expression,'(none)') ||
               '. Expression arithmetic is evaluated by evaluate_return_validations() at submission time; '
               'this tester reports field-level presence/comparison results and the user-facing message.';

  -- ---------------- Prudential threshold ----------------
  ELSIF _family = 'prudential' THEN
    SELECT * INTO r FROM public.prudential_thresholds WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'PTH-' || upper(r.metric_key);
    v_name := coalesce(r.label, r.metric_key);
    v_conditions := jsonb_build_array(
      jsonb_build_object('label','warning threshold','metric',r.metric_key,
        'actual', coalesce(v_in->'actual','null'::jsonb), 'operator', r.comparator,
        'expected', to_jsonb(r.warn_value),
        'passed', NOT public.rule_test_compare(coalesce(v_in->'actual','null'::jsonb), r.comparator, to_jsonb(r.warn_value)),
        'reason','breach when the metric fails "'||r.comparator||' '||coalesce(r.warn_value::text,'-')||'"'),
      jsonb_build_object('label','breach threshold','metric',r.metric_key,
        'actual', coalesce(v_in->'actual','null'::jsonb), 'operator', r.comparator,
        'expected', to_jsonb(r.breach_value),
        'passed', NOT public.rule_test_compare(coalesce(v_in->'actual','null'::jsonb), r.comparator, to_jsonb(r.breach_value)),
        'reason','breach when the metric fails "'||r.comparator||' '||coalesce(r.breach_value::text,'-')||'"'));
    v_matched := EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE (c->>'passed')::boolean IS TRUE);
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','threshold_breach_record','target','return_threshold_breaches'),
        jsonb_build_object('index',1,'type','prudential_assessment_flag'),
        jsonb_build_object('index',2,'type','notification','event','prudential.threshold_breached'))
      ELSE '[]'::jsonb END;
    v_notes := 'Unit ' || coalesce(r.unit,'ratio') || ', taxonomy ' || coalesce(r.taxonomy_code,'(any)') ||
               ', effective ' || coalesce(r.effective_from::text,'-') || ' → ' || coalesce(r.effective_to::text,'open') ||
               '. Runtime owner: prudential-monitoring-sweep.';

  -- ---------------- Conduct monitoring ----------------
  ELSIF _family = 'conduct' THEN
    SELECT * INTO r FROM public.conduct_monitoring_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'CMR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label', coalesce(r.definition->>'metric','metric'),
      'metric', r.definition->>'metric',
      'actual', coalesce(v_in->'metrics'->(r.definition->>'metric'), v_in->'actual', 'null'::jsonb),
      'operator', coalesce(r.definition->>'op','>='),
      'expected', coalesce(r.definition->'threshold','null'::jsonb),
      'passed', public.rule_test_compare(
                  coalesce(v_in->'metrics'->(r.definition->>'metric'), v_in->'actual','null'::jsonb),
                  coalesce(r.definition->>'op','>='), r.definition->'threshold'),
      'reason','window ' || coalesce(r.definition->>'window_days','-') || ' days'));
    v_matched := (v_conditions->0->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','conduct_alert','scope',r.scope),
        jsonb_build_object('index',1,'type','risk_score_delta','value',r.risk_delta),
        jsonb_build_object('index',2,'type','notification','event','conduct.alert_created'))
      ELSE '[]'::jsonb END;
    v_notes := 'Frequency ' || coalesce(r.frequency,'-') || '. Runtime owner: evaluate-conduct-monitoring.';

  -- ---------------- Complaint triage ----------------
  ELSIF _family = 'complaint_triage' THEN
    SELECT * INTO r FROM public.complaint_intake_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'CIR-' || left(replace(r.id::text,'-',''),8);
    v_name := coalesce(r.variant,'intake') || ' intake rules';
    SELECT jsonb_agg(jsonb_build_object(
             'label','required field ' || f.ref, 'metric', f.ref,
             'actual', coalesce(v_in->'facts'->f.ref,'null'::jsonb),
             'operator','is_present','expected', to_jsonb('required'::text),
             'passed', public.rule_test_compare(v_in->'facts'->f.ref,'is_present',NULL),
             'reason', CASE WHEN public.rule_test_compare(v_in->'facts'->f.ref,'is_present',NULL)
                            THEN 'supplied' ELSE 'missing — intake would be rejected' END))
      INTO v_conditions
      FROM unnest(coalesce(r.required_fields, ARRAY[]::text[])) AS f(ref);
    v_conditions := coalesce(v_conditions,'[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
           'label','anonymous submission','metric','anonymous',
           'actual', coalesce(v_in->'facts'->'anonymous','false'::jsonb),
           'operator','=','expected', to_jsonb(r.allow_anonymous),
           'passed', (coalesce((v_in->'facts'->>'anonymous')::boolean,false) IS NOT TRUE) OR r.allow_anonymous,
           'reason', CASE WHEN r.allow_anonymous THEN 'anonymous permitted' ELSE 'anonymous not permitted for this variant' END),
         jsonb_build_object(
           'label','attachment count','metric','attachments',
           'actual', coalesce(v_in->'facts'->'attachments','0'::jsonb),
           'operator','<=','expected', to_jsonb(r.max_attachments),
           'passed', public.rule_test_compare(coalesce(v_in->'facts'->'attachments','0'::jsonb),'<=',to_jsonb(r.max_attachments)),
           'reason','maximum ' || coalesce(r.max_attachments::text,'-') || ' attachments'));
    v_matched := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE (c->>'passed')::boolean IS FALSE);
    v_actions := jsonb_build_array(
      jsonb_build_object('index',0,'type','classify_complaint','result',
        CASE WHEN v_matched THEN 'accepted for triage' ELSE 'rejected at intake' END),
      jsonb_build_object('index',1,'type','apply_complaint_type_sla'),
      jsonb_build_object('index',2,'type','start_complaint_workflow'),
      jsonb_build_object('index',3,'type','notification','event','complaint.created'));
    v_notes := 'Runtime owner: classify_complaint(). Priority, SLA and assignment are derived by the complaint type and workflow, previewed above in action order.';

  -- ---------------- Sufficiency ----------------
  ELSIF _family = 'sufficiency' THEN
    SELECT * INTO r FROM public.sufficiency_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := coalesce(r.code, 'SFR-' || left(replace(r.id::text,'-',''),8));
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label', coalesce(r.config->>'label', r.rule_type),
      'metric', coalesce(r.config->>'metric', r.config->>'field', r.rule_type),
      'actual', coalesce(v_in->'facts'->coalesce(r.config->>'metric', r.config->>'field',''), v_in->'actual','null'::jsonb),
      'operator', coalesce(r.config->>'op','is_present'),
      'expected', coalesce(r.config->'value', r.config->'threshold','null'::jsonb),
      'passed', public.rule_test_compare(
                  coalesce(v_in->'facts'->coalesce(r.config->>'metric', r.config->>'field',''), v_in->'actual','null'::jsonb),
                  coalesce(r.config->>'op','is_present'),
                  coalesce(r.config->'value', r.config->'threshold')),
      'reason','sufficiency rule type ' || coalesce(r.rule_type,'-')));
    v_matched := (v_conditions->0->>'passed')::boolean IS FALSE;
    v_actions := CASE WHEN v_matched THEN
        jsonb_build_array(
          jsonb_build_object('index',0,'type','sufficiency_finding','severity',r.severity),
          jsonb_build_object('index',1,'type','suggest_rfi','auto',r.auto_rfi,
            'prompt', r.rfi_prompt_template, 'question_type', r.rfi_question_type,
            'note','suggestion only — no RFI is created by a test run'))
      ELSE '[]'::jsonb END;
    v_notes := 'Runtime owner: evaluate-application-sufficiency. A failing condition means information is missing.';

  -- ---------------- RFI auto rules ----------------
  ELSIF _family = 'rfi_auto' THEN
    SELECT * INTO r FROM public.application_rfi_auto_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'RFA-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label', coalesce(r.condition->>'label','condition'),
      'metric', coalesce(r.condition->>'field', r.condition->>'metric','field'),
      'actual', coalesce(v_in->'facts'->coalesce(r.condition->>'field', r.condition->>'metric',''), v_in->'actual','null'::jsonb),
      'operator', coalesce(r.condition->>'op','is_empty'),
      'expected', coalesce(r.condition->'value','null'::jsonb),
      'passed', public.rule_test_compare(
                  coalesce(v_in->'facts'->coalesce(r.condition->>'field', r.condition->>'metric',''), v_in->'actual','null'::jsonb),
                  coalesce(r.condition->>'op','is_empty'), r.condition->'value'),
      'reason','workflow ' || coalesce(r.workflow_type_key,'(any)')));
    v_matched := (v_conditions->0->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(jsonb_build_object(
        'index',0,'type','suggest_rfi_item','question_type', r.question_type,
        'required', r.required, 'due_days', r.default_due_days,
        'prompt', r.prompt_template,
        'duplicate_check', CASE WHEN coalesce((v_in->'facts'->>'open_item_exists')::boolean,false)
                                THEN 'suppressed — an open RFI item already covers this requirement'
                                ELSE 'no open RFI item found for this requirement' END,
        'note','suggestion only — officer confirmation creates the real RFI'))
      ELSE '[]'::jsonb END;
    v_notes := 'Runtime owner: application RFI suggestion path (officer-confirmed).';

  -- ---------------- Correspondence routing ----------------
  ELSIF _family = 'correspondence' THEN
    SELECT * INTO r FROM public.correspondence_routing_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'CRR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(jsonb_build_object(
      'label','match ' || r.match_type, 'metric', r.match_type,
      'actual', coalesce(v_in->'message'->r.match_type, v_in->'actual','null'::jsonb),
      'operator','contains','expected', to_jsonb(r.match_value),
      'passed', public.rule_test_compare(coalesce(v_in->'message'->r.match_type, v_in->'actual','null'::jsonb),
                                         'contains', to_jsonb(r.match_value)),
      'reason','sort order ' || coalesce(r.sort_order::text,'-') ||
               ' — the first matching active rule wins'));
    v_matched := (v_conditions->0->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','route_to_unit','value',r.assign_unit),
        jsonb_build_object('index',1,'type','assign_officer','value',r.assign_officer),
        jsonb_build_object('index',2,'type','set_priority','value',r.priority),
        jsonb_build_object('index',3,'type','set_sla','days',r.sla_days),
        jsonb_build_object('index',4,'type','notification','event','correspondence.message_received'))
      ELSE '[]'::jsonb END;
    v_notes := 'Runtime owner: classify_correspondence(). Manual override ' ||
               CASE WHEN r.allow_manual_override THEN 'permitted' ELSE 'not permitted' END || '.';

  -- ---------------- Escalation rules ----------------
  ELSIF _family = 'escalation' THEN
    SELECT * INTO r FROM public.escalation_rules WHERE id = _rule_id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'rule not found' USING ERRCODE='P0002'; END IF;
    v_code := 'ESR-' || left(replace(r.id::text,'-',''),8);
    v_name := r.name;
    v_conditions := jsonb_build_array(
      jsonb_build_object('label','tier 1 acknowledgement threshold','metric','elapsed_minutes',
        'actual', coalesce(v_in->'elapsed_minutes','null'::jsonb),'operator','>=',
        'expected', to_jsonb(r.tier1_ack_threshold_minutes),
        'passed', public.rule_test_compare(v_in->'elapsed_minutes','>=',to_jsonb(r.tier1_ack_threshold_minutes)),
        'reason', CASE WHEN r.business_hours_only THEN 'business hours only — elapsed time must be business minutes' ELSE 'calendar minutes' END),
      jsonb_build_object('label','tier 2 acknowledgement threshold','metric','elapsed_minutes',
        'actual', coalesce(v_in->'elapsed_minutes','null'::jsonb),'operator','>=',
        'expected', to_jsonb(r.tier2_ack_threshold_minutes),
        'passed', public.rule_test_compare(v_in->'elapsed_minutes','>=',to_jsonb(r.tier2_ack_threshold_minutes)),
        'reason','tier 2 fires only when tier 1 is unacknowledged'),
      jsonb_build_object('label','tier 3 acknowledgement threshold','metric','elapsed_minutes',
        'actual', coalesce(v_in->'elapsed_minutes','null'::jsonb),'operator','>=',
        'expected', to_jsonb(r.tier3_ack_threshold_minutes),
        'passed', public.rule_test_compare(v_in->'elapsed_minutes','>=',to_jsonb(r.tier3_ack_threshold_minutes)),
        'reason','tier 3 is the final tier'),
      jsonb_build_object('label','acknowledged pauses escalation','metric','acknowledged',
        'actual', coalesce(v_in->'acknowledged','false'::jsonb),'operator','=','expected','false'::jsonb,
        'passed', NOT (r.pause_on_acknowledgement AND coalesce((v_in->>'acknowledged')::boolean,false)),
        'reason', CASE WHEN r.pause_on_acknowledgement THEN 'rule pauses on acknowledgement' ELSE 'rule ignores acknowledgement' END));
    v_matched := (v_conditions->0->>'passed')::boolean AND (v_conditions->3->>'passed')::boolean;
    v_actions := CASE WHEN v_matched THEN jsonb_build_array(
        jsonb_build_object('index',0,'type','escalate','next_tier',
          CASE WHEN (v_conditions->2->>'passed')::boolean THEN 3
               WHEN (v_conditions->1->>'passed')::boolean THEN 2 ELSE 1 END,
          'recipient_role',
          CASE WHEN (v_conditions->2->>'passed')::boolean THEN r.tier3_recipient_role
               WHEN (v_conditions->1->>'passed')::boolean THEN r.tier2_recipient_role
               ELSE r.tier1_recipient_role END,
          'channels',
          CASE WHEN (v_conditions->2->>'passed')::boolean THEN to_jsonb(r.tier3_channels)
               WHEN (v_conditions->1->>'passed')::boolean THEN to_jsonb(r.tier2_channels)
               ELSE to_jsonb(r.tier1_channels) END),
        jsonb_build_object('index',1,'type','create_task','enabled',r.create_task),
        jsonb_build_object('index',2,'type','create_case','enabled',r.create_case),
        jsonb_build_object('index',3,'type','notification','event','escalation.tier_reached'))
      ELSE '[]'::jsonb END;
    v_notes := 'Source module ' || coalesce(r.source_module,'-') || ', severity ' || coalesce(r.default_severity::text,'-') ||
               ', calendar profile ' || coalesce(r.business_calendar_profile_id::text,'(none)') ||
               '. Runtime owner: escalation_sweep().';
  ELSE
    RAISE EXCEPTION 'unknown rule family: %', _family USING ERRCODE = '22023';
  END IF;

  v_out := jsonb_build_object(
    'family', _family,
    'rule_id', _rule_id,
    'rule_code', v_code,
    'rule_name', v_name,
    'mode', 'dry_run',
    'inputs', v_in,
    'conditions', v_conditions,
    'matched', v_matched,
    'expected_actions', v_actions,
    'notes', v_notes,
    'correlation_id', v_corr,
    'duration_ms', (extract(epoch FROM (clock_timestamp() - v_start)) * 1000)::int,
    'side_effects', 'none — this is a dry run; no production record was created or modified'
  );

  INSERT INTO public.module_rule_tests
    (family, rule_id, rule_code, inputs, output, passed, matched, duration_ms, correlation_id, tested_by)
  VALUES (_family, _rule_id, v_code, v_in, v_out,
          NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_conditions) c WHERE c->>'passed' IS NULL),
          v_matched, (v_out->>'duration_ms')::int, v_corr, auth.uid());

  RETURN v_out;
END; $$;

REVOKE ALL ON FUNCTION public.rule_module_test(text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rule_module_test(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rule_module_test(text, uuid, jsonb) TO service_role;

-- ------------------------------------------------------------
-- Inventory: surface specialised test runs as "last tested" and
-- mark every family testable.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.rule_inventory_ext AS
SELECT i.rule_id, i.family, i.family_label, i.rule_code, i.name, i.description,
       i.module, i.sub_module, i.rule_type, i.severity, i.status, i.version,
       i.active_version, i.trigger_count, i.last_triggered_at,
       greatest(i.last_tested_at, m.last_tested) AS last_tested_at,
       i.owner_user_id, i.last_modified_by, i.last_modified_at, i.tags,
       i.source_screen, i.runtime_owner,
       (i.capabilities || jsonb_build_object('test', true)) AS capabilities
FROM public.rule_inventory i
LEFT JOIN (
  SELECT family, rule_id::text AS rid, max(created_at) AS last_tested
  FROM public.module_rule_tests GROUP BY 1, 2
) m ON m.family = i.family AND m.rid = i.rule_id;

CREATE OR REPLACE FUNCTION public.rule_inventory_search(
  _search text DEFAULT NULL, _family text DEFAULT NULL, _module text DEFAULT NULL,
  _sub_module text DEFAULT NULL, _rule_type text DEFAULT NULL, _status text DEFAULT NULL,
  _severity text DEFAULT NULL, _tag text DEFAULT NULL,
  _triggered_from timestamptz DEFAULT NULL, _triggered_to timestamptz DEFAULT NULL,
  _sort text DEFAULT 'last_modified_at', _dir text DEFAULT 'desc',
  _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb; v_total int; v_kpi jsonb; v_facets jsonb;
  v_sort text := lower(coalesce(_sort,'last_modified_at'));
  v_dir text := CASE WHEN lower(coalesce(_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_limit int := least(greatest(coalesce(_limit,50),1),200);
  v_offset int := greatest(coalesce(_offset,0),0);
  v_where text;
  v_families text[] := ARRAY['shared_engine','return_validation','prudential','conduct',
                             'complaint_triage','sufficiency','rfi_auto','correspondence','escalation'];
BEGIN
  IF NOT public.can_view_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_sort NOT IN ('rule_code','name','family','module','rule_type','severity','status',
                    'trigger_count','last_triggered_at','last_tested_at','last_modified_at') THEN
    v_sort := 'last_modified_at';
  END IF;

  v_where := $w$
    ($1 IS NULL OR btrim($1) = ''
      OR concat_ws(' ', i.rule_code, i.name, i.description, i.module, i.sub_module,
                   array_to_string(i.tags,' ')) ILIKE '%' || btrim($1) || '%')
    AND ($2 IS NULL OR $2 = 'all' OR i.family = $2)
    AND ($3 IS NULL OR $3 = 'all' OR i.module = $3)
    AND ($4 IS NULL OR $4 = 'all' OR i.sub_module = $4)
    AND ($5 IS NULL OR $5 = 'all' OR i.rule_type = $5)
    AND ($6 IS NULL OR $6 = 'all' OR i.status = $6)
    AND ($7 IS NULL OR $7 = 'all' OR i.severity = $7)
    AND ($8 IS NULL OR $8 = 'all' OR i.tags @> ARRAY[$8])
    AND ($9 IS NULL OR i.last_triggered_at >= $9)
    AND ($10 IS NULL OR i.last_triggered_at <= $10)
  $w$;

  EXECUTE 'SELECT count(*) FROM public.rule_inventory_ext i WHERE ' || v_where
  INTO v_total
  USING _search, _family, _module, _sub_module, _rule_type, _status, _severity, _tag,
        _triggered_from, _triggered_to;

  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
             'owner_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = x.owner_user_id),
             'modified_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = x.last_modified_by)
           )), '[]'::jsonb)
    FROM (
      SELECT * FROM public.rule_inventory_ext i
      WHERE %1$s
      ORDER BY i.%2$I %3$s NULLS LAST, i.rule_code ASC
      LIMIT %4$s OFFSET %5$s
    ) x
  $q$, v_where, v_sort, v_dir, v_limit, v_offset)
  INTO v_rows
  USING _search, _family, _module, _sub_module, _rule_type, _status, _severity, _tag,
        _triggered_from, _triggered_to;

  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE status = 'active'),
    'draft', count(*) FILTER (WHERE status = 'draft'),
    'inactive', count(*) FILTER (WHERE status = 'inactive'),
    'never_executed', count(*) FILTER (WHERE coalesce(trigger_count,0) = 0),
    'never_tested', count(*) FILTER (WHERE last_tested_at IS NULL AND capabilities->>'test' = 'true'),
    'stale_tests', count(*) FILTER (WHERE capabilities->>'test' = 'true'
                     AND last_tested_at IS NOT NULL AND last_tested_at < now() - interval '90 days'),
    'families', (
      SELECT jsonb_object_agg(f.fam, coalesce(c.cnt, 0))
      FROM unnest(v_families) AS f(fam)
      LEFT JOIN (SELECT family, count(*) AS cnt FROM public.rule_inventory_ext GROUP BY family) c
             ON c.family = f.fam
    ),
    'failing', (
      SELECT count(DISTINCT e.rule_id) FROM public.engine_rule_executions e
       WHERE e.executed_at > now() - interval '30 days' AND e.reason ILIKE 'error%'
    )
  ) INTO v_kpi
  FROM public.rule_inventory_ext;

  SELECT jsonb_build_object(
    'modules', (SELECT coalesce(jsonb_agg(DISTINCT i.module), '[]'::jsonb)
                  FROM public.rule_inventory_ext i WHERE i.module IS NOT NULL),
    'sub_modules', (SELECT coalesce(jsonb_agg(DISTINCT i.sub_module), '[]'::jsonb)
                  FROM public.rule_inventory_ext i WHERE i.sub_module IS NOT NULL),
    'rule_types', (SELECT coalesce(jsonb_agg(DISTINCT i.rule_type), '[]'::jsonb)
                  FROM public.rule_inventory_ext i WHERE i.rule_type IS NOT NULL),
    'severities', (SELECT coalesce(jsonb_agg(DISTINCT i.severity), '[]'::jsonb)
                  FROM public.rule_inventory_ext i WHERE i.severity IS NOT NULL),
    'tags', (SELECT coalesce(jsonb_agg(DISTINCT tg), '[]'::jsonb)
                  FROM public.rule_inventory_ext i, unnest(coalesce(i.tags, ARRAY[]::text[])) AS t(tg))
  ) INTO v_facets;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'kpis', v_kpi, 'facets', v_facets);
END; $function$;