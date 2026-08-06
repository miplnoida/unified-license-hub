-- =============================================================
-- MCS-MON-002 Supervision Loop Dashboard
-- =============================================================

CREATE TABLE public.conduct_supervision_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_ref_type text,
  event_ref_id uuid,
  label text NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_csa_licensee_date ON public.conduct_supervision_annotations(licensee_id, event_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_supervision_annotations TO authenticated;
GRANT ALL ON public.conduct_supervision_annotations TO service_role;

ALTER TABLE public.conduct_supervision_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csa internal read" ON public.conduct_supervision_annotations
  FOR SELECT TO authenticated USING (public.can_view_conduct_intelligence());

CREATE POLICY "csa manage" ON public.conduct_supervision_annotations
  FOR ALL TO authenticated
  USING (public.can_manage_conduct_intelligence())
  WITH CHECK (public.can_manage_conduct_intelligence());

CREATE TRIGGER trg_csa_updated_at
  BEFORE UPDATE ON public.conduct_supervision_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------
-- Summary: funnel + severity mix + intervention effectiveness
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_supervision_loop_summary(
  _entity_id uuid DEFAULT NULL,
  _from date DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  _to date DEFAULT CURRENT_DATE,
  _sector_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v jsonb;
  ents uuid[];
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to view conduct supervision data';
  END IF;

  SELECT array_agg(l.id) INTO ents
  FROM public.licensees l
  WHERE (_entity_id IS NULL OR l.id = _entity_id)
    AND (_sector_id IS NULL OR l.sector_id = _sector_id);

  ents := COALESCE(ents, ARRAY[]::uuid[]);

  WITH c AS (
    SELECT * FROM public.complaints
    WHERE licensee_id = ANY(ents)
      AND created_at::date BETWEEN _from AND _to
  ), inv AS (
    SELECT * FROM public.conduct_investigations
    WHERE licensee_id = ANY(ents)
      AND created_at::date BETWEEN _from AND _to
  ), enf AS (
    SELECT * FROM public.enforcement_actions
    WHERE entity_id = ANY(ents)
      AND date_opened::date BETWEEN _from AND _to
  ), mon AS (
    SELECT * FROM public.conduct_post_closure_monitoring
    WHERE licensee_id = ANY(ents)
  ), rec AS (
    SELECT DISTINCT m.id
    FROM public.conduct_post_closure_monitoring m
    JOIN public.conduct_monitoring_results r
      ON r.entity_id = m.licensee_id AND r.matched
     AND r.evaluated_at >= COALESCE(m.start_date, m.created_at::date)
    WHERE m.licensee_id = ANY(ents)
  ), t2e AS (
    SELECT e.id,
           (SELECT MIN(x.created_at) FROM public.complaints x
             WHERE x.licensee_id = e.entity_id AND x.created_at <= e.date_opened) AS first_complaint,
           e.date_opened, e.resolution_date, e.closed_at, e.status, e.entity_id
    FROM enf e
  ), prepost AS (
    SELECT e.entity_id, e.date_opened,
      (SELECT COUNT(*) FROM public.complaints x
        WHERE x.licensee_id = e.entity_id
          AND x.created_at >= e.date_opened - INTERVAL '180 days'
          AND x.created_at < e.date_opened) AS pre_ct,
      (SELECT COUNT(*) FROM public.complaints x
        WHERE x.licensee_id = e.entity_id
          AND x.created_at > e.date_opened
          AND x.created_at <= e.date_opened + INTERVAL '180 days') AS post_ct
    FROM enf e
  )
  SELECT jsonb_build_object(
    'entity_count', cardinality(ents),
    'funnel', jsonb_build_object(
      'complaints_received', (SELECT COUNT(*) FROM c),
      'classified', (SELECT COUNT(*) FROM c WHERE conduct_risk_category_id IS NOT NULL OR complaint_type_id IS NOT NULL),
      'investigated', (SELECT COUNT(*) FROM inv),
      'enforcement', (SELECT COUNT(*) FROM enf),
      'compliance', (SELECT COUNT(*) FROM enf WHERE resolution_date IS NOT NULL OR closed_at IS NOT NULL OR status IN ('closed','resolved','complied','completed')),
      'closed', (SELECT COUNT(*) FROM c WHERE closed_at IS NOT NULL OR resolved_at IS NOT NULL OR status IN ('closed','resolved')),
      'monitoring', (SELECT COUNT(*) FROM mon),
      'recurrences', (SELECT COUNT(*) FROM rec)
    ),
    'severity_mix', COALESCE((
      SELECT jsonb_object_agg(COALESCE(severity,'unspecified'), n)
      FROM (SELECT severity, COUNT(*) n FROM c GROUP BY severity) s
    ), '{}'::jsonb),
    'effectiveness', jsonb_build_object(
      'time_to_enforcement_avg_days', (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (date_opened - first_complaint))/86400)::numeric,1) FROM t2e WHERE first_complaint IS NOT NULL),
      'time_to_enforcement_min_days', (SELECT ROUND(MIN(EXTRACT(EPOCH FROM (date_opened - first_complaint))/86400)::numeric,1) FROM t2e WHERE first_complaint IS NOT NULL),
      'time_to_enforcement_max_days', (SELECT ROUND(MAX(EXTRACT(EPOCH FROM (date_opened - first_complaint))/86400)::numeric,1) FROM t2e WHERE first_complaint IS NOT NULL),
      'time_to_compliance_avg_days', (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolution_date::timestamptz, closed_at) - date_opened))/86400)::numeric,1) FROM t2e WHERE COALESCE(resolution_date::timestamptz, closed_at) IS NOT NULL),
      'interventions', (SELECT COUNT(*) FROM prepost),
      'pre_intervention_avg', (SELECT ROUND(AVG(pre_ct)::numeric,2) FROM prepost),
      'post_intervention_avg', (SELECT ROUND(AVG(post_ct)::numeric,2) FROM prepost),
      'improved_interventions', (SELECT COUNT(*) FROM prepost WHERE post_ct < pre_ct),
      'recurrence_rate', CASE WHEN (SELECT COUNT(*) FROM mon) > 0
        THEN ROUND(((SELECT COUNT(*) FROM rec)::numeric / (SELECT COUNT(*) FROM mon)) * 100, 1) ELSE 0 END
    ),
    'period', jsonb_build_object('from', _from, 'to', _to)
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.conduct_supervision_loop_summary(uuid,date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_loop_summary(uuid,date,date,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- Stage drill-down
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_supervision_loop_cases(
  _stage text,
  _entity_id uuid DEFAULT NULL,
  _from date DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  _to date DEFAULT CURRENT_DATE,
  _sector_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ents uuid[];
  out_rows jsonb;
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to view conduct supervision data';
  END IF;

  SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) INTO ents
  FROM public.licensees l
  WHERE (_entity_id IS NULL OR l.id = _entity_id)
    AND (_sector_id IS NULL OR l.sector_id = _sector_id);

  IF _stage IN ('complaints_received','classified','closed') THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'occurred_at' DESC), '[]'::jsonb) INTO out_rows
    FROM (
      SELECT jsonb_build_object(
        'id', c.id, 'ref', c.complaint_number, 'title', c.subject,
        'status', c.status, 'severity', c.severity,
        'entity', l.name, 'occurred_at', c.created_at, 'kind', 'complaint',
        'href', '/complaints/' || c.id
      ) x
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
      WHERE c.licensee_id = ANY(ents)
        AND c.created_at::date BETWEEN _from AND _to
        AND (
          _stage = 'complaints_received'
          OR (_stage = 'classified' AND (c.conduct_risk_category_id IS NOT NULL OR c.complaint_type_id IS NOT NULL))
          OR (_stage = 'closed' AND (c.closed_at IS NOT NULL OR c.resolved_at IS NOT NULL OR c.status IN ('closed','resolved')))
        )
      LIMIT 300
    ) s;
  ELSIF _stage = 'investigated' THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'occurred_at' DESC), '[]'::jsonb) INTO out_rows
    FROM (
      SELECT jsonb_build_object(
        'id', i.id, 'ref', i.code, 'title', i.allegation,
        'status', i.status, 'severity', i.severity,
        'entity', l.name, 'occurred_at', i.created_at, 'kind', 'investigation',
        'href', '/conduct/investigations/' || i.id
      ) x
      FROM public.conduct_investigations i
      LEFT JOIN public.licensees l ON l.id = i.licensee_id
      WHERE i.licensee_id = ANY(ents) AND i.created_at::date BETWEEN _from AND _to
      LIMIT 300
    ) s;
  ELSIF _stage IN ('enforcement','compliance') THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'occurred_at' DESC), '[]'::jsonb) INTO out_rows
    FROM (
      SELECT jsonb_build_object(
        'id', e.id, 'ref', e.case_number, 'title', COALESCE(e.enforcement_type, 'Enforcement action'),
        'status', e.status, 'severity', NULL,
        'entity', l.name, 'occurred_at', e.date_opened, 'kind', 'enforcement',
        'href', '/enforcement/' || e.id
      ) x
      FROM public.enforcement_actions e
      LEFT JOIN public.licensees l ON l.id = e.entity_id
      WHERE e.entity_id = ANY(ents) AND e.date_opened::date BETWEEN _from AND _to
        AND (_stage = 'enforcement' OR e.resolution_date IS NOT NULL OR e.closed_at IS NOT NULL
             OR e.status IN ('closed','resolved','complied','completed'))
      LIMIT 300
    ) s;
  ELSIF _stage IN ('monitoring','recurrences') THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'occurred_at' DESC), '[]'::jsonb) INTO out_rows
    FROM (
      SELECT jsonb_build_object(
        'id', m.id, 'ref', 'MON-' || LEFT(m.id::text, 8), 'title', COALESCE(m.entity_reporting_requirement, 'Post-closure monitoring'),
        'status', m.status, 'severity', NULL,
        'entity', l.name, 'occurred_at', COALESCE(m.start_date::timestamptz, m.created_at), 'kind', 'monitoring',
        'href', '/conduct/investigations/' || m.investigation_id
      ) x
      FROM public.conduct_post_closure_monitoring m
      LEFT JOIN public.licensees l ON l.id = m.licensee_id
      WHERE m.licensee_id = ANY(ents)
        AND (_stage = 'monitoring' OR EXISTS (
          SELECT 1 FROM public.conduct_monitoring_results r
          WHERE r.entity_id = m.licensee_id AND r.matched
            AND r.evaluated_at >= COALESCE(m.start_date, m.created_at::date)
        ))
      LIMIT 300
    ) s;
  ELSE
    out_rows := '[]'::jsonb;
  END IF;

  RETURN out_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.conduct_supervision_loop_cases(text,uuid,date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_loop_cases(text,uuid,date,date,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- Timeline
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_supervision_timeline(
  _entity_id uuid,
  _from date DEFAULT (CURRENT_DATE - INTERVAL '24 months')::date,
  _to date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to view conduct supervision data';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'occurred_at'), '[]'::jsonb) INTO res
  FROM (
    SELECT jsonb_build_object('kind','complaint','id',c.id,'ref',c.complaint_number,'label',c.subject,
      'severity',c.severity,'status',c.status,'occurred_at',c.created_at,'ended_at',COALESCE(c.closed_at,c.resolved_at),
      'href','/complaints/'||c.id) x
    FROM public.complaints c
    WHERE c.licensee_id = _entity_id AND c.created_at::date BETWEEN _from AND _to
    UNION ALL
    SELECT jsonb_build_object('kind','investigation','id',i.id,'ref',i.code,'label',i.allegation,
      'severity',i.severity,'status',i.status,'occurred_at',i.created_at,'ended_at',i.closed_at,
      'href','/conduct/investigations/'||i.id)
    FROM public.conduct_investigations i
    WHERE i.licensee_id = _entity_id AND i.created_at::date BETWEEN _from AND _to
    UNION ALL
    SELECT jsonb_build_object('kind','enforcement','id',e.id,'ref',e.case_number,'label',COALESCE(e.enforcement_type,'Enforcement action'),
      'severity',NULL,'status',e.status,'occurred_at',e.date_opened,'ended_at',COALESCE(e.resolution_date::timestamptz,e.closed_at),
      'href','/enforcement/'||e.id)
    FROM public.enforcement_actions e
    WHERE e.entity_id = _entity_id AND e.date_opened::date BETWEEN _from AND _to
    UNION ALL
    SELECT jsonb_build_object('kind','monitoring','id',r.id,'ref',COALESCE(mr.name,'Monitoring rule'),'label',
      COALESCE(mr.name,'Monitoring rule') || ' triggered','severity',NULL,'status',
      CASE WHEN r.matched THEN 'triggered' ELSE 'clear' END,'occurred_at',r.evaluated_at,'ended_at',NULL,
      'href','/conduct/entities/'||_entity_id)
    FROM public.conduct_monitoring_results r
    LEFT JOIN public.conduct_monitoring_rules mr ON mr.id = r.rule_id
    WHERE r.entity_id = _entity_id AND r.matched AND r.evaluated_at::date BETWEEN _from AND _to
    UNION ALL
    SELECT jsonb_build_object('kind','annotation','id',a.id,'ref','Note','label',a.label,'severity',NULL,
      'status',NULL,'occurred_at',a.event_date::timestamptz,'ended_at',NULL,'note',a.note,'href',NULL)
    FROM public.conduct_supervision_annotations a
    WHERE a.licensee_id = _entity_id AND a.event_date BETWEEN _from AND _to
  ) s;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.conduct_supervision_timeline(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_timeline(uuid,date,date) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- Unresolved risks
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_supervision_unresolved_risks(
  _entity_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ents uuid[]; res jsonb;
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to view conduct supervision data';
  END IF;

  SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) INTO ents
  FROM public.licensees l
  WHERE (_entity_id IS NULL OR l.id = _entity_id)
    AND (_sector_id IS NULL OR l.sector_id = _sector_id);

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'severity', x->>'entity'), '[]'::jsonb) INTO res
  FROM (
    -- repeated monitoring triggers without an escalation / open action
    SELECT jsonb_build_object(
      'reason_code','repeat_monitoring_no_escalation',
      'reason','Monitoring rules triggered ' || COUNT(*) || ' times in 180 days with no open supervisory action',
      'severity','high','entity', l.name, 'entity_id', l.id,
      'target_href','/conduct/entities/'||l.id, 'occurred_at', MAX(r.evaluated_at)
    ) x
    FROM public.conduct_monitoring_results r
    JOIN public.licensees l ON l.id = r.entity_id
    WHERE r.entity_id = ANY(ents) AND r.matched
      AND r.evaluated_at >= now() - INTERVAL '180 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.conduct_actions a
        WHERE a.entity_id = l.id AND a.closed_at IS NULL
          AND a.created_at >= now() - INTERVAL '180 days'
      )
    GROUP BY l.id, l.name
    HAVING COUNT(*) >= 2

    UNION ALL
    -- enforcement compliance overdue
    SELECT jsonb_build_object(
      'reason_code','enforcement_compliance_overdue',
      'reason','Enforcement action ' || COALESCE(e.case_number,'') || ' opened ' ||
               (CURRENT_DATE - e.date_opened::date) || ' days ago without recorded compliance',
      'severity','critical','entity', l.name, 'entity_id', l.id,
      'target_href','/enforcement/'||e.id, 'occurred_at', e.date_opened
    )
    FROM public.enforcement_actions e
    JOIN public.licensees l ON l.id = e.entity_id
    WHERE e.entity_id = ANY(ents)
      AND e.resolution_date IS NULL AND e.closed_at IS NULL
      AND COALESCE(e.status,'') NOT IN ('closed','resolved','complied','completed','withdrawn')
      AND e.date_opened::date < CURRENT_DATE - 90

    UNION ALL
    -- open investigation past due date
    SELECT jsonb_build_object(
      'reason_code','investigation_overdue',
      'reason','Investigation ' || COALESCE(i.code,'') || ' is open and past its due date',
      'severity','high','entity', l.name, 'entity_id', l.id,
      'target_href','/conduct/investigations/'||i.id, 'occurred_at', i.created_at
    )
    FROM public.conduct_investigations i
    JOIN public.licensees l ON l.id = i.licensee_id
    WHERE i.licensee_id = ANY(ents)
      AND i.closed_at IS NULL AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE

    UNION ALL
    -- risk band deteriorated with no supervisory action since
    SELECT jsonb_build_object(
      'reason_code','risk_band_rise_no_action',
      'reason','Conduct risk band is ' || COALESCE(s.band,'unknown') || ' with no supervisory action recorded since scoring',
      'severity','medium','entity', l.name, 'entity_id', l.id,
      'target_href','/conduct/entities/'||l.id, 'occurred_at', s.computed_at
    )
    FROM public.entity_risk_scores s
    JOIN public.licensees l ON l.id = s.entity_id
    WHERE s.entity_id = ANY(ents) AND s.is_current
      AND LOWER(COALESCE(s.band,'')) IN ('high','critical','severe')
      AND NOT EXISTS (
        SELECT 1 FROM public.conduct_actions a
        WHERE a.entity_id = l.id AND a.created_at >= s.computed_at
      )
  ) q;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.conduct_supervision_unresolved_risks(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_unresolved_risks(uuid,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- Regulatory learning feed
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_supervision_learning(_limit int DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised to view conduct supervision data';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'occurred_at' DESC), '[]'::jsonb) INTO res
  FROM (
    SELECT jsonb_build_object('source','thematic_review','id',t.id,'ref',t.code,'title',t.title,
      'learning',t.regulatory_learning,'occurred_at',COALESCE(t.closed_at, t.updated_at),
      'href','/supervision/thematic-reviews/'||t.id) x
    FROM public.thematic_reviews t
    WHERE t.regulatory_learning IS NOT NULL AND length(trim(t.regulatory_learning)) > 0
    ORDER BY COALESCE(t.closed_at, t.updated_at) DESC
    LIMIT _limit
  ) a
  FULL OUTER JOIN LATERAL (SELECT 1) z ON TRUE;

  SELECT COALESCE(res, '[]'::jsonb) || COALESCE((
    SELECT jsonb_agg(y ORDER BY y->>'occurred_at' DESC) FROM (
      SELECT jsonb_build_object('source','investigation','id',cc.investigation_id,'ref',i.code,
        'title',COALESCE(i.allegation,'Investigation closure'),'learning',cc.regulatory_learning,
        'occurred_at',COALESCE(cc.approved_at, cc.updated_at),
        'href','/conduct/investigations/'||cc.investigation_id) y
      FROM public.conduct_investigation_closures cc
      JOIN public.conduct_investigations i ON i.id = cc.investigation_id
      WHERE cc.regulatory_learning IS NOT NULL AND length(trim(cc.regulatory_learning)) > 0
        AND cc.status = 'approved'
      ORDER BY COALESCE(cc.approved_at, cc.updated_at) DESC
      LIMIT _limit
    ) b
  ), '[]'::jsonb) INTO res;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.conduct_supervision_learning(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_learning(int) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- Audit logging helpers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_supervision_log_view(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  PERFORM public.log_self_audit('SUPERVISION_LOOP_DASHBOARD_VIEWED','conduct_supervision_loop',
    COALESCE(_scope->>'entity_id','all'), NULL::jsonb, NULL::jsonb, _scope);
END;
$$;

CREATE OR REPLACE FUNCTION public.conduct_supervision_log_export(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_conduct_intelligence() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  PERFORM public.log_compliance_audit('EXPORT'::compliance_audit_action,'conduct_supervision_loop',
    COALESCE(_scope->>'entity_id','all'), NULL::jsonb, NULL::jsonb,
    'Supervision loop conduct report exported', NULL, NULL, _scope);
  PERFORM public.log_self_audit('SUPERVISION_LOOP_REPORT_EXPORTED','conduct_supervision_loop',
    COALESCE(_scope->>'entity_id','all'), NULL::jsonb, NULL::jsonb, _scope);
END;
$$;

REVOKE ALL ON FUNCTION public.conduct_supervision_log_view(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_supervision_log_export(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_log_view(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_supervision_log_export(jsonb) TO authenticated, service_role;
