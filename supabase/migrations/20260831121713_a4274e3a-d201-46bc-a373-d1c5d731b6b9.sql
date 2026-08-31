-- EXEC-01 — Canonical Executive Supervisory Dashboard snapshot.
CREATE OR REPLACE FUNCTION public.executive_dashboard_snapshot(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_as_of        timestamptz := now();
  v_window       integer := GREATEST(COALESCE(_window_days, 30), 1);
  v_since        timestamptz;
  v_unavailable  text[] := ARRAY[]::text[];
  v_apps         jsonb := '{}'::jsonb;
  v_complaints   jsonb := '{}'::jsonb;
  v_returns      jsonb := '{}'::jsonb;
  v_kpis         jsonb;
  v_charts       jsonb;
  v_regulator    uuid;
  v_apps_total int := 0; v_open_apps int := 0;
  v_lic_total int := 0; v_lic_active int := 0;
  v_breach_open int := 0; v_breach_total int := 0;
  v_enf_open int := 0; v_penalty numeric := 0; v_penalty_paid numeric := 0;
  v_insp_upcoming int := 0;
  v_fp_active int := 0;
  v_risk_critical int := 0; v_risk_high int := 0;
  v_pru_actions int := 0; v_pru_esc int := 0;
  v_conduct_open int := 0;
  v_open_complaints int := 0;
  v_band_counts jsonb := '{}'::jsonb;
  v_app_stage jsonb := '{}'::jsonb;
  v_breach_by_risk jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.enforce_permission('admin_dashboard', 'view');
  v_since := v_as_of - make_interval(days => v_window);

  BEGIN
    SELECT regulator_id INTO v_regulator FROM public.profiles WHERE id = auth.uid();
  EXCEPTION WHEN others THEN v_regulator := NULL;
  END;

  BEGIN
    v_apps := COALESCE(public.application_work_queue_counts(NULL, _sector_id), '{}'::jsonb);
    v_open_apps := COALESCE((v_apps->>'total_open')::int, 0);
    v_apps_total := v_open_apps + COALESCE((v_apps->>'closed')::int, 0);
    v_app_stage := COALESCE(v_apps->'by_stage', '{}'::jsonb);
  EXCEPTION WHEN others THEN
    v_unavailable := v_unavailable || 'applications';
  END;

  BEGIN
    v_complaints := COALESCE(public.complaints_dashboard_counts('{}'::jsonb), '{}'::jsonb);
    v_open_complaints := COALESCE((v_complaints->>'open')::int, 0);
  EXCEPTION WHEN others THEN
    v_unavailable := v_unavailable || 'complaints';
  END;

  BEGIN
    v_returns := COALESCE(public.returns_supervisory_summary(_sector_id), '{}'::jsonb);
  EXCEPTION WHEN others THEN
    v_unavailable := v_unavailable || 'returns';
  END;

  BEGIN
    SELECT count(*), count(*) FILTER (WHERE acknowledged_at IS NULL)
      INTO v_breach_total, v_breach_open
      FROM public.v_prudential_current_breaches;
    SELECT COALESCE(jsonb_object_agg(rl, n), '{}'::jsonb) INTO v_breach_by_risk
      FROM (
        SELECT COALESCE(risk_level, 'unclassified') AS rl, count(*) AS n
          FROM public.v_prudential_current_breaches GROUP BY 1
      ) s;
  EXCEPTION WHEN others THEN
    v_unavailable := v_unavailable || 'breaches';
  END;

  BEGIN
    SELECT count(*), count(*) FILTER (WHERE status = 'active')
      INTO v_lic_total, v_lic_active FROM public.licenses;
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'licences';
  END;

  BEGIN
    SELECT count(*) FILTER (WHERE status IN ('open','investigating','notice_issued','decision_pending')),
           COALESCE(sum(penalty_amount), 0), COALESCE(sum(penalty_paid_amount), 0)
      INTO v_enf_open, v_penalty, v_penalty_paid FROM public.enforcement_actions;
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'enforcement';
  END;

  BEGIN
    SELECT count(*) INTO v_insp_upcoming FROM public.inspections
     WHERE status = 'scheduled' AND scheduled_date >= current_date;
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'inspections';
  END;

  BEGIN
    SELECT count(*) INTO v_fp_active FROM public.fp_individuals WHERE status = 'active';
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'fit_and_proper';
  END;

  BEGIN
    SELECT count(*) FILTER (WHERE band = 'critical'), count(*) FILTER (WHERE band = 'high')
      INTO v_risk_critical, v_risk_high
      FROM public.entity_risk_scores WHERE is_current;
    SELECT COALESCE(jsonb_object_agg(band, n), '{}'::jsonb) INTO v_band_counts
      FROM (
        SELECT COALESCE(band, 'unrated') AS band, count(*) AS n
          FROM public.entity_risk_scores WHERE is_current GROUP BY 1
      ) s;
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'risk_ratings';
  END;

  BEGIN
    SELECT count(*) INTO v_pru_actions FROM public.prudential_actions
     WHERE COALESCE(status, 'open') NOT IN ('closed','completed','cancelled','withdrawn','resolved','satisfied');
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'prudential_actions';
  END;
  BEGIN
    SELECT count(*) INTO v_pru_esc FROM public.prudential_escalations
     WHERE COALESCE(status, 'open') NOT IN ('closed','resolved','cancelled','withdrawn');
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'prudential_escalations';
  END;

  BEGIN
    SELECT count(*) INTO v_conduct_open FROM public.conduct_alerts WHERE status = 'open';
  EXCEPTION WHEN others THEN v_unavailable := v_unavailable || 'conduct';
  END;

  v_kpis := jsonb_build_object(
    'open_applications', v_open_apps,
    'total_applications', v_apps_total,
    'active_licences', v_lic_active,
    'issued_licences', v_lic_total,
    'open_breaches', v_breach_open,
    'current_breaches', v_breach_total,
    'open_enforcement', v_enf_open,
    'penalty_total', v_penalty,
    'penalty_collected', v_penalty_paid,
    'penalty_outstanding', v_penalty - v_penalty_paid,
    'upcoming_inspections', v_insp_upcoming,
    'open_complaints', v_open_complaints,
    'fp_active', v_fp_active,
    'critical_risk_entities', v_risk_critical,
    'high_risk_entities', v_risk_high,
    'open_prudential_actions', v_pru_actions,
    'open_prudential_escalations', v_pru_esc,
    'open_conduct_alerts', v_conduct_open,
    'return_filings', COALESCE((v_returns->>'total')::int, 0),
    'returns_pending_review', COALESCE((v_returns->>'pending_review')::int, 0),
    'returns_overdue', COALESCE((v_returns->>'overdue')::int, 0)
  );

  v_charts := jsonb_build_object(
    'risk_bands', v_band_counts,
    'application_pipeline', v_app_stage,
    'breaches_by_risk_level', v_breach_by_risk,
    'application_sla', jsonb_build_object(
      'breached', COALESCE((v_apps->>'breached')::int, 0),
      'due_soon', COALESCE((v_apps->>'due_soon')::int, 0),
      'unassigned', COALESCE((v_apps->>'unassigned')::int, 0)
    ),
    'returns', jsonb_build_object(
      'pending_review', COALESCE((v_returns->>'pending_review')::int, 0),
      'overdue', COALESCE((v_returns->>'overdue')::int, 0),
      'accepted', COALESCE((v_returns->>'accepted')::int, 0),
      'sla_breached', COALESCE((v_returns->>'sla_breached')::int, 0)
    )
  );

  RETURN jsonb_build_object(
    'snapshot_version', 'exec-snapshot/1',
    'as_of', v_as_of,
    'generated_for', auth.uid(),
    'regulator_id', v_regulator,
    'scope', jsonb_build_object(
      'sector_id', _sector_id,
      'portfolio', CASE WHEN _sector_id IS NULL THEN 'all permitted' ELSE 'single sector' END
    ),
    'filters', jsonb_build_object('sector_id', _sector_id, 'window_days', v_window),
    'window', jsonb_build_object('days', v_window, 'since', v_since, 'until', v_as_of),
    'kpis', v_kpis,
    'charts', v_charts,
    'unavailable_sources', to_jsonb(v_unavailable),
    'sources', jsonb_build_object(
      'open_applications', 'public.application_work_queue_counts',
      'open_complaints', 'public.complaints_dashboard_counts',
      'breaches', 'public.v_prudential_current_breaches',
      'returns', 'public.returns_supervisory_summary',
      'risk_ratings', 'public.entity_risk_scores (is_current)',
      'licences', 'public.licenses',
      'enforcement', 'public.enforcement_actions',
      'inspections', 'public.inspections',
      'fit_and_proper', 'public.fp_individuals',
      'prudential', 'public.prudential_actions / public.prudential_escalations',
      'conduct', 'public.conduct_alerts'
    ),
    'fingerprint', md5(v_kpis::text || v_charts::text || COALESCE(_sector_id::text, 'all') || v_window::text)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.executive_dashboard_snapshot(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executive_dashboard_snapshot(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executive_dashboard_snapshot(uuid, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.executive_dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  sector_id uuid,
  window_days integer NOT NULL,
  as_of timestamptz NOT NULL,
  regulator_id uuid,
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_snapshots_scope
  ON public.executive_dashboard_snapshots (captured_by, sector_id, window_days, as_of DESC);

GRANT SELECT ON public.executive_dashboard_snapshots TO authenticated;
GRANT ALL ON public.executive_dashboard_snapshots TO service_role;

ALTER TABLE public.executive_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exec snapshots readable by own capture or dashboard viewers"
  ON public.executive_dashboard_snapshots;
CREATE POLICY "exec snapshots readable by own capture or dashboard viewers"
  ON public.executive_dashboard_snapshots FOR SELECT TO authenticated
  USING (captured_by = auth.uid() OR public.has_permission(auth.uid(), 'admin_dashboard', 'view'));

CREATE OR REPLACE FUNCTION public.executive_dashboard_snapshot_capture(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_prev jsonb;
  v_prev_as_of timestamptz;
  v_uid uuid := auth.uid();
  v_win integer := GREATEST(COALESCE(_window_days, 30), 1);
BEGIN
  v_snapshot := public.executive_dashboard_snapshot(_sector_id, _window_days);

  SELECT s.snapshot, s.as_of INTO v_prev, v_prev_as_of
    FROM public.executive_dashboard_snapshots s
   WHERE s.captured_by = v_uid
     AND s.sector_id IS NOT DISTINCT FROM _sector_id
     AND s.window_days = v_win
     AND s.fingerprint <> (v_snapshot->>'fingerprint')
   ORDER BY s.as_of DESC
   LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.executive_dashboard_snapshots s
     WHERE s.captured_by = v_uid
       AND s.fingerprint = (v_snapshot->>'fingerprint')
       AND s.sector_id IS NOT DISTINCT FROM _sector_id
       AND s.window_days = v_win
  ) THEN
    INSERT INTO public.executive_dashboard_snapshots
      (fingerprint, sector_id, window_days, as_of, regulator_id, captured_by, snapshot)
    VALUES (
      v_snapshot->>'fingerprint', _sector_id, v_win,
      (v_snapshot->>'as_of')::timestamptz,
      NULLIF(v_snapshot->>'regulator_id', '')::uuid, v_uid, v_snapshot
    );
  END IF;

  RETURN jsonb_build_object(
    'snapshot', v_snapshot,
    'comparison_available', v_prev IS NOT NULL,
    'comparison', CASE WHEN v_prev IS NULL THEN NULL ELSE jsonb_build_object(
        'as_of', v_prev_as_of,
        'fingerprint', v_prev->>'fingerprint',
        'kpis', v_prev->'kpis'
      ) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.executive_dashboard_snapshot_capture(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executive_dashboard_snapshot_capture(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executive_dashboard_snapshot_capture(uuid, integer) TO service_role;

ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS human_payload jsonb,
  ADD COLUMN IF NOT EXISTS review_rationale text,
  ADD COLUMN IF NOT EXISTS reviewed_snapshot_fingerprint text,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

COMMENT ON COLUMN public.ai_insights.human_payload IS
  'Human-edited wording adopted by a reviewer. The original model output stays in payload and is never overwritten.';

CREATE OR REPLACE FUNCTION public.ai_insight_executive_review(
  _insight_id uuid,
  _decision text,
  _human_payload jsonb DEFAULT NULL,
  _rationale text DEFAULT NULL,
  _snapshot_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.ai_insights;
BEGIN
  PERFORM public.enforce_permission('ai_management', 'approve');

  IF _decision NOT IN ('accepted', 'modified_accepted', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review decision: %', _decision USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.ai_insights WHERE id = _insight_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advisory analysis not found' USING ERRCODE = 'P0002';
  END IF;

  IF _decision = 'modified_accepted' THEN
    IF _human_payload IS NULL THEN
      RAISE EXCEPTION 'Modified wording is required to accept with changes' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(length(btrim(_rationale)), 0) < 10 THEN
      RAISE EXCEPTION 'A rationale is required when the wording materially changes' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.ai_insights SET
    review_status = _decision,
    reviewer_id = v_uid,
    reviewed_at = now(),
    review_rationale = NULLIF(btrim(COALESCE(_rationale, '')), ''),
    reviewed_snapshot_fingerprint = COALESCE(_snapshot_fingerprint, v_row.input_fingerprint),
    human_payload = CASE WHEN _decision = 'modified_accepted' THEN _human_payload ELSE v_row.human_payload END,
    updated_at = now()
  WHERE id = _insight_id;

  INSERT INTO public.ai_insight_actions (insight_id, action, justification, actor_id)
  VALUES (_insight_id, _decision, NULLIF(btrim(COALESCE(_rationale, '')), ''), v_uid);

  RETURN jsonb_build_object(
    'id', _insight_id,
    'review_status', _decision,
    'reviewer_id', v_uid,
    'reviewed_at', now(),
    'reviewed_snapshot_fingerprint', COALESCE(_snapshot_fingerprint, v_row.input_fingerprint)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_insight_executive_review(uuid, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_insight_executive_review(uuid, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_insight_executive_review(uuid, text, jsonb, text, text) TO service_role;