-- ============================================================
-- MC-05 : Canonical Conduct Signal layer (backend only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conduct_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE SET NULL,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  sector_id uuid,
  product_id uuid REFERENCES public.conduct_products(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.conduct_channels(id) ON DELETE SET NULL,
  conduct_risk_category_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  source_type text NOT NULL,
  signal_category text,
  severity text NOT NULL DEFAULT 'medium',
  risk_score numeric,
  systemic_potential text NOT NULL DEFAULT 'unassessed',
  status text NOT NULL DEFAULT 'new',
  owner_id uuid,
  rationale text,
  disposition text,
  disposition_reason text,
  escalated_alert_id uuid REFERENCES public.conduct_alerts(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  validated_by uuid,
  validated_at timestamptz,
  dismissed_by uuid,
  dismissed_at timestamptz,
  escalated_by uuid,
  escalated_at timestamptz,
  reopened_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT conduct_signals_source_type_chk CHECK (source_type IN (
    'complaint','complaint_outcome','supervisory_observation','conduct_alert',
    'regulatory_return','manual_intelligence')),
  CONSTRAINT conduct_signals_severity_chk CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT conduct_signals_systemic_chk CHECK (systemic_potential IN ('unassessed','none','low','medium','high')),
  CONSTRAINT conduct_signals_status_chk CHECK (status IN ('new','under_review','validated','escalated','dismissed','closed'))
);

GRANT SELECT ON public.conduct_signals TO authenticated;
GRANT ALL ON public.conduct_signals TO service_role;
ALTER TABLE public.conduct_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct signals" ON public.conduct_signals
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  );

CREATE INDEX IF NOT EXISTS idx_conduct_signals_status ON public.conduct_signals(status);
CREATE INDEX IF NOT EXISTS idx_conduct_signals_entity ON public.conduct_signals(licensee_id);
CREATE INDEX IF NOT EXISTS idx_conduct_signals_regulator ON public.conduct_signals(regulator_id);
CREATE INDEX IF NOT EXISTS idx_conduct_signals_owner ON public.conduct_signals(owner_id);

CREATE TRIGGER trg_conduct_signals_updated
  BEFORE UPDATE ON public.conduct_signals
  FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();

-- ---------------------------------------------------------- sources

CREATE TABLE IF NOT EXISTS public.conduct_signal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.conduct_signals(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_table text,
  source_id uuid,
  source_reference text,
  note text,
  linked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_signal_sources_type_chk CHECK (source_type IN (
    'complaint','complaint_outcome','supervisory_observation','conduct_alert',
    'regulatory_return','manual_intelligence'))
);

GRANT SELECT ON public.conduct_signal_sources TO authenticated;
GRANT ALL ON public.conduct_signal_sources TO service_role;
ALTER TABLE public.conduct_signal_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct signal sources" ON public.conduct_signal_sources
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  );

CREATE INDEX IF NOT EXISTS idx_conduct_signal_sources_signal ON public.conduct_signal_sources(signal_id);

-- ---------------------------------------------------------- signal <-> alert links

CREATE TABLE IF NOT EXISTS public.conduct_signal_alert_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.conduct_signals(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES public.conduct_alerts(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'related',
  rationale text,
  linked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_signal_alert_links_type_chk CHECK (link_type IN ('escalated_to','related','source')),
  CONSTRAINT conduct_signal_alert_links_uq UNIQUE (signal_id, alert_id, link_type)
);

GRANT SELECT ON public.conduct_signal_alert_links TO authenticated;
GRANT ALL ON public.conduct_signal_alert_links TO service_role;
ALTER TABLE public.conduct_signal_alert_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct signal alert links" ON public.conduct_signal_alert_links
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  );

CREATE INDEX IF NOT EXISTS idx_csal_signal ON public.conduct_signal_alert_links(signal_id);
CREATE INDEX IF NOT EXISTS idx_csal_alert ON public.conduct_signal_alert_links(alert_id);

-- ---------------------------------------------------------- append-only history

CREATE TABLE IF NOT EXISTS public.conduct_signal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.conduct_signals(id) ON DELETE CASCADE,
  action_code text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conduct_signal_history TO authenticated;
GRANT ALL ON public.conduct_signal_history TO service_role;
ALTER TABLE public.conduct_signal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conduct signal history" ON public.conduct_signal_history
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  );

CREATE INDEX IF NOT EXISTS idx_conduct_signal_history_signal
  ON public.conduct_signal_history(signal_id, created_at DESC);

CREATE TRIGGER trg_conduct_signal_history_appendonly
  BEFORE UPDATE OR DELETE ON public.conduct_signal_history
  FOR EACH ROW EXECUTE FUNCTION public.conduct_appendonly_guard();

-- ---------------------------------------------------------- reuse evidence engine

ALTER TABLE public.conduct_evidence
  ADD COLUMN IF NOT EXISTS signal_id uuid REFERENCES public.conduct_signals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conduct_evidence_signal ON public.conduct_evidence(signal_id);

-- ============================================================
-- Authority helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.conduct_signal_require(_actions text[])
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _a text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;
  FOREACH _a IN ARRAY _actions LOOP
    IF public.has_permission(_uid, 'market_conduct', _a) THEN RETURN _uid; END IF;
  END LOOP;
  RAISE EXCEPTION 'not_authorized: market_conduct.%', _actions[1] USING ERRCODE = '42501';
END; $$;

REVOKE ALL ON FUNCTION public.conduct_signal_require(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_signal_require(text[]) TO authenticated, service_role;

-- Scope gate: regulator / sector / entity authority for an existing signal
CREATE OR REPLACE FUNCTION public.conduct_signal_guard(_signal_id uuid, _actions text[])
RETURNS public.conduct_signals
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _s public.conduct_signals;
BEGIN
  _uid := public.conduct_signal_require(_actions);
  SELECT * INTO _s FROM public.conduct_signals WHERE id = _signal_id;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'signal_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_super_admin(_uid) THEN
    IF NOT public.regulatory_scope_allows(
         _uid, 'market_conduct', _actions[1],
         _s.regulator_id, _s.sector_id, NULL, _s.licensee_id, _s.owner_id) THEN
      RAISE EXCEPTION 'not_authorized: signal out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN _s;
END; $$;

REVOKE ALL ON FUNCTION public.conduct_signal_guard(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_signal_guard(uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_signal_next_reference()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'CS-' || to_char(now(), 'YYYY') || '-' ||
         lpad((1 + coalesce((
           SELECT max(substring(s.reference from '[0-9]+$')::int)
             FROM public.conduct_signals s
            WHERE s.reference LIKE 'CS-' || to_char(now(), 'YYYY') || '-%'), 0))::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION public.conduct_signal_log(
  _signal_id uuid, _action_code text, _from text, _to text, _reason text,
  _detail jsonb, _actor uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.conduct_signal_history(signal_id, action_code, from_status, to_status, reason, detail, actor_id)
  VALUES (_signal_id, _action_code, _from, _to, _reason, coalesce(_detail, '{}'::jsonb), _actor);
$$;

REVOKE ALL ON FUNCTION public.conduct_signal_log(uuid, text, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_signal_log(uuid, text, text, text, text, jsonb, uuid) TO service_role;

-- ============================================================
-- Governed operations
-- ============================================================

CREATE OR REPLACE FUNCTION public.conduct_signal_create(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _id uuid; _ref text; _title text; _src text; _sector uuid; _lic uuid; _reg uuid;
BEGIN
  _uid := public.conduct_signal_require(ARRAY['manage_complaints','run_conduct_analytics','manage_monitoring_rules']);

  _title := btrim(coalesce(_payload->>'title',''));
  _src   := btrim(coalesce(_payload->>'source_type',''));
  IF length(_title) < 5 THEN
    RAISE EXCEPTION 'A signal title of at least 5 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _src NOT IN ('complaint','complaint_outcome','supervisory_observation','conduct_alert','regulatory_return','manual_intelligence') THEN
    RAISE EXCEPTION 'A valid source type is required' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(_payload->>'rationale',''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  _lic := nullif(_payload->>'licensee_id','')::uuid;
  _reg := nullif(_payload->>'regulator_id','')::uuid;
  SELECT coalesce(nullif(_payload->>'sector_id','')::uuid, l.sector_id) INTO _sector
    FROM public.licensees l WHERE l.id = _lic;
  _sector := coalesce(_sector, nullif(_payload->>'sector_id','')::uuid);

  IF NOT public.is_super_admin(_uid) THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'manage_complaints',
           _reg, _sector, NULL, _lic, _uid) THEN
      RAISE EXCEPTION 'not_authorized: signal out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  _ref := public.conduct_signal_next_reference();

  INSERT INTO public.conduct_signals(
    reference, regulator_id, licensee_id, sector_id, product_id, channel_id,
    conduct_risk_category_id, title, summary, source_type, signal_category,
    severity, risk_score, systemic_potential, status, owner_id, rationale,
    metadata, created_by)
  VALUES (
    _ref, _reg, _lic, _sector,
    nullif(_payload->>'product_id','')::uuid,
    nullif(_payload->>'channel_id','')::uuid,
    nullif(_payload->>'conduct_risk_category_id','')::uuid,
    _title,
    nullif(btrim(coalesce(_payload->>'summary','')), ''),
    _src,
    nullif(btrim(coalesce(_payload->>'signal_category','')), ''),
    coalesce(nullif(_payload->>'severity',''), 'medium'),
    nullif(_payload->>'risk_score','')::numeric,
    coalesce(nullif(_payload->>'systemic_potential',''), 'unassessed'),
    'new',
    nullif(_payload->>'owner_id','')::uuid,
    btrim(_payload->>'rationale'),
    coalesce(_payload->'metadata', '{}'::jsonb),
    _uid)
  RETURNING id INTO _id;

  IF nullif(_payload->>'source_id','') IS NOT NULL THEN
    INSERT INTO public.conduct_signal_sources(signal_id, source_type, source_table, source_id, source_reference, note, linked_by)
    VALUES (_id, _src, nullif(_payload->>'source_table',''), (_payload->>'source_id')::uuid,
            nullif(_payload->>'source_reference',''), nullif(_payload->>'source_note',''), _uid);
  END IF;

  PERFORM public.conduct_signal_log(_id, 'CREATE', NULL, 'new', btrim(_payload->>'rationale'),
          jsonb_build_object('source_type', _src), _uid);
  PERFORM public.log_compliance_audit('CREATE', 'conduct_signal', _id, NULL,
          (SELECT to_jsonb(s) FROM public.conduct_signals s WHERE s.id = _id),
          'Conduct signal raised: ' || _ref);

  RETURN jsonb_build_object('id', _id, 'reference', _ref);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_link_source(
  _signal_id uuid, _source_type text, _source_id uuid,
  _source_table text DEFAULT NULL, _note text DEFAULT NULL, _source_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _lid uuid;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['manage_complaints','run_conduct_analytics','manage_monitoring_rules']);
  IF _s.status IN ('dismissed','closed') THEN
    RAISE EXCEPTION 'signal_not_open' USING ERRCODE = '22023';
  END IF;
  IF _source_type NOT IN ('complaint','complaint_outcome','supervisory_observation','conduct_alert','regulatory_return','manual_intelligence') THEN
    RAISE EXCEPTION 'A valid source type is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.conduct_signal_sources(signal_id, source_type, source_table, source_id, source_reference, note, linked_by)
  VALUES (_signal_id, _source_type, _source_table, _source_id, _source_reference, nullif(btrim(coalesce(_note,'')), ''), _uid)
  RETURNING id INTO _lid;

  PERFORM public.conduct_signal_log(_signal_id, 'LINK_SOURCE', _s.status, _s.status, _note,
          jsonb_build_object('source_type', _source_type, 'source_id', _source_id), _uid);
  PERFORM public.log_compliance_audit('UPDATE', 'conduct_signal', _signal_id, NULL,
          jsonb_build_object('source_link_id', _lid, 'source_type', _source_type, 'source_id', _source_id),
          'Signal source linked');
  RETURN jsonb_build_object('id', _lid);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_link_evidence(_signal_id uuid, _evidence_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['manage_complaints','run_conduct_analytics','manage_monitoring_rules']);
  IF _s.status IN ('dismissed','closed') THEN
    RAISE EXCEPTION 'signal_not_open' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conduct_evidence e WHERE e.id = _evidence_id) THEN
    RAISE EXCEPTION 'evidence_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.conduct_evidence SET signal_id = _signal_id, updated_at = now() WHERE id = _evidence_id;

  PERFORM public.conduct_signal_log(_signal_id, 'LINK_EVIDENCE', _s.status, _s.status, _note,
          jsonb_build_object('evidence_id', _evidence_id), _uid);
  PERFORM public.log_compliance_audit('UPDATE', 'conduct_signal', _signal_id, NULL,
          jsonb_build_object('evidence_id', _evidence_id), 'Signal evidence linked');
  RETURN jsonb_build_object('signal_id', _signal_id, 'evidence_id', _evidence_id);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_assign(_signal_id uuid, _owner_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _before jsonb; _after jsonb;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['manage_complaints','run_conduct_analytics','manage_monitoring_rules']);
  IF _s.status IN ('dismissed','closed') THEN
    RAISE EXCEPTION 'signal_not_open' USING ERRCODE = '22023';
  END IF;
  IF _owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _owner_id) THEN
    RAISE EXCEPTION 'A valid owner must be selected' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(s) INTO _before FROM public.conduct_signals s WHERE s.id = _signal_id;
  UPDATE public.conduct_signals
     SET owner_id = _owner_id, assigned_at = now(),
         status = CASE WHEN status = 'new' THEN 'under_review' ELSE status END
   WHERE id = _signal_id;
  SELECT to_jsonb(s) INTO _after FROM public.conduct_signals s WHERE s.id = _signal_id;

  PERFORM public.conduct_signal_log(_signal_id, 'ASSIGN', _s.status, (_after->>'status'), _note,
          jsonb_build_object('owner_id', _owner_id), _uid);
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_signal', _signal_id, _before, _after, 'Signal assigned');
  RETURN jsonb_build_object('id', _signal_id, 'owner_id', _owner_id);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_validate(
  _signal_id uuid, _rationale text, _severity text DEFAULT NULL,
  _systemic_potential text DEFAULT NULL, _risk_score numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _before jsonb; _after jsonb;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['run_conduct_analytics','manage_monitoring_rules','manage_complaints']);
  IF _s.status NOT IN ('new','under_review') THEN
    RAISE EXCEPTION 'signal_not_validatable' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_rationale)), 0) < 20 THEN
    RAISE EXCEPTION 'A validation rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _severity IS NOT NULL AND _severity NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Unsupported severity' USING ERRCODE = '22023';
  END IF;
  IF _systemic_potential IS NOT NULL AND _systemic_potential NOT IN ('unassessed','none','low','medium','high') THEN
    RAISE EXCEPTION 'Unsupported systemic potential' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(s) INTO _before FROM public.conduct_signals s WHERE s.id = _signal_id;
  UPDATE public.conduct_signals
     SET status = 'validated', validated_by = _uid, validated_at = now(),
         rationale = btrim(_rationale),
         severity = coalesce(_severity, severity),
         systemic_potential = coalesce(_systemic_potential, systemic_potential),
         risk_score = coalesce(_risk_score, risk_score)
   WHERE id = _signal_id;
  SELECT to_jsonb(s) INTO _after FROM public.conduct_signals s WHERE s.id = _signal_id;

  PERFORM public.conduct_signal_log(_signal_id, 'VALIDATE', _s.status, 'validated', btrim(_rationale), '{}'::jsonb, _uid);
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_signal', _signal_id, _before, _after,
          'VALIDATE — ' || btrim(_rationale));
  RETURN jsonb_build_object('id', _signal_id, 'status', 'validated');
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_dismiss(_signal_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _before jsonb; _after jsonb;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['run_conduct_analytics','manage_monitoring_rules','manage_complaints']);
  IF _s.status IN ('dismissed','closed','escalated') THEN
    RAISE EXCEPTION 'signal_already_disposed' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_reason)), 0) < 10 THEN
    RAISE EXCEPTION 'A dismissal reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(s) INTO _before FROM public.conduct_signals s WHERE s.id = _signal_id;
  UPDATE public.conduct_signals
     SET status = 'dismissed', disposition = 'dismissed', disposition_reason = btrim(_reason),
         dismissed_by = _uid, dismissed_at = now(), closed_at = now()
   WHERE id = _signal_id;
  SELECT to_jsonb(s) INTO _after FROM public.conduct_signals s WHERE s.id = _signal_id;

  PERFORM public.conduct_signal_log(_signal_id, 'DISMISS', _s.status, 'dismissed', btrim(_reason), '{}'::jsonb, _uid);
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_signal', _signal_id, _before, _after,
          'DISMISS — ' || btrim(_reason));
  RETURN jsonb_build_object('id', _signal_id, 'status', 'dismissed');
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_link_alert(
  _signal_id uuid, _alert_id uuid, _rationale text, _link_type text DEFAULT 'related')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _lid uuid;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['manage_monitoring_rules','run_conduct_analytics','manage_complaints']);
  IF _link_type NOT IN ('related','source') THEN
    RAISE EXCEPTION 'Use conduct_signal_escalate_to_alert to escalate a signal' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conduct_alerts a WHERE a.id = _alert_id) THEN
    RAISE EXCEPTION 'alert_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(length(btrim(_rationale)), 0) < 10 THEN
    RAISE EXCEPTION 'A linkage rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.conduct_signal_alert_links(signal_id, alert_id, link_type, rationale, linked_by)
  VALUES (_signal_id, _alert_id, _link_type, btrim(_rationale), _uid)
  ON CONFLICT (signal_id, alert_id, link_type) DO UPDATE SET rationale = excluded.rationale
  RETURNING id INTO _lid;

  PERFORM public.conduct_signal_log(_signal_id, 'LINK_ALERT', _s.status, _s.status, btrim(_rationale),
          jsonb_build_object('alert_id', _alert_id, 'link_type', _link_type), _uid);
  PERFORM public.log_compliance_audit('UPDATE', 'conduct_signal', _signal_id, NULL,
          jsonb_build_object('alert_id', _alert_id, 'link_type', _link_type), 'Signal linked to alert');
  RETURN jsonb_build_object('id', _lid, 'alert_id', _alert_id);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_escalate_to_alert(
  _signal_id uuid, _rationale text, _severity text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _alert uuid; _before jsonb; _after jsonb;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['manage_monitoring_rules','initiate_investigation','manage_complaints']);
  IF _s.status <> 'validated' THEN
    RAISE EXCEPTION 'signal_must_be_validated_before_escalation' USING ERRCODE = '22023';
  END IF;
  IF _s.escalated_alert_id IS NOT NULL THEN
    RAISE EXCEPTION 'signal_already_escalated' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_rationale)), 0) < 20 THEN
    RAISE EXCEPTION 'An escalation rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.conduct_alerts(
    regulator_id, licensee_id, product_id, channel_id, conduct_risk_category_id,
    kind, severity, status, title, detail, generated_by, source, explanation)
  VALUES (
    _s.regulator_id, _s.licensee_id, _s.product_id, _s.channel_id, _s.conduct_risk_category_id,
    'rule_triggered',
    coalesce(_severity, _s.severity), 'open',
    _s.title,
    jsonb_build_object('signal_id', _s.id, 'signal_reference', _s.reference,
                       'source_type', _s.source_type, 'systemic_potential', _s.systemic_potential),
    'manual', 'conduct_signal', btrim(_rationale))
  RETURNING id INTO _alert;

  INSERT INTO public.conduct_signal_alert_links(signal_id, alert_id, link_type, rationale, linked_by)
  VALUES (_signal_id, _alert, 'escalated_to', btrim(_rationale), _uid);

  SELECT to_jsonb(s) INTO _before FROM public.conduct_signals s WHERE s.id = _signal_id;
  UPDATE public.conduct_signals
     SET status = 'escalated', disposition = 'escalated_to_alert', disposition_reason = btrim(_rationale),
         escalated_alert_id = _alert, escalated_by = _uid, escalated_at = now()
   WHERE id = _signal_id;
  SELECT to_jsonb(s) INTO _after FROM public.conduct_signals s WHERE s.id = _signal_id;

  PERFORM public.conduct_signal_log(_signal_id, 'ESCALATE_TO_ALERT', _before->>'status', 'escalated',
          btrim(_rationale), jsonb_build_object('alert_id', _alert), _uid);
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_signal', _signal_id, _before, _after,
          'ESCALATE_TO_ALERT — ' || btrim(_rationale));
  RETURN jsonb_build_object('id', _signal_id, 'alert_id', _alert, 'status', 'escalated');
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_reopen(_signal_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _s public.conduct_signals; _before jsonb; _after jsonb;
BEGIN
  _s := public.conduct_signal_guard(_signal_id, ARRAY['manage_monitoring_rules','run_conduct_analytics','manage_complaints']);
  IF _s.status NOT IN ('dismissed','closed') THEN
    RAISE EXCEPTION 'signal_not_reopenable' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_reason)), 0) < 20 THEN
    RAISE EXCEPTION 'A reopening rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(s) INTO _before FROM public.conduct_signals s WHERE s.id = _signal_id;
  UPDATE public.conduct_signals
     SET status = 'under_review', disposition = NULL, disposition_reason = NULL,
         dismissed_by = NULL, dismissed_at = NULL, closed_at = NULL, reopened_at = now()
   WHERE id = _signal_id;
  SELECT to_jsonb(s) INTO _after FROM public.conduct_signals s WHERE s.id = _signal_id;

  PERFORM public.conduct_signal_log(_signal_id, 'REOPEN', _s.status, 'under_review', btrim(_reason), '{}'::jsonb, _uid);
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_signal', _signal_id, _before, _after,
          'REOPEN — ' || btrim(_reason));
  RETURN jsonb_build_object('id', _signal_id, 'status', 'under_review');
END; $$;

-- ============================================================
-- Read models
-- ============================================================

CREATE OR REPLACE FUNCTION public.conduct_signal_register(
  _statuses text[] DEFAULT NULL,
  _severities text[] DEFAULT NULL,
  _source_types text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_disposed boolean DEFAULT false,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, reference text, title text, summary text, source_type text, signal_category text,
  severity text, risk_score numeric, systemic_potential text, status text,
  entity_id uuid, entity_name text, sector_id uuid, product_name text, channel_name text,
  risk_category_name text, owner_id uuid, owner_name text, rationale text,
  disposition text, disposition_reason text,
  created_at timestamptz, validated_at timestamptz, dismissed_at timestamptz,
  escalated_at timestamptz, escalated_alert_id uuid, alert_links bigint,
  source_links bigint, evidence_count bigint, last_activity_at timestamptz,
  canonical_href text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.conduct_signal_require(ARRAY['view']);
  RETURN QUERY
  WITH scoped AS (
    SELECT s.*, l.name AS entity_name, pr.name AS product_name, ch.name AS channel_name,
           rc.name AS risk_category_name, p.full_name AS owner_name
      FROM public.conduct_signals s
      LEFT JOIN public.licensees l ON l.id = s.licensee_id
      LEFT JOIN public.conduct_products pr ON pr.id = s.product_id
      LEFT JOIN public.conduct_channels ch ON ch.id = s.channel_id
      LEFT JOIN public.conduct_risk_categories rc ON rc.id = s.conduct_risk_category_id
      LEFT JOIN public.profiles p ON p.id = s.owner_id
     WHERE (_include_disposed OR s.status NOT IN ('dismissed','closed'))
       AND (_statuses IS NULL OR s.status = ANY(_statuses))
       AND (_severities IS NULL OR s.severity = ANY(_severities))
       AND (_source_types IS NULL OR s.source_type = ANY(_source_types))
       AND (_entity_id IS NULL OR s.licensee_id = _entity_id)
       AND (_owner_id IS NULL OR s.owner_id = _owner_id)
       AND (_search IS NULL OR btrim(_search) = '' OR
            s.reference ILIKE '%' || btrim(_search) || '%' OR
            coalesce(s.title,'') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(l.name,'') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.id, s.reference, s.title, s.summary, s.source_type, s.signal_category,
         s.severity, s.risk_score, s.systemic_potential, s.status,
         s.licensee_id, s.entity_name, s.sector_id, s.product_name, s.channel_name,
         s.risk_category_name, s.owner_id, s.owner_name, s.rationale,
         s.disposition, s.disposition_reason,
         s.created_at, s.validated_at, s.dismissed_at, s.escalated_at, s.escalated_alert_id,
         (SELECT count(*) FROM public.conduct_signal_alert_links al WHERE al.signal_id = s.id),
         (SELECT count(*) FROM public.conduct_signal_sources sr WHERE sr.signal_id = s.id),
         (SELECT count(*) FROM public.conduct_evidence e WHERE e.signal_id = s.id),
         greatest(s.updated_at, s.created_at),
         '/conduct/signals/' || s.id,
         counted.n
    FROM scoped s, counted
   ORDER BY CASE s.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            s.created_at DESC
   LIMIT greatest(coalesce(_limit, 50), 1) OFFSET greatest(coalesce(_offset, 0), 0);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_signal_case(_signal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _s public.conduct_signals;
BEGIN
  PERFORM public.conduct_signal_require(ARRAY['view']);
  SELECT * INTO _s FROM public.conduct_signals WHERE id = _signal_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'signal_not_found' USING ERRCODE = 'P0002'; END IF;

  RETURN jsonb_build_object(
    'signal', to_jsonb(_s)
      || jsonb_build_object(
           'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = _s.licensee_id),
           'owner_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = _s.owner_id),
           'risk_category_name', (SELECT rc.name FROM public.conduct_risk_categories rc WHERE rc.id = _s.conduct_risk_category_id)),
    'sources', coalesce((SELECT jsonb_agg(to_jsonb(sr) ORDER BY sr.created_at)
                           FROM public.conduct_signal_sources sr WHERE sr.signal_id = _signal_id), '[]'::jsonb),
    'alerts', coalesce((SELECT jsonb_agg(jsonb_build_object(
                            'link_id', al.id, 'link_type', al.link_type, 'rationale', al.rationale,
                            'alert_id', a.id, 'alert_title', a.title, 'alert_status', a.status,
                            'alert_severity', a.severity, 'alert_created_at', a.created_at)
                            ORDER BY al.created_at)
                          FROM public.conduct_signal_alert_links al
                          JOIN public.conduct_alerts a ON a.id = al.alert_id
                         WHERE al.signal_id = _signal_id), '[]'::jsonb),
    'evidence', coalesce((SELECT jsonb_agg(jsonb_build_object(
                            'id', e.id, 'title', e.title, 'evidence_type', e.evidence_type,
                            'restricted', e.restricted, 'uploaded_at', e.uploaded_at)
                            ORDER BY e.uploaded_at)
                          FROM public.conduct_evidence e WHERE e.signal_id = _signal_id), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC)
                          FROM public.conduct_signal_history h WHERE h.signal_id = _signal_id), '[]'::jsonb));
END; $$;

-- ============================================================
-- Execute privileges (no anon; auditors read-only via view actions)
-- ============================================================

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.conduct_signal_create(jsonb)',
    'public.conduct_signal_link_source(uuid,text,uuid,text,text,text)',
    'public.conduct_signal_link_evidence(uuid,uuid,text)',
    'public.conduct_signal_assign(uuid,uuid,text)',
    'public.conduct_signal_validate(uuid,text,text,text,numeric)',
    'public.conduct_signal_dismiss(uuid,text)',
    'public.conduct_signal_link_alert(uuid,uuid,text,text)',
    'public.conduct_signal_escalate_to_alert(uuid,text,text)',
    'public.conduct_signal_reopen(uuid,text)',
    'public.conduct_signal_register(text[],text[],text[],uuid,uuid,text,boolean,integer,integer)',
    'public.conduct_signal_case(uuid)',
    'public.conduct_signal_next_reference()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;