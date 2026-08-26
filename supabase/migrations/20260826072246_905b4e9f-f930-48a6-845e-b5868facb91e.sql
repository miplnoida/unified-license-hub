-- MC-02 defect fix: intake queue used stale lowercase respondent match states.
-- Canonical MC-01 values are MATCHED_REGULATED / MATCHED_PREVIOUSLY_REGULATED /
-- UNMATCHED / SUSPECTED_UNAUTHORISED / INTERMEDIARY / PENDING_MATCH.

CREATE OR REPLACE FUNCTION public.complaint_intake_queue_counts(_scope jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v jsonb; v_configured boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.has_complaint_perm(v_uid,'view') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  WITH base AS (
    SELECT c.id, c.priority, c.created_at, c.triage_confirmation_status,
           COALESCE(a.status,'PENDING_ASSESSMENT') AS jstatus, a.decision_outcome,
           upper(coalesce(r.match_state,'')) AS match_state,
           COALESCE(v2.support_required,false) AS support_declared,
           COALESCE(v2.staff_review_state,'pending') AS support_state,
           (public.complaint_jurisdiction_sla(c.regulator_id)
              ->> 'jurisdiction_assessment_days')::int AS target_days
    FROM public.complaints c
    LEFT JOIN public.complaint_jurisdiction_assessments a ON a.complaint_id = c.id
    LEFT JOIN LATERAL (SELECT x.* FROM public.complaint_respondents x
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
        AND COALESCE(triage_confirmation_status,'PENDING') NOT IN ('CONFIRMED','OVERRIDDEN')),
    'p1_complaints', count(*) FILTER (WHERE priority = 'p1'),
    'support_reviews_pending', count(*) FILTER (WHERE support_declared AND support_state = 'pending'),
    'unmatched_respondents', count(*) FILTER (WHERE match_state IN ('UNMATCHED','PENDING_MATCH')),
    'suspected_unauthorised', count(*) FILTER (WHERE match_state = 'SUSPECTED_UNAUTHORISED'),
    'intermediary_respondents', count(*) FILTER (WHERE match_state = 'INTERMEDIARY'),
    'previously_regulated_respondents', count(*) FILTER (WHERE match_state = 'MATCHED_PREVIOUSLY_REGULATED'),
    -- Overdue exists ONLY where an operational target is configured.
    'overdue_jurisdiction_assessments', count(*) FILTER (
        WHERE jstatus IN ('PENDING_ASSESSMENT','IN_ASSESSMENT')
          AND target_days IS NOT NULL
          AND created_at < now() - (target_days || ' days')::interval),
    'overdue_target_configured', COALESCE(bool_or(target_days IS NOT NULL), false)
  ) INTO v FROM base;

  v_configured := COALESCE((v->>'overdue_target_configured')::boolean, false);
  RETURN COALESCE(v, '{}'::jsonb)
         || jsonb_build_object('overdue_basis',
              CASE WHEN v_configured THEN 'CONFIGURED_OPERATIONAL_TARGET' ELSE 'NOT_CONFIGURED' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complaint_intake_queue(_filters jsonb DEFAULT '{}'::jsonb, _page integer DEFAULT 1, _page_size integer DEFAULT 25, _search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND (NULLIF(_filters->>'respondent_match_state','') IS NULL
           OR upper(coalesce(r.match_state,'')) = upper(_filters->>'respondent_match_state'))
      AND (NULLIF(_filters->>'support_review_state','') IS NULL
           OR COALESCE(v.staff_review_state,'pending') = _filters->>'support_review_state')
      AND (NULLIF(_filters->>'min_age_days','') IS NULL
           OR c.created_at <= now() - ((_filters->>'min_age_days')::int || ' days')::interval)
      AND (COALESCE((_filters->>'support_declared')::boolean, false) = false OR COALESCE(v.support_required,false))
      AND (COALESCE((_filters->>'suspected_unauthorised')::boolean, false) = false
           OR upper(coalesce(r.match_state,'')) IN ('SUSPECTED_UNAUTHORISED','UNMATCHED','PENDING_MATCH'))
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
$function$;