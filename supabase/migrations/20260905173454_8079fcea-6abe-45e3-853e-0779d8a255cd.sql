CREATE OR REPLACE FUNCTION public.supervisory_monitoring_register(
  _domain text DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _risk text DEFAULT NULL,
  _attention_state text DEFAULT NULL,
  _reassessment_state text DEFAULT NULL,
  _returns_state text DEFAULT NULL,
  _engagement_type text DEFAULT NULL,
  _open_finding boolean DEFAULT NULL,
  _overdue_remediation boolean DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _team_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _sort_key text DEFAULT 'entity',
  _sort_direction text DEFAULT 'asc',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _uid   uuid := public.sup_read_guard();
  _doms  text[];
  _sk    text := lower(COALESCE(_sort_key, 'entity'));
  _dir   text := CASE WHEN lower(COALESCE(_sort_direction,'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  _size  integer := CASE WHEN COALESCE(_page_size,25) IN (10,25,50,100) THEN _page_size ELSE 25 END;
  _pg    integer := GREATEST(COALESCE(_page,1), 1);
  _off   integer;
  _rows  jsonb := '[]'::jsonb;
  _sum   jsonb := '{}'::jsonb;
  _total integer := 0;
BEGIN
  IF _sk NOT IN ('entity','risk','last_assessment','due_date','open_findings',
                 'overdue_remediation','as_of') THEN
    _sk := 'entity';
  END IF;
  _off := (_pg - 1) * _size;

  SELECT array_agg(v.d ORDER BY v.ord) INTO _doms
    FROM (VALUES (1,'PRUDENTIAL'),(2,'AML_CFT'),(3,'MARKET_CONDUCT'),
                 (4,'OPERATIONAL_RESILIENCE'),(5,'GOVERNANCE'),(6,'CROSS_DOMAIN')) v(ord, d)
   WHERE public.sup_domain_readable(_uid, v.d)
     AND (_domain IS NULL OR _domain = '' OR upper(_domain) = v.d);

  IF _doms IS NULL THEN
    RETURN jsonb_build_object(
      'generated_at', now(), 'authorised_domains', '[]'::jsonb,
      'total_count', 0, 'page', _pg, 'page_size', _size,
      'sort', jsonb_build_object('key', _sk, 'direction', _dir),
      'summary', jsonb_build_object(), 'rows', '[]'::jsonb,
      'coverage', '[]'::jsonb,
      'sources', jsonb_build_object('authority','public.sup_read_guard / public.sup_domain_readable'));
  END IF;

  WITH ents AS (
    SELECT l.id, l.name, l.status, l.sector_id, l.lead_regulator_id AS regulator_id,
           s.name AS sector_name, s.code AS sector_code,
           r.name AS regulator_name,
           (SELECT lc.license_number FROM public.licenses lc
              WHERE lc.holder_id = l.id
              ORDER BY lc.issued_at DESC NULLS LAST LIMIT 1) AS business_reference,
           l.updated_at
      FROM public.licensees l
      LEFT JOIN public.sectors s ON s.id = l.sector_id
      LEFT JOIN public.regulators r ON r.id = l.lead_regulator_id
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
       AND (_regulator_id IS NULL OR l.lead_regulator_id = _regulator_id)
  ),
  ents_s AS (
    SELECT e.* FROM ents e
     WHERE _search IS NULL OR _search = ''
        OR e.name ILIKE '%' || _search || '%'
        OR COALESCE(e.business_reference,'') ILIKE '%' || _search || '%'
  ),
  pairs AS (
    SELECT e.id AS entity_id, d.domain_code
      FROM ents_s e CROSS JOIN unnest(_doms) AS d(domain_code)
  ),
  asmt AS (
    SELECT DISTINCT ON (a.entity_id, COALESCE(a.domain_code,'CROSS_DOMAIN'))
           a.entity_id, COALESCE(a.domain_code,'CROSS_DOMAIN') AS domain_code,
           a.id, a.reference, a.assessment_type, a.assessment_date,
           a.methodology_id, a.methodology_version, a.residual_rating,
           a.approved_at, a.period_end, a.status, a.is_current
      FROM public.supervisory_assessment a
     WHERE a.entity_id IS NOT NULL
       AND a.approved_at IS NOT NULL
       AND upper(COALESCE(a.status,'')) = 'APPROVED'
     ORDER BY a.entity_id, COALESCE(a.domain_code,'CROSS_DOMAIN'),
              a.is_current DESC NULLS LAST,
              a.approved_at DESC, a.assessment_date DESC NULLS LAST, a.id
  ),
  reas AS (
    SELECT DISTINCT ON (rr.entity_id, COALESCE(rr.domain_code,'CROSS_DOMAIN'))
           rr.entity_id, COALESCE(rr.domain_code,'CROSS_DOMAIN') AS domain_code,
           rr.id, rr.status, rr.due_date, rr.trigger_kind, rr.requested_type,
           rr.owner_id, rr.team_id, rr.created_at
      FROM public.supervisory_reassessment_requirement rr
     WHERE rr.entity_id IS NOT NULL
       AND upper(COALESCE(rr.status,'')) IN ('REQUIRED','IN_PROGRESS')
     ORDER BY rr.entity_id, COALESCE(rr.domain_code,'CROSS_DOMAIN'),
              rr.due_date NULLS LAST, rr.created_at, rr.id
  ),
  sig AS (
    SELECT g.entity_id, COALESCE(g.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) AS signal_count,
           count(*) FILTER (WHERE upper(COALESCE(g.severity,''))
                              IN ('HIGH','CRITICAL','SEVERE','MATERIAL')) AS material_signals,
           max(g.detected_at) AS latest_signal_at,
           (array_agg(g.id ORDER BY
              CASE upper(COALESCE(g.severity,''))
                WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
                WHEN 'MATERIAL' THEN 3 WHEN 'MEDIUM' THEN 4 ELSE 5 END,
              g.detected_at DESC, g.id))[1] AS top_signal_id,
           (array_agg(g.severity ORDER BY
              CASE upper(COALESCE(g.severity,''))
                WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
                WHEN 'MATERIAL' THEN 3 WHEN 'MEDIUM' THEN 4 ELSE 5 END,
              g.detected_at DESC, g.id))[1] AS top_signal_severity
      FROM public.supervisory_signal g
     WHERE g.entity_id IS NOT NULL
     GROUP BY 1, 2
  ),
  att_rows AS (
    SELECT a.entity_id, COALESCE(t.domain_code,'CROSS_DOMAIN') AS domain_code,
           t.id, t.reference, t.status,
           COALESCE(t.confirmed_priority, t.calculated_priority) AS priority,
           t.target_review_date, t.owner_id, t.team_id, t.updated_at,
           CASE upper(COALESCE(t.confirmed_priority, t.calculated_priority,''))
             WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
             WHEN 'LOW' THEN 4 ELSE 5 END AS pri_rank
      FROM public.supervisory_attention t
      CROSS JOIN LATERAL unnest(COALESCE(t.entity_ids, ARRAY[]::uuid[])) AS a(entity_id)
     WHERE t.closed_at IS NULL
  ),
  att AS (
    SELECT entity_id, domain_code, count(*) AS open_attention,
           (array_agg(id ORDER BY pri_rank, id))[1] AS attention_id,
           (array_agg(reference ORDER BY pri_rank, id))[1] AS attention_reference,
           (array_agg(priority ORDER BY pri_rank, id))[1] AS attention_priority,
           (array_agg(status ORDER BY pri_rank, id))[1] AS attention_status,
           max(updated_at) AS attention_updated_at
      FROM att_rows GROUP BY 1, 2
  ),
  exam AS (
    SELECT DISTINCT ON (x.entity_id, COALESCE(x.domain_code,'CROSS_DOMAIN'))
           x.entity_id, COALESCE(x.domain_code,'CROSS_DOMAIN') AS domain_code,
           x.id, x.reference, x.title, x.stage, x.engagement_type, x.updated_at
      FROM public.examinations x
     WHERE x.closed_at IS NULL AND x.entity_id IS NOT NULL
     ORDER BY x.entity_id, COALESCE(x.domain_code,'CROSS_DOMAIN'), x.created_at DESC, x.id
  ),
  plan_rows AS (
    SELECT a.entity_id, COALESCE(p.domain_code,'CROSS_DOMAIN') AS domain_code,
           p.id, p.reference, p.status, p.target_completion, p.activated_at, p.created_at
      FROM public.supervisory_plan p
      CROSS JOIN LATERAL unnest(COALESCE(p.entity_ids, ARRAY[]::uuid[])) AS a(entity_id)
     WHERE p.completed_at IS NULL
  ),
  plans AS (
    SELECT DISTINCT ON (entity_id, domain_code) *
      FROM plan_rows
     ORDER BY entity_id, domain_code, activated_at DESC NULLS LAST, created_at DESC, id
  ),
  intv AS (
    SELECT DISTINCT ON (v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'))
           v.licensee_id AS entity_id, COALESCE(v.domain_code,'CROSS_DOMAIN') AS domain_code,
           v.id, v.reference, v.intervention_type, v.status, v.updated_at
      FROM public.supervisory_intervention v
     WHERE v.completed_at IS NULL AND v.licensee_id IS NOT NULL
     ORDER BY v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'),
              v.activated_at DESC NULLS LAST, v.created_at DESC, v.id
  ),
  fnd AS (
    SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) AS open_findings,
           count(*) FILTER (WHERE upper(COALESCE(f.severity,''))
                              IN ('HIGH','CRITICAL','SEVERE')) AS material_findings,
           (array_agg(f.severity ORDER BY
              CASE upper(COALESCE(f.severity,''))
                WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
                WHEN 'MEDIUM' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END, f.id))[1] AS highest_severity,
           min(COALESCE(f.issued_at, f.created_at)) AS oldest_open_at,
           (array_agg(f.id ORDER BY
              CASE upper(COALESCE(f.severity,''))
                WHEN 'CRITICAL' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'HIGH' THEN 3
                WHEN 'MEDIUM' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END, f.id))[1] AS top_finding_id,
           max(f.updated_at) AS findings_updated_at
      FROM public.supervisory_finding f
     WHERE f.entity_id IS NOT NULL
       AND upper(COALESCE(f.status,'')) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
     GROUP BY 1, 2
  ),
  rem AS (
    SELECT r.entity_id, COALESCE(r.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) FILTER (WHERE r.closed_at IS NULL) AS open_remediation,
           count(*) FILTER (WHERE r.closed_at IS NULL AND r.target_date IS NOT NULL
                              AND r.target_date < current_date
                              AND upper(COALESCE(r.status,'')) NOT IN
                                  ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED')) AS overdue_remediation,
           min(r.target_date) FILTER (WHERE r.closed_at IS NULL) AS earliest_target_date,
           (array_agg(r.id ORDER BY r.target_date NULLS LAST, r.id)
              FILTER (WHERE r.closed_at IS NULL))[1] AS top_remediation_id,
           max(r.updated_at) AS remediation_updated_at
      FROM public.supervisory_remediation_action r
     WHERE r.entity_id IS NOT NULL
     GROUP BY 1, 2
  ),
  work AS (
    SELECT w.entity_id, COALESCE(w.domain_code,'CROSS_DOMAIN') AS domain_code,
           count(*) AS open_work_items,
           (array_agg(jsonb_build_object(
              'work_key', w.work_key, 'work_type', w.work_type,
              'work_type_label', w.work_type_label, 'reference', w.reference,
              'due_date', w.due_date, 'is_overdue', w.is_overdue,
              'owner_id', w.effective_owner_id, 'team_id', w.effective_team_id,
              'route', w.route)
              ORDER BY w.is_overdue DESC, w.due_date NULLS LAST,
                       w.sort_order NULLS LAST, w.work_key))[1] AS next_work_item
      FROM public.supervisory_work_item w
     WHERE w.entity_id IS NOT NULL
     GROUP BY 1, 2
  ),
  ret AS (
    SELECT o.entity_id,
           count(*) FILTER (WHERE p.due_date IS NOT NULL) AS periods_due,
           count(*) FILTER (WHERE f.id IS NOT NULL) AS filed,
           count(*) FILTER (WHERE f.submitted_at IS NOT NULL AND p.due_date IS NOT NULL
                              AND f.submitted_at::date > p.due_date) AS late,
           count(*) FILTER (WHERE f.id IS NULL AND p.due_date IS NOT NULL
                              AND p.due_date < current_date) AS missing,
           count(*) FILTER (WHERE upper(COALESCE(f.status,'')) = 'ACCEPTED') AS accepted,
           max(p.period_end) AS latest_period_end,
           max(p.period_label) FILTER (WHERE p.period_end =
             (SELECT max(p2.period_end) FROM public.reporting_periods p2
               JOIN public.entity_reporting_obligations o2 ON o2.id = p2.entity_reporting_obligation_id
              WHERE o2.entity_id = o.entity_id)) AS latest_period_label,
           max(f.submitted_at) AS latest_submission_at
      FROM public.entity_reporting_obligations o
      JOIN public.reporting_periods p ON p.entity_reporting_obligation_id = o.id
      LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
     GROUP BY o.entity_id
  ),
  base AS (
    SELECT
      e.id AS entity_id, e.name AS entity_name, e.business_reference, e.status AS entity_status,
      e.sector_id, e.sector_name, e.sector_code, e.regulator_id, e.regulator_name,
      e.updated_at AS entity_updated_at,
      pr.domain_code,
      rs.residual_rating, rs.inherent_rating, rs.control_rating,
      rs.effective_from AS risk_effective_from, rs.last_review_date,
      rs.driving_assessment_id, rs.updated_at AS risk_updated_at,
      mv.trend AS risk_trend, mv.previous_rating AS risk_previous_rating,
      dra.approved_at AS risk_driving_approved_at,
      a.id AS assessment_id, a.reference AS assessment_reference,
      a.assessment_type, a.assessment_date, a.methodology_id, a.methodology_version,
      a.approved_at AS assessment_approved_at, a.period_end AS assessment_period_end,
      a.status AS assessment_status,
      rq.id AS reassessment_id, rq.status AS reassessment_status,
      rq.due_date AS reassessment_due_date, rq.trigger_kind AS reassessment_trigger,
      rq.requested_type AS reassessment_type, rq.created_at AS reassessment_created_at,
      g.signal_count, g.material_signals, g.latest_signal_at,
      g.top_signal_id, g.top_signal_severity,
      COALESCE(t.open_attention, 0) AS open_attention,
      t.attention_id, t.attention_reference, t.attention_priority,
      t.attention_status, t.attention_updated_at,
      x.id AS examination_id, x.reference AS examination_reference, x.title AS examination_title,
      x.stage AS examination_stage, x.engagement_type, x.updated_at AS examination_updated_at,
      pl.id AS plan_id, pl.reference AS plan_reference, pl.status AS plan_status,
      iv.id AS intervention_id, iv.reference AS intervention_reference,
      iv.intervention_type, iv.status AS intervention_status,
      COALESCE(fd.open_findings, 0) AS open_findings,
      COALESCE(fd.material_findings, 0) AS material_findings,
      fd.highest_severity, fd.oldest_open_at, fd.top_finding_id, fd.findings_updated_at,
      COALESCE(rm.open_remediation, 0) AS open_remediation,
      COALESCE(rm.overdue_remediation, 0) AS overdue_remediation,
      rm.earliest_target_date, rm.top_remediation_id, rm.remediation_updated_at,
      COALESCE(wk.open_work_items, 0) AS open_work_items,
      wk.next_work_item,
      sa.lead_supervisor_id, sa.lead_supervisor_name AS supervisor_name,
      sa.team_name, sa.team_id, sa.regulatory_function_id, sa.regulatory_function_key,
      sa.assignment_scope, sa.effective_from AS assignment_effective_from,
      rt.periods_due, rt.filed, rt.late, rt.missing, rt.accepted,
      rt.latest_period_end, rt.latest_period_label, rt.latest_submission_at,
      (rt.entity_id IS NOT NULL) AS returns_feed_present
      FROM pairs pr
      JOIN ents_s e ON e.id = pr.entity_id
      LEFT JOIN public.entity_risk_state rs
             ON rs.entity_id = pr.entity_id AND rs.domain_code = pr.domain_code
      LEFT JOIN public.supervisory_assessment dra ON dra.id = rs.driving_assessment_id
      LEFT JOIN LATERAL (
        SELECT m.trend, m.previous_rating
          FROM public.entity_risk_state_movement m
         WHERE m.entity_id = pr.entity_id AND m.domain_code = pr.domain_code
         ORDER BY m.created_at DESC LIMIT 1) mv ON true
      LEFT JOIN asmt a  ON a.entity_id  = pr.entity_id AND a.domain_code  = pr.domain_code
      LEFT JOIN reas rq ON rq.entity_id = pr.entity_id AND rq.domain_code = pr.domain_code
      LEFT JOIN sig  g  ON g.entity_id  = pr.entity_id AND g.domain_code  = pr.domain_code
      LEFT JOIN att  t  ON t.entity_id  = pr.entity_id AND t.domain_code  = pr.domain_code
      LEFT JOIN exam x  ON x.entity_id  = pr.entity_id AND x.domain_code  = pr.domain_code
      LEFT JOIN plans pl ON pl.entity_id = pr.entity_id AND pl.domain_code = pr.domain_code
      LEFT JOIN intv iv ON iv.entity_id = pr.entity_id AND iv.domain_code = pr.domain_code
      LEFT JOIN fnd  fd ON fd.entity_id = pr.entity_id AND fd.domain_code = pr.domain_code
      LEFT JOIN rem  rm ON rm.entity_id = pr.entity_id AND rm.domain_code = pr.domain_code
      LEFT JOIN work wk ON wk.entity_id = pr.entity_id AND wk.domain_code = pr.domain_code
      LEFT JOIN LATERAL public.supervisory_domain_assignment(pr.entity_id, pr.domain_code) sa ON true
      LEFT JOIN ret  rt ON rt.entity_id = pr.entity_id
     WHERE public.supervisory_domain_applicable(pr.entity_id, pr.domain_code)
  ),
  enriched AS (
    SELECT b.*,
      (b.reassessment_id IS NOT NULL) AS reassessment_required,
      (b.reassessment_due_date IS NOT NULL AND b.reassessment_due_date < current_date)
        AS reassessment_overdue,
      CASE WHEN NOT b.returns_feed_present THEN 'NOT_AVAILABLE'
           WHEN COALESCE(b.missing,0) > 0 THEN 'MISSING'
           WHEN COALESCE(b.late,0) > 0 THEN 'LATE'
           ELSE 'CLEAN' END AS returns_state,
      CASE WHEN b.open_attention > 0 THEN 'OPEN' ELSE 'NONE' END AS attention_state,
      COALESCE(b.risk_updated_at, b.entity_updated_at) AS as_of,
      CASE upper(COALESCE(b.residual_rating,''))
        WHEN 'CRITICAL' THEN 6 WHEN 'SEVERE' THEN 5 WHEN 'HIGH' THEN 4
        WHEN 'MEDIUM_HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1
        ELSE NULL END AS risk_rank
      FROM base b
  ),
  filtered AS (
    SELECT * FROM enriched x
     WHERE (_risk IS NULL OR _risk = '' OR upper(COALESCE(x.residual_rating,'')) = upper(_risk))
       AND (_attention_state IS NULL OR _attention_state = ''
            OR x.attention_state = upper(_attention_state))
       AND (_reassessment_state IS NULL OR _reassessment_state = ''
            OR (upper(_reassessment_state) = 'REQUIRED' AND x.reassessment_required)
            OR (upper(_reassessment_state) = 'OVERDUE' AND x.reassessment_overdue)
            OR (upper(_reassessment_state) = 'NONE' AND NOT x.reassessment_required))
       AND (_returns_state IS NULL OR _returns_state = ''
            OR x.returns_state = upper(_returns_state))
       AND (_engagement_type IS NULL OR _engagement_type = ''
            OR upper(COALESCE(x.engagement_type,'')) = upper(_engagement_type))
       AND (_open_finding IS NULL
            OR (_open_finding AND x.open_findings > 0)
            OR (NOT _open_finding AND x.open_findings = 0))
       AND (_overdue_remediation IS NULL
            OR (_overdue_remediation AND x.overdue_remediation > 0)
            OR (NOT _overdue_remediation AND x.overdue_remediation = 0))
       AND (_owner_id IS NULL OR x.lead_supervisor_id = _owner_id)
       AND (_team_id IS NULL OR x.team_id = _team_id)
  ),
  sorted AS (
    SELECT f.*,
      CASE _sk WHEN 'risk' THEN f.risk_rank::numeric
               WHEN 'open_findings' THEN f.open_findings::numeric
               WHEN 'overdue_remediation' THEN f.overdue_remediation::numeric
               ELSE NULL END AS sort_num,
      CASE _sk WHEN 'last_assessment' THEN f.assessment_date::timestamptz
               WHEN 'due_date' THEN f.reassessment_due_date::timestamptz
               WHEN 'as_of' THEN f.as_of
               ELSE NULL END AS sort_ts,
      CASE _sk WHEN 'entity' THEN lower(f.entity_name) ELSE NULL END AS sort_txt
      FROM filtered f
  ),
  paged AS (
    SELECT * FROM sorted
     ORDER BY
       CASE WHEN _dir = 'asc' THEN sort_num END ASC NULLS LAST,
       CASE WHEN _dir = 'desc' THEN sort_num END DESC NULLS LAST,
       CASE WHEN _dir = 'asc' THEN sort_ts END ASC NULLS LAST,
       CASE WHEN _dir = 'desc' THEN sort_ts END DESC NULLS LAST,
       CASE WHEN _dir = 'asc' THEN sort_txt END ASC NULLS LAST,
       CASE WHEN _dir = 'desc' THEN sort_txt END DESC NULLS LAST,
       lower(entity_name), domain_code, entity_id
     LIMIT _size OFFSET _off
  ),
  ent_ret AS (
    SELECT DISTINCT entity_id, returns_feed_present, returns_state,
           COALESCE(late,0) AS late, COALESCE(missing,0) AS missing
      FROM filtered
  )
  SELECT
    (SELECT count(*) FROM filtered),
    jsonb_build_object(
      'rows_in_scope', (SELECT count(*) FROM filtered),
      'entities_in_scope', (SELECT count(DISTINCT entity_id) FROM filtered),
      'reassessment_required', (SELECT count(*) FROM filtered WHERE reassessment_required),
      'reassessment_overdue', (SELECT count(*) FROM filtered WHERE reassessment_overdue),
      'entities_with_late_filings',
        (SELECT count(*) FROM ent_ret WHERE returns_state = 'LATE'),
      'entities_with_missing_filings',
        (SELECT count(*) FROM ent_ret WHERE returns_state = 'MISSING'),
      'entities_with_filing_issues',
        (SELECT count(*) FROM ent_ret WHERE returns_state IN ('LATE','MISSING')),
      'entities_without_returns_feed',
        (SELECT count(*) FROM ent_ret WHERE NOT returns_feed_present),
      'late_filing_periods', (SELECT COALESCE(sum(late),0) FROM ent_ret),
      'missing_filing_periods', (SELECT COALESCE(sum(missing),0) FROM ent_ret),
      'filing_metrics_basis', 'ENTITY_LEVEL_ONLY',
      'open_attention', (SELECT COALESCE(sum(open_attention),0) FROM filtered),
      'material_signals', (SELECT COALESCE(sum(material_signals),0) FROM filtered),
      'active_engagements', (SELECT count(*) FROM filtered WHERE examination_id IS NOT NULL),
      'active_offsite_reviews', (SELECT count(*) FROM filtered
         WHERE upper(COALESCE(engagement_type,'')) = 'OFFSITE_REVIEW'),
      'open_findings', (SELECT COALESCE(sum(open_findings),0) FROM filtered),
      'overdue_remediation', (SELECT COALESCE(sum(overdue_remediation),0) FROM filtered),
      'unassessed', (SELECT count(*) FROM filtered WHERE residual_rating IS NULL)),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'row_key', p.entity_id || ':' || p.domain_code,
        'entity_id', p.entity_id,
        'entity_name', p.entity_name,
        'business_reference', p.business_reference,
        'entity_status', p.entity_status,
        'sector_id', p.sector_id, 'sector_name', p.sector_name, 'sector_code', p.sector_code,
        'regulator_id', p.regulator_id, 'regulator_name', p.regulator_name,
        'domain_code', p.domain_code,
        'risk', CASE WHEN p.residual_rating IS NULL THEN NULL ELSE jsonb_build_object(
            'residual_rating', p.residual_rating,
            'inherent_rating', p.inherent_rating,
            'control_rating', p.control_rating,
            'trend', p.risk_trend,
            'previous_rating', p.risk_previous_rating,
            'effective_from', p.risk_effective_from,
            'last_review_date', p.last_review_date,
            'driving_assessment_id', p.driving_assessment_id,
            'driving_assessment_approved_at', p.risk_driving_approved_at,
            'source_object', 'supervisory_assessment (approved) via entity_risk_state') END,
        'assessment', CASE WHEN p.assessment_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', p.assessment_id, 'reference', p.assessment_reference,
            'assessment_type', p.assessment_type, 'assessment_date', p.assessment_date,
            'methodology_id', p.methodology_id, 'methodology_version', p.methodology_version,
            'approved_at', p.assessment_approved_at, 'period_end', p.assessment_period_end,
            'status', p.assessment_status,
            'selection_basis', 'CURRENT_APPROVED_ONLY',
            'route', '/supervision/assessments/' || p.assessment_id) END,
        'reassessment', CASE WHEN p.reassessment_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', p.reassessment_id, 'status', p.reassessment_status,
            'due_date', p.reassessment_due_date, 'trigger_kind', p.reassessment_trigger,
            'requested_type', p.reassessment_type, 'created_at', p.reassessment_created_at,
            'is_overdue', p.reassessment_overdue,
            'due_basis', CASE WHEN p.reassessment_due_date IS NOT NULL
                              THEN 'CANONICAL_REQUIREMENT_DUE_DATE' ELSE 'NOT_SCHEDULED' END) END,
        'due_position', CASE
            WHEN p.reassessment_due_date IS NOT NULL THEN
              CASE WHEN p.reassessment_overdue THEN 'OVERDUE' ELSE 'DUE' END
            WHEN p.reassessment_id IS NOT NULL THEN 'NOT_SCHEDULED'
            ELSE 'NO_DUE_POLICY' END,
        'returns', CASE WHEN NOT p.returns_feed_present THEN jsonb_build_object(
              'state', 'NOT_AVAILABLE',
              'reason', 'No canonical reporting obligation exists for this entity',
              'domain_linkage', 'NONE',
              'disclosure', 'ENTITY_LEVEL_CONTEXT')
            ELSE jsonb_build_object(
              'state', p.returns_state,
              'periods_due', p.periods_due, 'filed', p.filed, 'late', p.late,
              'missing', p.missing, 'accepted', p.accepted,
              'latest_period_label', p.latest_period_label,
              'latest_period_end', p.latest_period_end,
              'latest_submission_at', p.latest_submission_at,
              'domain_linkage', 'ENTITY_LEVEL_ONLY',
              'disclosure', 'ENTITY_LEVEL_CONTEXT',
              'source_object', 'entity_reporting_obligations / reporting_periods / return_filings') END,
        'signals', CASE WHEN p.signal_count IS NULL THEN NULL ELSE jsonb_build_object(
            'count', p.signal_count, 'material', p.material_signals,
            'latest_detected_at', p.latest_signal_at,
            'top_signal_id', p.top_signal_id, 'top_severity', p.top_signal_severity,
            'source_object', 'supervisory_signal') END,
        'attention', CASE WHEN p.attention_id IS NULL THEN NULL ELSE jsonb_build_object(
            'open_count', p.open_attention, 'id', p.attention_id,
            'reference', p.attention_reference, 'priority', p.attention_priority,
            'status', p.attention_status, 'updated_at', p.attention_updated_at,
            'route', '/supervision/attention/' || p.attention_id,
            'source_object', 'supervisory_attention') END,
        'engagement', CASE WHEN p.examination_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', p.examination_id, 'reference', p.examination_reference,
            'title', p.examination_title, 'stage', p.examination_stage,
            'engagement_type', p.engagement_type, 'updated_at', p.examination_updated_at,
            'route', '/supervision/examinations/' || p.examination_id,
            'source_object', 'examinations') END,
        'plan', CASE WHEN p.plan_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', p.plan_id, 'reference', p.plan_reference, 'status', p.plan_status,
            'route', '/supervision/plans/' || p.plan_id) END,
        'intervention', CASE WHEN p.intervention_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', p.intervention_id, 'reference', p.intervention_reference,
            'intervention_type', p.intervention_type, 'status', p.intervention_status,
            'route', '/supervision/interventions/' || p.intervention_id) END,
        'findings', jsonb_build_object(
            'open', p.open_findings, 'material', p.material_findings,
            'highest_severity', p.highest_severity,
            'oldest_open_at', p.oldest_open_at,
            'oldest_open_age_days', CASE WHEN p.oldest_open_at IS NULL THEN NULL
              ELSE (current_date - p.oldest_open_at::date) END,
            'top_finding_id', p.top_finding_id,
            'source_object', 'supervisory_finding'),
        'remediation', jsonb_build_object(
            'open', p.open_remediation, 'overdue', p.overdue_remediation,
            'earliest_target_date', p.earliest_target_date,
            'top_remediation_id', p.top_remediation_id,
            'source_object', 'supervisory_remediation_action'),
        'work', jsonb_build_object(
            'open_items', p.open_work_items, 'next_item', p.next_work_item,
            'source_object', 'supervisory_work_item'),
        'owner', jsonb_build_object(
            'lead_supervisor_id', p.lead_supervisor_id,
            'lead_supervisor_name', p.supervisor_name,
            'team_id', p.team_id, 'team_name', p.team_name,
            'regulatory_function_id', p.regulatory_function_id,
            'regulatory_function_key', p.regulatory_function_key,
            'assignment_scope', COALESCE(p.assignment_scope, 'NOT_ASSIGNED'),
            'domain_function_key',
              (SELECT rf.key FROM public.regulatory_functions rf
                WHERE rf.id = public.supervisory_domain_regulatory_function(p.domain_code)),
            'precedence_rule',
              'domain-function-scoped assignment, else function-unscoped entity assignment; is_primary, then latest effective_from, then id',
            'assignment_effective_from', p.assignment_effective_from,
            'source_object', 'entity_supervision_assignments via supervisory_domain_assignment'),
        'freshness', jsonb_build_object(
            'risk_effective_at', p.risk_effective_from,
            'risk_updated_at', p.risk_updated_at,
            'assessment_approved_at', p.assessment_approved_at,
            'assessment_period_end', p.assessment_period_end,
            'returns_reporting_period_end', p.latest_period_end,
            'returns_latest_submission_at', p.latest_submission_at,
            'signal_latest_detected_at', p.latest_signal_at,
            'attention_updated_at', p.attention_updated_at,
            'findings_updated_at', p.findings_updated_at,
            'remediation_updated_at', p.remediation_updated_at,
            'engagement_updated_at', p.examination_updated_at,
            'entity_updated_at', p.entity_updated_at),
        'attention_required', (p.open_attention > 0 OR p.reassessment_required
                               OR p.open_work_items > 0),
        'flags', (
          SELECT COALESCE(jsonb_agg(fl.f ORDER BY fl.ord), '[]'::jsonb) FROM (
            SELECT 1 ord, jsonb_build_object('code','REASSESSMENT_REQUIRED',
              'label','Reassessment required','source_object','supervisory_reassessment_requirement',
              'source_id', p.reassessment_id, 'source_date', p.reassessment_created_at,
              'reason','An open reassessment requirement exists ('
                       || COALESCE(p.reassessment_trigger,'trigger not recorded') || ')') f
             WHERE p.reassessment_id IS NOT NULL
            UNION ALL
            SELECT 2, jsonb_build_object('code','ASSESSMENT_OVERDUE',
              'label','Reassessment overdue','source_object','supervisory_reassessment_requirement',
              'source_id', p.reassessment_id, 'source_date', p.reassessment_due_date,
              'reason','Requirement due ' || p.reassessment_due_date || ' has passed')
             WHERE p.reassessment_overdue
            UNION ALL
            SELECT 3, jsonb_build_object('code','LATE_RETURN',
              'label','Late filing (entity level)','source_object','return_filings',
              'source_id', NULL, 'source_date', p.latest_submission_at,
              'reason', p.late || ' reporting period(s) filed after the canonical due date. '
                        || 'Entity-level reporting-obligation context, not a '
                        || p.domain_code || ' domain fact.')
             WHERE p.returns_feed_present AND COALESCE(p.late,0) > 0
            UNION ALL
            SELECT 4, jsonb_build_object('code','MISSING_RETURN',
              'label','Missing filing (entity level)','source_object','reporting_periods',
              'source_id', NULL, 'source_date', p.latest_period_end,
              'reason', p.missing || ' reporting period(s) past due with no filing. '
                        || 'Entity-level reporting-obligation context, not a '
                        || p.domain_code || ' domain fact.')
             WHERE p.returns_feed_present AND COALESCE(p.missing,0) > 0
            UNION ALL
            SELECT 5, jsonb_build_object('code','ACTIVE_SIGNAL',
              'label','Material signal','source_object','supervisory_signal',
              'source_id', p.top_signal_id, 'source_date', p.latest_signal_at,
              'reason','Material supervisory signal recorded ('
                       || COALESCE(p.top_signal_severity,'severity not recorded')
                       || '). A signal does not change risk and does not create attention.')
             WHERE COALESCE(p.material_signals,0) > 0
            UNION ALL
            SELECT 6, jsonb_build_object('code','ATTENTION_OPEN',
              'label','Attention open','source_object','supervisory_attention',
              'source_id', p.attention_id, 'source_date', p.attention_updated_at,
              'reason','Open supervisory attention '
                       || COALESCE(p.attention_reference,'') || ' priority '
                       || COALESCE(p.attention_priority,'not set'))
             WHERE p.attention_id IS NOT NULL
            UNION ALL
            SELECT 7, jsonb_build_object('code','ACTIVE_OFFSITE_REVIEW',
              'label','Offsite review in progress','source_object','examinations',
              'source_id', p.examination_id, 'source_date', p.examination_updated_at,
              'reason','Open examination at stage ' || COALESCE(p.examination_stage,'unknown'))
             WHERE upper(COALESCE(p.engagement_type,'')) = 'OFFSITE_REVIEW'
            UNION ALL
            SELECT 8, jsonb_build_object('code','ACTIVE_ONSITE_EXAMINATION',
              'label','Onsite examination in progress','source_object','examinations',
              'source_id', p.examination_id, 'source_date', p.examination_updated_at,
              'reason','Open examination at stage ' || COALESCE(p.examination_stage,'unknown'))
             WHERE upper(COALESCE(p.engagement_type,'')) IN
                   ('FULL_SCOPE_ONSITE','TARGETED_ONSITE','JOINT_EXAMINATION')
            UNION ALL
            SELECT 9, jsonb_build_object('code','OPEN_MATERIAL_FINDING',
              'label','Open material finding','source_object','supervisory_finding',
              'source_id', p.top_finding_id, 'source_date', p.oldest_open_at,
              'reason', p.material_findings || ' open finding(s) of severity '
                        || COALESCE(p.highest_severity,'not recorded'))
             WHERE COALESCE(p.material_findings,0) > 0
            UNION ALL
            SELECT 10, jsonb_build_object('code','REMEDIATION_OVERDUE',
              'label','Remediation overdue','source_object','supervisory_remediation_action',
              'source_id', p.top_remediation_id, 'source_date', p.earliest_target_date,
              'reason', p.overdue_remediation || ' corrective action(s) past their target date')
             WHERE COALESCE(p.overdue_remediation,0) > 0
            UNION ALL
            SELECT 11, jsonb_build_object('code','DATA_GAP',
              'label','Data gap','source_object','entity_risk_state',
              'source_id', NULL, 'source_date', NULL,
              'reason','No approved risk state exists for this entity and domain')
             WHERE p.residual_rating IS NULL
            UNION ALL
            SELECT 12, jsonb_build_object('code','DATA_GAP',
              'label','Data gap','source_object','entity_reporting_obligations',
              'source_id', NULL, 'source_date', NULL,
              'reason','No canonical reporting obligation feed for this entity')
             WHERE NOT p.returns_feed_present
            UNION ALL
            SELECT 13, jsonb_build_object('code','ASSIGNMENT_NOT_DOMAIN_SCOPED',
              'label','Assignment not domain scoped','source_object','entity_supervision_assignments',
              'source_id', NULL, 'source_date', p.assignment_effective_from,
              'reason','The displayed supervisor comes from an entity assignment that records no regulatory function, so it is not a '
                      || p.domain_code || ' function determination.')
             WHERE p.assignment_scope = 'ENTITY_LEVEL_UNSCOPED') fl),
        'route', '/entities/' || p.entity_id || '/360')
        ORDER BY p.ord)
      FROM (SELECT s.*, row_number() OVER () AS ord FROM paged s) p), '[]'::jsonb)
  INTO _total, _sum, _rows;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'authorised_domains', to_jsonb(_doms),
    'total_count', _total,
    'page', _pg, 'page_size', _size,
    'sort', jsonb_build_object('key', _sk, 'direction', _dir),
    'filters', jsonb_build_object(
      'domain', _domain, 'regulator_id', _regulator_id, 'sector_id', _sector_id,
      'risk', _risk, 'attention_state', _attention_state,
      'reassessment_state', _reassessment_state, 'returns_state', _returns_state,
      'engagement_type', _engagement_type, 'open_finding', _open_finding,
      'overdue_remediation', _overdue_remediation, 'owner_id', _owner_id,
      'team_id', _team_id, 'search', _search),
    'summary', _sum,
    'rows', _rows,
    'coverage', (
      SELECT jsonb_agg(jsonb_build_object(
        'domain_code', d,
        'risk', 'AVAILABLE', 'assessment', 'AVAILABLE',
        'reassessment', 'AVAILABLE',
        'returns', 'PARTIAL_ENTITY_LEVEL_ONLY',
        'signals', 'AVAILABLE', 'attention', 'AVAILABLE',
        'engagement', 'AVAILABLE', 'findings', 'AVAILABLE',
        'remediation', 'AVAILABLE', 'work', 'AVAILABLE',
        'owner', CASE WHEN public.supervisory_domain_regulatory_function(d) IS NOT NULL
                      THEN 'DOMAIN_FUNCTION_SCOPED'
                      ELSE 'ENTITY_LEVEL_UNSCOPED_ONLY' END) ORDER BY d)
      FROM unnest(_doms) AS u(d)),
    'sources', jsonb_build_object(
      'authority', 'public.sup_read_guard / public.sup_domain_readable',
      'applicability', 'public.supervisory_domain_applicable (single canonical helper)',
      'risk', 'public.entity_risk_state + entity_risk_state_movement',
      'assessment', 'public.supervisory_assessment (status APPROVED, current only)',
      'reassessment', 'public.supervisory_reassessment_requirement',
      'returns', 'public.entity_reporting_obligations / reporting_periods / return_filings (entity level only)',
      'signals', 'public.supervisory_signal',
      'attention', 'public.supervisory_attention',
      'engagement', 'public.examinations',
      'findings', 'public.supervisory_finding',
      'remediation', 'public.supervisory_remediation_action',
      'work', 'public.supervisory_work_item',
      'owner', 'public.entity_supervision_assignments via public.supervisory_domain_assignment',
      'domain_function_map', 'public.supervisory_domain_regulatory_function'));
END;
$function$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_register(
  text, uuid, uuid, text, text, text, text, text, boolean, boolean, uuid, uuid,
  text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_register(
  text, uuid, uuid, text, text, text, text, text, boolean, boolean, uuid, uuid,
  text, text, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_monitoring_register_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _uid  uuid := public.sup_read_guard();
  _doms text[];
  _fns  uuid[];
BEGIN
  SELECT array_agg(v.d ORDER BY v.ord) INTO _doms
    FROM (VALUES (1,'PRUDENTIAL'),(2,'AML_CFT'),(3,'MARKET_CONDUCT'),
                 (4,'OPERATIONAL_RESILIENCE'),(5,'GOVERNANCE'),(6,'CROSS_DOMAIN')) v(ord, d)
   WHERE public.sup_domain_readable(_uid, v.d);

  IF _doms IS NULL THEN
    RETURN jsonb_build_object(
      'generated_at', now(),
      'domains', '[]'::jsonb, 'regulators', '[]'::jsonb, 'sectors', '[]'::jsonb,
      'risk_ratings', '[]'::jsonb, 'engagement_types', '[]'::jsonb,
      'attention_states', '[]'::jsonb, 'reassessment_states', '[]'::jsonb,
      'returns_states', '[]'::jsonb, 'sort_keys', '[]'::jsonb, 'teams', '[]'::jsonb);
  END IF;

  SELECT array_agg(z.f) INTO _fns
    FROM (SELECT public.supervisory_domain_regulatory_function(d) AS f
            FROM unnest(_doms) AS u(d)) z
   WHERE z.f IS NOT NULL;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'domains', to_jsonb(_doms),
    'regulators', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
        FROM public.regulators r
       WHERE EXISTS (SELECT 1 FROM public.licensees l WHERE l.lead_regulator_id = r.id)),
      '[]'::jsonb),
    'sectors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code)
             ORDER BY s.name)
        FROM public.sectors s
       WHERE EXISTS (SELECT 1 FROM public.licensees l WHERE l.sector_id = s.id)),
      '[]'::jsonb),
    'risk_ratings', to_jsonb(ARRAY['LOW','MEDIUM','MEDIUM_HIGH','HIGH','SEVERE','CRITICAL']),
    'engagement_types', COALESCE((
      SELECT jsonb_agg(DISTINCT upper(x.engagement_type))
        FROM public.examinations x
       WHERE x.engagement_type IS NOT NULL
         AND COALESCE(x.domain_code,'CROSS_DOMAIN') = ANY (_doms)),
      '[]'::jsonb),
    'attention_states', to_jsonb(ARRAY['OPEN','NONE']),
    'reassessment_states', to_jsonb(ARRAY['REQUIRED','OVERDUE','NONE']),
    'returns_states', to_jsonb(ARRAY['CLEAN','LATE','MISSING','NOT_AVAILABLE']),
    'sort_keys', to_jsonb(ARRAY['entity','risk','last_assessment','due_date',
                                'open_findings','overdue_remediation','as_of']),
    'teams', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', a.team_id, 'name', a.team))
        FROM public.entity_supervision_assignments a
       WHERE a.effective_to IS NULL AND a.team_id IS NOT NULL
         AND (a.regulatory_function_id IS NULL
              OR (_fns IS NOT NULL AND a.regulatory_function_id = ANY (_fns)))),
      '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_register_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_register_options() TO authenticated, service_role;