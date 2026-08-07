-- =========================================================
-- Phase 8A — surveillance signal fields on conduct_alerts
-- =========================================================
ALTER TABLE public.conduct_alerts
  ADD COLUMN IF NOT EXISTS disposition text NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS disposition_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS observation_start timestamptz,
  ADD COLUMN IF NOT EXISTS observation_end timestamptz,
  ADD COLUMN IF NOT EXISTS instrument_ref text,
  ADD COLUMN IF NOT EXISTS monitoring_result_id uuid,
  ADD COLUMN IF NOT EXISTS rule_version integer,
  ADD COLUMN IF NOT EXISTS threshold_value numeric,
  ADD COLUMN IF NOT EXISTS investigation_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conduct_alerts_disposition_chk') THEN
    ALTER TABLE public.conduct_alerts
      ADD CONSTRAINT conduct_alerts_disposition_chk
      CHECK (disposition = ANY (ARRAY['NEW','UNDER_REVIEW','FALSE_POSITIVE','MONITOR','ESCALATED','CLOSED']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conduct_alerts_monitoring_result_fkey') THEN
    ALTER TABLE public.conduct_alerts
      ADD CONSTRAINT conduct_alerts_monitoring_result_fkey
      FOREIGN KEY (monitoring_result_id) REFERENCES public.conduct_monitoring_results(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conduct_alerts_investigation_fkey') THEN
    ALTER TABLE public.conduct_alerts
      ADD CONSTRAINT conduct_alerts_investigation_fkey
      FOREIGN KEY (investigation_id) REFERENCES public.conduct_investigations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill observation period + disposition from existing state.
UPDATE public.conduct_alerts
   SET observation_start = COALESCE(observation_start, window_start),
       observation_end   = COALESCE(observation_end, window_end),
       disposition = CASE
                       WHEN status = 'closed' THEN 'CLOSED'
                       WHEN status = 'acknowledged' THEN 'UNDER_REVIEW'
                       ELSE 'NEW'
                     END
 WHERE disposition = 'NEW';

CREATE INDEX IF NOT EXISTS idx_conduct_alerts_disposition ON public.conduct_alerts(disposition);

-- =========================================================
-- Append-only guard shared by Phase 8 evidence/history tables
-- =========================================================
CREATE OR REPLACE FUNCTION public.conduct_appendonly_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

-- =========================================================
-- Signal evidence
-- =========================================================
CREATE TABLE IF NOT EXISTS public.conduct_signal_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.conduct_alerts(id) ON DELETE CASCADE,
  document_id uuid,
  storage_path text,
  label text,
  note text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.conduct_signal_evidence TO authenticated;
GRANT ALL ON public.conduct_signal_evidence TO service_role;
ALTER TABLE public.conduct_signal_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read conduct signal evidence" ON public.conduct_signal_evidence;
CREATE POLICY "Read conduct signal evidence"
  ON public.conduct_signal_evidence FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view'));

DROP POLICY IF EXISTS "Add conduct signal evidence" ON public.conduct_signal_evidence;
CREATE POLICY "Add conduct signal evidence"
  ON public.conduct_signal_evidence FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'market_conduct','run_conduct_analytics')
      OR public.has_permission(auth.uid(),'market_conduct','manage_monitoring_rules')
      OR public.has_permission(auth.uid(),'market_conduct','manage_complaints')
    )
  );

DROP TRIGGER IF EXISTS trg_conduct_signal_evidence_appendonly ON public.conduct_signal_evidence;
CREATE TRIGGER trg_conduct_signal_evidence_appendonly
  BEFORE UPDATE OR DELETE ON public.conduct_signal_evidence
  FOR EACH ROW EXECUTE FUNCTION public.conduct_appendonly_guard();

CREATE INDEX IF NOT EXISTS idx_conduct_signal_evidence_signal ON public.conduct_signal_evidence(signal_id);

-- =========================================================
-- Signal disposition history (append-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.conduct_signal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.conduct_alerts(id) ON DELETE CASCADE,
  from_disposition text,
  to_disposition text NOT NULL,
  reason text,
  actor_id uuid,
  investigation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conduct_signal_events TO authenticated;
GRANT ALL ON public.conduct_signal_events TO service_role;
ALTER TABLE public.conduct_signal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read conduct signal events" ON public.conduct_signal_events;
CREATE POLICY "Read conduct signal events"
  ON public.conduct_signal_events FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view'));

DROP TRIGGER IF EXISTS trg_conduct_signal_events_appendonly ON public.conduct_signal_events;
CREATE TRIGGER trg_conduct_signal_events_appendonly
  BEFORE UPDATE OR DELETE ON public.conduct_signal_events
  FOR EACH ROW EXECUTE FUNCTION public.conduct_appendonly_guard();

CREATE INDEX IF NOT EXISTS idx_conduct_signal_events_signal ON public.conduct_signal_events(signal_id, created_at DESC);

-- =========================================================
-- Disposition may only change through the sanctioned RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.conduct_signal_disposition_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.disposition IS DISTINCT FROM OLD.disposition
     AND COALESCE(current_setting('app.signal_disposition_ok', true), '') <> 'on'
     AND NOT (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'Signal disposition can only be changed via set_conduct_signal_disposition()';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conduct_signal_disposition_guard ON public.conduct_alerts;
CREATE TRIGGER trg_conduct_signal_disposition_guard
  BEFORE UPDATE ON public.conduct_alerts
  FOR EACH ROW EXECUTE FUNCTION public.conduct_signal_disposition_guard();

-- =========================================================
-- 8B — first-class rule configuration + versions
-- =========================================================
ALTER TABLE public.conduct_monitoring_rules
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS metric text,
  ADD COLUMN IF NOT EXISTS source_dataset text,
  ADD COLUMN IF NOT EXISTS threshold_value numeric,
  ADD COLUMN IF NOT EXISTS comparison_operator text,
  ADD COLUMN IF NOT EXISTS lookback_days integer,
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;

UPDATE public.conduct_monitoring_rules
   SET metric = COALESCE(metric, definition->>'metric'),
       comparison_operator = COALESCE(comparison_operator, definition->>'op'),
       threshold_value = COALESCE(threshold_value, NULLIF(definition->>'threshold','')::numeric),
       lookback_days = COALESCE(lookback_days, NULLIF(definition->>'window_days','')::integer),
       source_dataset = COALESCE(source_dataset, 'complaints'),
       code = COALESCE(code, 'MSR-' || upper(substr(replace(id::text,'-',''), 1, 8)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_conduct_monitoring_rules_code
  ON public.conduct_monitoring_rules(code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.conduct_monitoring_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.conduct_monitoring_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version)
);

GRANT SELECT ON public.conduct_monitoring_rule_versions TO authenticated;
GRANT ALL ON public.conduct_monitoring_rule_versions TO service_role;
ALTER TABLE public.conduct_monitoring_rule_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read conduct rule versions" ON public.conduct_monitoring_rule_versions;
CREATE POLICY "Read conduct rule versions"
  ON public.conduct_monitoring_rule_versions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view'));

DROP TRIGGER IF EXISTS trg_conduct_rule_versions_appendonly ON public.conduct_monitoring_rule_versions;
CREATE TRIGGER trg_conduct_rule_versions_appendonly
  BEFORE UPDATE OR DELETE ON public.conduct_monitoring_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.conduct_appendonly_guard();

CREATE OR REPLACE FUNCTION public.conduct_rule_version_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v := COALESCE(NEW.current_version, 1);
  ELSE
    IF NEW.definition IS NOT DISTINCT FROM OLD.definition
       AND NEW.threshold_value IS NOT DISTINCT FROM OLD.threshold_value
       AND NEW.comparison_operator IS NOT DISTINCT FROM OLD.comparison_operator
       AND NEW.lookback_days IS NOT DISTINCT FROM OLD.lookback_days
       AND NEW.metric IS NOT DISTINCT FROM OLD.metric
       AND NEW.active IS NOT DISTINCT FROM OLD.active THEN
      RETURN NEW;
    END IF;
    v := COALESCE(OLD.current_version, 1) + 1;
    NEW.current_version := v;
  END IF;

  INSERT INTO public.conduct_monitoring_rule_versions (rule_id, version, snapshot, created_by)
  VALUES (
    NEW.id, v,
    jsonb_build_object(
      'code', NEW.code, 'name', NEW.name, 'description', NEW.description,
      'scope', NEW.scope, 'rule_type', NEW.rule_type, 'definition', NEW.definition,
      'metric', NEW.metric, 'source_dataset', NEW.source_dataset,
      'threshold_value', NEW.threshold_value, 'comparison_operator', NEW.comparison_operator,
      'lookback_days', NEW.lookback_days, 'frequency', NEW.frequency,
      'risk_delta', NEW.risk_delta, 'active', NEW.active
    ),
    auth.uid()
  )
  ON CONFLICT (rule_id, version) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conduct_rule_version_snapshot_ins ON public.conduct_monitoring_rules;
CREATE TRIGGER trg_conduct_rule_version_snapshot_ins
  AFTER INSERT ON public.conduct_monitoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.conduct_rule_version_snapshot();

DROP TRIGGER IF EXISTS trg_conduct_rule_version_snapshot_upd ON public.conduct_monitoring_rules;
CREATE TRIGGER trg_conduct_rule_version_snapshot_upd
  BEFORE UPDATE ON public.conduct_monitoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.conduct_rule_version_snapshot();

-- Seed version 1 snapshots for existing rules.
INSERT INTO public.conduct_monitoring_rule_versions (rule_id, version, snapshot, effective_from, created_by)
SELECT r.id, COALESCE(r.current_version,1),
       jsonb_build_object(
         'code', r.code, 'name', r.name, 'description', r.description,
         'scope', r.scope, 'rule_type', r.rule_type, 'definition', r.definition,
         'metric', r.metric, 'source_dataset', r.source_dataset,
         'threshold_value', r.threshold_value, 'comparison_operator', r.comparison_operator,
         'lookback_days', r.lookback_days, 'frequency', r.frequency,
         'risk_delta', r.risk_delta, 'active', r.active),
       r.created_at, r.created_by
  FROM public.conduct_monitoring_rules r
ON CONFLICT (rule_id, version) DO NOTHING;

-- =========================================================
-- 8A RPC — disposition transitions
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_conduct_signal_disposition(
  _signal_id uuid,
  _disposition text,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur text;
BEGIN
  IF _disposition NOT IN ('NEW','UNDER_REVIEW','FALSE_POSITIVE','MONITOR','ESCALATED','CLOSED') THEN
    RAISE EXCEPTION 'Invalid disposition %', _disposition;
  END IF;
  IF _disposition = 'ESCALATED' THEN
    RAISE EXCEPTION 'Use refer_conduct_signal_to_investigation() to escalate a signal';
  END IF;

  IF NOT (
    public.is_super_admin(_uid)
    OR public.has_permission(_uid,'market_conduct','run_conduct_analytics')
    OR public.has_permission(_uid,'market_conduct','manage_monitoring_rules')
    OR public.has_permission(_uid,'market_conduct','manage_complaints')
  ) THEN
    RAISE EXCEPTION 'Not authorized to review surveillance signals';
  END IF;

  SELECT disposition INTO _cur FROM public.conduct_alerts WHERE id = _signal_id;
  IF _cur IS NULL THEN
    RAISE EXCEPTION 'Signal not found';
  END IF;
  IF _cur IN ('ESCALATED','CLOSED') THEN
    RAISE EXCEPTION 'Signal is % and cannot be re-dispositioned', _cur;
  END IF;
  IF _cur = _disposition THEN
    RAISE EXCEPTION 'Signal is already %', _cur;
  END IF;
  IF _disposition IN ('FALSE_POSITIVE','CLOSED') AND COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'A reason is required to mark a signal % ', _disposition;
  END IF;

  PERFORM set_config('app.signal_disposition_ok','on', true);

  UPDATE public.conduct_alerts
     SET disposition = _disposition,
         disposition_reason = COALESCE(NULLIF(btrim(_reason),''), disposition_reason),
         reviewed_by = _uid,
         reviewed_at = now(),
         status = CASE
                    WHEN _disposition IN ('FALSE_POSITIVE','CLOSED') THEN 'closed'
                    WHEN _disposition IN ('UNDER_REVIEW','MONITOR') THEN 'acknowledged'
                    ELSE status
                  END,
         closed_by = CASE WHEN _disposition IN ('FALSE_POSITIVE','CLOSED') THEN _uid ELSE closed_by END,
         closed_at = CASE WHEN _disposition IN ('FALSE_POSITIVE','CLOSED') THEN now() ELSE closed_at END,
         closure_reason = CASE WHEN _disposition IN ('FALSE_POSITIVE','CLOSED')
                               THEN COALESCE(NULLIF(btrim(_reason),''), closure_reason) ELSE closure_reason END,
         acknowledged_by = CASE WHEN _disposition IN ('UNDER_REVIEW','MONITOR')
                                THEN COALESCE(acknowledged_by, _uid) ELSE acknowledged_by END,
         acknowledged_at = CASE WHEN _disposition IN ('UNDER_REVIEW','MONITOR')
                                THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END,
         updated_at = now()
   WHERE id = _signal_id;

  INSERT INTO public.conduct_signal_events (signal_id, from_disposition, to_disposition, reason, actor_id)
  VALUES (_signal_id, _cur, _disposition, NULLIF(btrim(_reason),''), _uid);

  PERFORM set_config('app.signal_disposition_ok','', true);
  RETURN _signal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_conduct_signal_disposition(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_conduct_signal_disposition(uuid, text, text) TO authenticated;

-- =========================================================
-- 8C RPC — refer a reviewed signal to a formal investigation
-- =========================================================
CREATE OR REPLACE FUNCTION public.refer_conduct_signal_to_investigation(
  _signal_id uuid,
  _allegation text,
  _reason text DEFAULT NULL,
  _priority text DEFAULT 'medium',
  _due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sig public.conduct_alerts;
  _inv_id uuid;
BEGIN
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'market_conduct','initiate_investigation')) THEN
    RAISE EXCEPTION 'Not authorized to refer signals to investigation';
  END IF;

  SELECT * INTO _sig FROM public.conduct_alerts WHERE id = _signal_id;
  IF _sig.id IS NULL THEN
    RAISE EXCEPTION 'Signal not found';
  END IF;
  IF _sig.disposition <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'Only a signal under review can be referred (current: %)', _sig.disposition;
  END IF;
  IF COALESCE(btrim(_allegation),'') = '' THEN
    RAISE EXCEPTION 'An allegation summary is required';
  END IF;

  INSERT INTO public.conduct_investigations
    (source_type, source_id, licensee_id, product_id, allegation, priority, severity, due_date, opened_by, metadata)
  VALUES
    ('surveillance_signal', _signal_id, _sig.licensee_id, _sig.product_id, btrim(_allegation),
     COALESCE(_priority,'medium'), _sig.severity, _due_date, _uid,
     jsonb_build_object(
       'signal_id', _signal_id,
       'signal_kind', _sig.kind,
       'signal_rule_id', _sig.triage_rule_id,
       'signal_rule_version', _sig.rule_version,
       'signal_threshold', _sig.threshold_value,
       'signal_explanation', _sig.explanation,
       'signal_source_record_ids', to_jsonb(_sig.source_record_ids),
       'signal_observation_start', _sig.observation_start,
       'signal_observation_end', _sig.observation_end,
       'referral_reason', NULLIF(btrim(_reason),'')
     ))
  RETURNING id INTO _inv_id;

  PERFORM set_config('app.signal_disposition_ok','on', true);

  UPDATE public.conduct_alerts
     SET disposition = 'ESCALATED',
         disposition_reason = COALESCE(NULLIF(btrim(_reason),''), disposition_reason),
         reviewed_by = _uid,
         reviewed_at = now(),
         investigation_id = _inv_id,
         updated_at = now()
   WHERE id = _signal_id;

  INSERT INTO public.conduct_signal_events
    (signal_id, from_disposition, to_disposition, reason, actor_id, investigation_id)
  VALUES (_signal_id, 'UNDER_REVIEW', 'ESCALATED', NULLIF(btrim(_reason),''), _uid, _inv_id);

  PERFORM set_config('app.signal_disposition_ok','', true);
  RETURN _inv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refer_conduct_signal_to_investigation(uuid, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refer_conduct_signal_to_investigation(uuid, text, text, text, date) TO authenticated;