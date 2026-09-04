-- ============================================================
-- Shared supervisory ordering helpers (presentation-neutral,
-- immutable, no business truth of their own).
-- ============================================================
CREATE OR REPLACE FUNCTION public.sup_risk_ordinal(_v text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(btrim(COALESCE(_v,'')))
    WHEN 'LOW' THEN 1
    WHEN 'MODERATE' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'MEDIUM_HIGH' THEN 4
    WHEN 'MEDIUM-HIGH' THEN 4
    WHEN 'HIGH' THEN 5
    WHEN 'VERY_HIGH' THEN 6
    WHEN 'SEVERE' THEN 7
    WHEN 'CRITICAL' THEN 8
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.sup_assessment_status_ordinal(_v text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(btrim(COALESCE(_v,'')))
    WHEN 'DRAFT' THEN 1
    WHEN 'RETURNED_FOR_REVISION' THEN 2
    WHEN 'SUBMITTED' THEN 3
    WHEN 'REVIEWED' THEN 4
    WHEN 'APPROVED' THEN 5
    WHEN 'SUPERSEDED' THEN 8
    WHEN 'WITHDRAWN' THEN 9
    WHEN 'CANCELLED' THEN 10
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.sup_examination_stage_ordinal(_v text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(btrim(COALESCE(_v,'')))
    WHEN 'PLANNED' THEN 1
    WHEN 'PLANNING' THEN 1
    WHEN 'SCOPING' THEN 2
    WHEN 'PRE_EXAM_REQUEST' THEN 3
    WHEN 'FIELDWORK' THEN 4
    WHEN 'EXIT_MEETING' THEN 5
    WHEN 'DRAFT_REPORT' THEN 6
    WHEN 'MANAGEMENT_RESPONSE' THEN 7
    WHEN 'FINAL_REPORT' THEN 8
    WHEN 'REMEDIATION' THEN 9
    WHEN 'CLOSED' THEN 10
    WHEN 'CANCELLED' THEN 11
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.sup_finding_status_ordinal(_v text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(btrim(COALESCE(_v,'')))
    WHEN 'DRAFT' THEN 1
    WHEN 'ISSUED' THEN 2
    WHEN 'MANAGEMENT_RESPONSE' THEN 3
    WHEN 'REMEDIATION_REQUIRED' THEN 4
    WHEN 'REMEDIATION_IN_PROGRESS' THEN 5
    WHEN 'VALIDATION' THEN 6
    WHEN 'CLOSED' THEN 9
    WHEN 'WITHDRAWN' THEN 10
    WHEN 'SUPERSEDED' THEN 10
    ELSE NULL END;
$$;

-- ============================================================
-- 1. AML/CFT assessment register — real server page
-- ============================================================
CREATE OR REPLACE FUNCTION public.aml_assessment_page(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _sort_key text DEFAULT NULL,
  _sort_direction text DEFAULT NULL,
  _search text DEFAULT NULL,
  _status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _ps int  := CASE WHEN COALESCE(_page_size,25) IN (10,25,50,100) THEN _page_size ELSE 25 END;
  _pg int  := GREATEST(COALESCE(_page,1),1);
  _key text := lower(btrim(COALESCE(_sort_key,'')));
  _dir text := lower(btrim(COALESCE(_sort_direction,'')));
  _q   text := NULLIF(btrim(COALESCE(_search,'')),'');
  _total int; _rows jsonb;
BEGIN
  IF _key NOT IN ('reference','type','status','residual','period','created_at','approved_at','entity') THEN
    _key := 'created_at'; _dir := 'desc';
  ELSIF _dir NOT IN ('asc','desc') THEN
    _dir := 'asc';
  END IF;

  WITH base AS (
    SELECT a.id, a.reference, a.entity_id, a.assessment_type, a.trigger_type, a.status,
           a.period_start, a.period_end, a.methodology_version, a.residual_rating,
           a.inherent_rating, a.control_rating, a.is_current, a.owner_id, a.submitted_at,
           a.approved_at, a.approved_by, a.confidentiality, a.created_at,
           l.name AS entity_name
      FROM public.supervisory_assessment a
      LEFT JOIN public.licensees l ON l.id = a.entity_id
     WHERE a.domain_code = 'AML_CFT'
       AND (_status IS NULL OR a.status = _status)
       AND (_q IS NULL
            OR a.reference ILIKE '%'||_q||'%'
            OR COALESCE(a.assessment_type,'') ILIKE '%'||_q||'%'
            OR COALESCE(l.name,'') ILIKE '%'||_q||'%')
  ), keyed AS (
    SELECT b.*,
      CASE _key
        WHEN 'status'      THEN public.sup_assessment_status_ordinal(b.status)::numeric
        WHEN 'residual'    THEN public.sup_risk_ordinal(b.residual_rating)::numeric
        WHEN 'period'      THEN extract(epoch FROM b.period_end)::numeric
        WHEN 'created_at'  THEN extract(epoch FROM b.created_at)::numeric
        WHEN 'approved_at' THEN extract(epoch FROM b.approved_at)::numeric
      END AS k_num,
      CASE _key
        WHEN 'reference' THEN b.reference
        WHEN 'type'      THEN b.assessment_type
        WHEN 'entity'    THEN b.entity_name
      END AS k_txt
      FROM base b
  ), ordered AS (
    SELECT k.*, row_number() OVER (ORDER BY
        CASE WHEN _dir = 'asc'  THEN k.k_num END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_num END DESC NULLS LAST,
        CASE WHEN _dir = 'asc'  THEN k.k_txt END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_txt END DESC NULLS LAST,
        k.reference ASC NULLS LAST, k.id ASC) AS rn
      FROM keyed k
  ), pg AS (
    SELECT * FROM ordered WHERE rn > (_pg - 1) * _ps AND rn <= (_pg - 1) * _ps + _ps
  )
  SELECT (SELECT count(*) FROM keyed)::int,
         COALESCE((SELECT jsonb_agg((to_jsonb(p) - 'k_num' - 'k_txt' - 'rn') ORDER BY p.rn) FROM pg p), '[]'::jsonb)
    INTO _total, _rows;

  RETURN jsonb_build_object('rows', _rows, 'total_count', _total,
    'page', _pg, 'page_size', _ps, 'sort_key', _key, 'sort_direction', _dir);
END $$;

-- ============================================================
-- 2. AML/CFT supervised entity portfolio — real server page.
-- Wraps the certified `aml_portfolio` read model (unchanged) so
-- domain applicability, scope and risk state stay canonical.
-- ============================================================
CREATE OR REPLACE FUNCTION public.aml_portfolio_page(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _sort_key text DEFAULT NULL,
  _sort_direction text DEFAULT NULL,
  _search text DEFAULT NULL,
  _rating text DEFAULT NULL,
  _coverage text DEFAULT NULL,
  _sector text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _ps int  := CASE WHEN COALESCE(_page_size,25) IN (10,25,50,100) THEN _page_size ELSE 25 END;
  _pg int  := GREATEST(COALESCE(_page,1),1);
  _key text := lower(btrim(COALESCE(_sort_key,'')));
  _dir text := lower(btrim(COALESCE(_sort_direction,'')));
  _q   text := NULLIF(btrim(COALESCE(_search,'')),'');
  _cov text := upper(btrim(COALESCE(_coverage,'')));
  _total int; _rows jsonb;
BEGIN
  IF _key NOT IN ('licence','entity','sector','risk','coverage','review','work') THEN
    _key := 'risk'; _dir := 'desc';
  ELSIF _dir NOT IN ('asc','desc') THEN
    _dir := 'asc';
  END IF;
  IF _cov NOT IN ('CURRENT','MISSING','REASSESSMENT') THEN _cov := NULL; END IF;

  WITH src AS (
    SELECT * FROM public.aml_portfolio(1000000)
  ), base AS (
    SELECT s.* FROM src s
     WHERE (_rating IS NULL OR upper(COALESCE(s.residual_rating,'')) = upper(_rating))
       AND (_sector IS NULL OR COALESCE(s.sector_name,'') = _sector)
       AND (_cov IS NULL OR CASE _cov
              WHEN 'CURRENT'      THEN COALESCE(s.assessment_current,false)
              WHEN 'MISSING'      THEN NOT COALESCE(s.assessment_current,false)
              WHEN 'REASSESSMENT' THEN COALESCE(s.reassessment_required,false)
            END)
       AND (_q IS NULL
            OR COALESCE(s.entity_name,'') ILIKE '%'||_q||'%'
            OR COALESCE(s.sector_name,'') ILIKE '%'||_q||'%'
            OR COALESCE(s.licence_reference,'') ILIKE '%'||_q||'%'
            OR COALESCE(s.last_assessment_reference,'') ILIKE '%'||_q||'%')
  ), keyed AS (
    SELECT b.*,
      CASE _key
        WHEN 'risk'     THEN public.sup_risk_ordinal(b.residual_rating)::numeric
        WHEN 'coverage' THEN (CASE WHEN COALESCE(b.assessment_current,false) THEN 1 ELSE 0 END)::numeric
        WHEN 'review'   THEN extract(epoch FROM b.next_review_date)::numeric
        WHEN 'work'     THEN COALESCE(b.open_findings,0)::numeric
      END AS k_num,
      CASE _key
        WHEN 'licence' THEN b.licence_reference
        WHEN 'entity'  THEN b.entity_name
        WHEN 'sector'  THEN b.sector_name
      END AS k_txt
      FROM base b
  ), ordered AS (
    SELECT k.*, row_number() OVER (ORDER BY
        CASE WHEN _dir = 'asc'  THEN k.k_num END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_num END DESC NULLS LAST,
        CASE WHEN _dir = 'asc'  THEN k.k_txt END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_txt END DESC NULLS LAST,
        k.entity_name ASC NULLS LAST, k.entity_id ASC) AS rn
      FROM keyed k
  ), pg AS (
    SELECT * FROM ordered WHERE rn > (_pg - 1) * _ps AND rn <= (_pg - 1) * _ps + _ps
  )
  SELECT (SELECT count(*) FROM keyed)::int,
         COALESCE((SELECT jsonb_agg((to_jsonb(p) - 'k_num' - 'k_txt' - 'rn') ORDER BY p.rn) FROM pg p), '[]'::jsonb)
    INTO _total, _rows;

  RETURN jsonb_build_object('rows', _rows, 'total_count', _total,
    'page', _pg, 'page_size', _ps, 'sort_key', _key, 'sort_direction', _dir);
END $$;

-- ============================================================
-- 3. AML/CFT work queue — real server page over the single
-- enterprise work model. Same scope semantics and the same
-- internal-staff restriction as `supervisory_work_queue`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.aml_work_queue_page(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _sort_key text DEFAULT NULL,
  _sort_direction text DEFAULT NULL,
  _search text DEFAULT NULL,
  _scope text DEFAULT 'MY_WORK',
  _work_type text DEFAULT NULL,
  _work_state text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _due text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _ps int  := CASE WHEN COALESCE(_page_size,25) IN (10,25,50,100) THEN _page_size ELSE 25 END;
  _pg int  := GREATEST(COALESCE(_page,1),1);
  _key text := lower(btrim(COALESCE(_sort_key,'')));
  _dir text := lower(btrim(COALESCE(_sort_direction,'')));
  _q   text := NULLIF(btrim(COALESCE(_search,'')),'');
  _scope_u text := upper(COALESCE(_scope,'MY_WORK'));
  _due_u text := upper(btrim(COALESCE(_due,'')));
  _teams uuid[];
  _total int; _rows jsonb; _counts jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_internal_staff(_uid) THEN
    RAISE EXCEPTION 'not_authorized: supervisory work queue is restricted to internal staff'
      USING ERRCODE = '42501';
  END IF;

  IF _key NOT IN ('queue','reference','work_type','state','due','entity') THEN
    _key := 'queue'; _dir := 'asc';
  ELSIF _dir NOT IN ('asc','desc') THEN
    _dir := 'asc';
  END IF;
  IF _scope_u NOT IN ('MY_WORK','MY_TEAM','UNASSIGNED','DUE_SOON','OVERDUE',
                      'HIGH_PRIORITY','AWAITING_MY_APPROVAL','ALL') THEN
    _scope_u := 'MY_WORK';
  END IF;
  IF _due_u NOT IN ('OVERDUE','DUE_SOON','UNDATED') THEN _due_u := NULL; END IF;

  SELECT COALESCE(array_agg(m.team_id), ARRAY[]::uuid[]) INTO _teams
    FROM public.regulatory_team_members m
   WHERE m.user_id = _uid
     AND COALESCE(m.status,'active') = 'active'
     AND (m.effective_to IS NULL OR m.effective_to > now());

  SELECT jsonb_build_object(
    'MY_WORK',              count(*) FILTER (WHERE effective_owner_id = _uid),
    'MY_TEAM',              count(*) FILTER (WHERE effective_team_id = ANY(_teams)),
    'UNASSIGNED',           count(*) FILTER (WHERE is_unassigned),
    'DUE_SOON',             count(*) FILTER (WHERE is_due_soon),
    'OVERDUE',              count(*) FILTER (WHERE is_overdue),
    'HIGH_PRIORITY',        count(*) FILTER (WHERE priority IN ('CRITICAL','HIGH')),
    'AWAITING_MY_APPROVAL', count(*) FILTER (WHERE decision_point
                                               AND work_state = 'AWAITING_DECISION'
                                               AND (maker_id IS NULL OR maker_id <> _uid)),
    'ALL',                  count(*)
  ) INTO _counts
    FROM public.supervisory_work_item
   WHERE domain_code = 'AML_CFT';

  WITH base AS (
    SELECT w.* FROM public.supervisory_work_item w
     WHERE w.domain_code = 'AML_CFT'
       AND (_work_type IS NULL OR w.work_type = upper(_work_type))
       AND (_work_state IS NULL OR w.work_state = upper(_work_state))
       AND (_priority IS NULL OR w.priority = upper(_priority))
       AND (_due_u IS NULL OR CASE _due_u
              WHEN 'OVERDUE'  THEN w.is_overdue
              WHEN 'DUE_SOON' THEN w.is_due_soon
              WHEN 'UNDATED'  THEN w.due_date IS NULL
            END)
       AND (_q IS NULL
            OR COALESCE(w.reference,'')       ILIKE '%'||_q||'%'
            OR COALESCE(w.title,'')           ILIKE '%'||_q||'%'
            OR COALESCE(w.entity_name,'')     ILIKE '%'||_q||'%'
            OR COALESCE(w.work_type_label,'') ILIKE '%'||_q||'%')
       AND CASE _scope_u
             WHEN 'MY_WORK'   THEN w.effective_owner_id = _uid
             WHEN 'MY_TEAM'   THEN w.effective_team_id = ANY(_teams)
             WHEN 'UNASSIGNED' THEN w.is_unassigned
             WHEN 'DUE_SOON'  THEN w.is_due_soon
             WHEN 'OVERDUE'   THEN w.is_overdue
             WHEN 'HIGH_PRIORITY' THEN w.priority IN ('CRITICAL','HIGH')
             WHEN 'AWAITING_MY_APPROVAL' THEN w.decision_point
                                              AND w.work_state = 'AWAITING_DECISION'
                                              AND (w.maker_id IS NULL OR w.maker_id <> _uid)
             WHEN 'ALL' THEN true
             ELSE w.effective_owner_id = _uid END
  ), keyed AS (
    SELECT b.*,
      CASE _key
        WHEN 'state' THEN public.sup_risk_ordinal(b.priority)::numeric
        WHEN 'due'   THEN extract(epoch FROM b.due_date)::numeric
      END AS k_num,
      CASE _key
        WHEN 'reference' THEN b.reference
        WHEN 'work_type' THEN COALESCE(b.work_type_label, b.work_type)
        WHEN 'entity'    THEN b.entity_name
      END AS k_txt
      FROM base b
  ), ordered AS (
    SELECT k.*, row_number() OVER (ORDER BY
        -- supervisory queue semantics preserved as the default order
        CASE WHEN _key = 'queue' THEN (CASE WHEN k.is_overdue THEN 0 ELSE 1 END) END ASC NULLS LAST,
        CASE WHEN _key = 'queue' THEN public.sup_risk_ordinal(k.priority) END DESC NULLS LAST,
        CASE WHEN _key = 'queue' THEN extract(epoch FROM k.due_date) END ASC NULLS LAST,
        CASE WHEN _dir = 'asc'  THEN k.k_num END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_num END DESC NULLS LAST,
        CASE WHEN _dir = 'asc'  THEN k.k_txt END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_txt END DESC NULLS LAST,
        k.sort_order ASC NULLS LAST, k.reference ASC NULLS LAST, k.work_key ASC) AS rn
      FROM keyed k
  ), pg AS (
    SELECT * FROM ordered WHERE rn > (_pg - 1) * _ps AND rn <= (_pg - 1) * _ps + _ps
  )
  SELECT (SELECT count(*) FROM keyed)::int,
         COALESCE((SELECT jsonb_agg((to_jsonb(p) - 'k_num' - 'k_txt' - 'rn') ORDER BY p.rn) FROM pg p), '[]'::jsonb)
    INTO _total, _rows;

  RETURN jsonb_build_object('rows', _rows, 'total_count', _total, 'counts', _counts,
    'scope', _scope_u, 'page', _pg, 'page_size', _ps, 'sort_key', _key, 'sort_direction', _dir);
END $$;

-- ============================================================
-- 4. AML/CFT examination register — real server page over the
-- canonical `examinations` store (no AML-private store).
-- ============================================================
CREATE OR REPLACE FUNCTION public.aml_examination_page(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _sort_key text DEFAULT NULL,
  _sort_direction text DEFAULT NULL,
  _search text DEFAULT NULL,
  _stage text DEFAULT NULL,
  _risk text DEFAULT NULL,
  _lead_examiner uuid DEFAULT NULL,
  _open_only boolean DEFAULT false,
  _fieldwork_from date DEFAULT NULL,
  _fieldwork_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _ps int  := CASE WHEN COALESCE(_page_size,25) IN (10,25,50,100) THEN _page_size ELSE 25 END;
  _pg int  := GREATEST(COALESCE(_page,1),1);
  _key text := lower(btrim(COALESCE(_sort_key,'')));
  _dir text := lower(btrim(COALESCE(_sort_direction,'')));
  _q   text := NULLIF(btrim(COALESCE(_search,'')),'');
  _total int; _rows jsonb;
BEGIN
  IF _key NOT IN ('reference','entity','stage','type_risk','workload','fieldwork','created_at','provenance') THEN
    _key := 'stage'; _dir := 'asc';
  ELSIF _dir NOT IN ('asc','desc') THEN
    _dir := 'asc';
  END IF;

  WITH base AS (
    SELECT e.id, e.reference, e.title, e.entity_id, e.engagement_type, e.examination_type,
           e.stage, e.risk_rating, e.fieldwork_start, e.fieldwork_end,
           e.period_under_review_start, e.period_under_review_end,
           e.lead_examiner_id, e.closed_at, e.intervention_id, e.plan_id, e.trigger_type,
           e.reassessment_required, e.created_at,
           l.name AS entity_name,
           pr.full_name AS lead_examiner_name,
           (SELECT count(*)::int FROM public.examination_data_requests d
             WHERE d.examination_id = e.id
               AND lower(COALESCE(d.status,'')) NOT IN ('received','closed')) AS open_rfis,
           (SELECT count(*)::int FROM public.supervisory_finding f
             WHERE f.examination_id = e.id AND f.domain_code = 'AML_CFT'
               AND upper(COALESCE(f.status,'')) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')) AS findings_open
      FROM public.examinations e
      LEFT JOIN public.licensees l ON l.id = e.entity_id
      LEFT JOIN public.profiles pr ON pr.id = e.lead_examiner_id
     WHERE e.domain_code = 'AML_CFT'
       AND (_stage IS NULL OR e.stage = _stage)
       AND (_risk IS NULL OR upper(COALESCE(e.risk_rating,'')) = upper(_risk))
       AND (_lead_examiner IS NULL OR e.lead_examiner_id = _lead_examiner)
       AND (NOT COALESCE(_open_only,false) OR e.closed_at IS NULL)
       AND (_fieldwork_from IS NULL OR e.fieldwork_start >= _fieldwork_from)
       AND (_fieldwork_to IS NULL OR e.fieldwork_start <= _fieldwork_to)
       AND (_q IS NULL
            OR COALESCE(e.reference,'') ILIKE '%'||_q||'%'
            OR COALESCE(e.title,'')     ILIKE '%'||_q||'%'
            OR COALESCE(l.name,'')      ILIKE '%'||_q||'%')
  ), keyed AS (
    SELECT b.*,
      CASE _key
        WHEN 'stage'      THEN public.sup_examination_stage_ordinal(b.stage)::numeric
        WHEN 'type_risk'  THEN public.sup_risk_ordinal(b.risk_rating)::numeric
        WHEN 'workload'   THEN (COALESCE(b.open_rfis,0) + COALESCE(b.findings_open,0))::numeric
        WHEN 'fieldwork'  THEN extract(epoch FROM b.fieldwork_start)::numeric
        WHEN 'created_at' THEN extract(epoch FROM b.created_at)::numeric
      END AS k_num,
      CASE _key
        WHEN 'reference'  THEN b.reference
        WHEN 'entity'     THEN b.entity_name
        WHEN 'provenance' THEN b.lead_examiner_name
      END AS k_txt
      FROM base b
  ), ordered AS (
    SELECT k.*, row_number() OVER (ORDER BY
        CASE WHEN _dir = 'asc'  THEN k.k_num END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_num END DESC NULLS LAST,
        CASE WHEN _dir = 'asc'  THEN k.k_txt END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_txt END DESC NULLS LAST,
        k.reference ASC NULLS LAST, k.id ASC) AS rn
      FROM keyed k
  ), pg AS (
    SELECT * FROM ordered WHERE rn > (_pg - 1) * _ps AND rn <= (_pg - 1) * _ps + _ps
  )
  SELECT (SELECT count(*) FROM keyed)::int,
         COALESCE((SELECT jsonb_agg((to_jsonb(p) - 'k_num' - 'k_txt' - 'rn') ORDER BY p.rn) FROM pg p), '[]'::jsonb)
    INTO _total, _rows;

  RETURN jsonb_build_object('rows', _rows, 'total_count', _total,
    'page', _pg, 'page_size', _ps, 'sort_key', _key, 'sort_direction', _dir);
END $$;

-- ============================================================
-- 5. AML/CFT findings & remediation — real server page. The
-- remediation actions the cards need come back in the same
-- query (one set-based join, never a per-row lookup).
-- ============================================================
CREATE OR REPLACE FUNCTION public.aml_finding_page(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _sort_key text DEFAULT NULL,
  _sort_direction text DEFAULT NULL,
  _search text DEFAULT NULL,
  _severity text DEFAULT NULL,
  _status text DEFAULT NULL,
  _view text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _ps int  := CASE WHEN COALESCE(_page_size,25) IN (10,25,50,100) THEN _page_size ELSE 25 END;
  _pg int  := GREATEST(COALESCE(_page,1),1);
  _key text := lower(btrim(COALESCE(_sort_key,'')));
  _dir text := lower(btrim(COALESCE(_sort_direction,'')));
  _q   text := NULLIF(btrim(COALESCE(_search,'')),'');
  _v   text := upper(btrim(COALESCE(_view,'')));
  _total int; _rows jsonb;
BEGIN
  IF _key NOT IN ('reference','entity','severity','status','due_date','issued_at') THEN
    _key := 'severity'; _dir := 'desc';
  ELSIF _dir NOT IN ('asc','desc') THEN
    _dir := 'asc';
  END IF;
  IF _v NOT IN ('OPEN','RESPONSE_DUE','REMEDIATION_OVERDUE','ESCALATED') THEN _v := NULL; END IF;

  WITH base AS (
    SELECT f.id, f.reference, f.title, f.entity_id, f.finding_category, f.severity, f.status,
           f.response_state, f.response_target_date, f.response_at, f.due_date,
           f.assessment_id, f.examination_id, f.confidentiality, f.issued_at, f.closed_at,
           f.validation_conclusion, f.created_at,
           l.name AS entity_name,
           COALESCE(ra.remediation, '[]'::jsonb) AS remediation
      FROM public.supervisory_finding f
      LEFT JOIN public.licensees l ON l.id = f.entity_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'reference', a.reference, 'finding_id', a.finding_id,
                 'description', a.description, 'status', a.status,
                 'target_date', a.target_date, 'effectiveness', a.effectiveness,
                 'escalated_attention_id', a.escalated_attention_id)
                 ORDER BY a.target_date NULLS LAST, a.reference) AS remediation,
               bool_or(a.target_date < current_date
                       AND upper(COALESCE(a.status,'')) NOT IN ('EFFECTIVE','CLOSED')) AS has_overdue,
               bool_or(a.escalated_attention_id IS NOT NULL) AS has_escalated
          FROM public.supervisory_remediation_action a
         WHERE a.finding_id = f.id
      ) ra ON true
     WHERE f.domain_code = 'AML_CFT'
       AND (_severity IS NULL OR f.severity = _severity)
       AND (_status IS NULL OR f.status = _status)
       AND (_v IS NULL OR CASE _v
              WHEN 'OPEN' THEN upper(COALESCE(f.status,'')) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
              WHEN 'RESPONSE_DUE' THEN f.response_target_date < current_date AND f.response_at IS NULL
              WHEN 'REMEDIATION_OVERDUE' THEN COALESCE(ra.has_overdue,false)
              WHEN 'ESCALATED' THEN COALESCE(ra.has_escalated,false)
            END)
       AND (_q IS NULL
            OR COALESCE(f.reference,'') ILIKE '%'||_q||'%'
            OR COALESCE(f.title,'')     ILIKE '%'||_q||'%'
            OR COALESCE(l.name,'')      ILIKE '%'||_q||'%')
  ), keyed AS (
    SELECT b.*,
      CASE _key
        WHEN 'severity'  THEN public.sup_risk_ordinal(b.severity)::numeric
        WHEN 'status'    THEN public.sup_finding_status_ordinal(b.status)::numeric
        WHEN 'due_date'  THEN extract(epoch FROM b.due_date)::numeric
        WHEN 'issued_at' THEN extract(epoch FROM b.issued_at)::numeric
      END AS k_num,
      CASE _key
        WHEN 'reference' THEN b.reference
        WHEN 'entity'    THEN b.entity_name
      END AS k_txt
      FROM base b
  ), ordered AS (
    SELECT k.*, row_number() OVER (ORDER BY
        CASE WHEN _dir = 'asc'  THEN k.k_num END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_num END DESC NULLS LAST,
        CASE WHEN _dir = 'asc'  THEN k.k_txt END ASC  NULLS LAST,
        CASE WHEN _dir = 'desc' THEN k.k_txt END DESC NULLS LAST,
        k.reference ASC NULLS LAST, k.id ASC) AS rn
      FROM keyed k
  ), pg AS (
    SELECT * FROM ordered WHERE rn > (_pg - 1) * _ps AND rn <= (_pg - 1) * _ps + _ps
  )
  SELECT (SELECT count(*) FROM keyed)::int,
         COALESCE((SELECT jsonb_agg((to_jsonb(p) - 'k_num' - 'k_txt' - 'rn') ORDER BY p.rn) FROM pg p), '[]'::jsonb)
    INTO _total, _rows;

  RETURN jsonb_build_object('rows', _rows, 'total_count', _total,
    'page', _pg, 'page_size', _ps, 'sort_key', _key, 'sort_direction', _dir);
END $$;