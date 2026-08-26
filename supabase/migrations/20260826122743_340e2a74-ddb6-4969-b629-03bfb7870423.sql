-- MC-07.1 — Conduct 360 FACT read model (facts only, deterministic, no AI fields).

CREATE OR REPLACE FUNCTION public.conduct_360_snapshot(
  _entity_id uuid,
  _window_start date DEFAULT NULL,
  _window_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _ws timestamptz;
  _we timestamptz;
  _pws timestamptz;
  _pwe timestamptz;
  _days integer;
  _lic record;
  _out jsonb;
BEGIN
  _uid := public.conduct_pattern_require(ARRAY['view','run_conduct_analytics','manage_complaints']);

  _we := COALESCE(_window_end, current_date)::timestamptz + interval '1 day' - interval '1 microsecond';
  _ws := COALESCE(_window_start, (COALESCE(_window_end, current_date) - interval '12 months')::date)::timestamptz;
  IF _ws >= _we THEN
    RAISE EXCEPTION 'invalid_window: start must precede end' USING ERRCODE = '22023';
  END IF;
  _days := GREATEST(1, (EXTRACT(EPOCH FROM (_we - _ws)) / 86400)::integer);
  _pwe := _ws - interval '1 microsecond';
  _pws := _ws - (_days || ' days')::interval;

  SELECT l.id, l.name, l.status, l.sector_id, l.sub_sector_id, l.lead_regulator_id,
         l.systemic_importance, l.assigned_supervisor_id, l.regulator_officer_id,
         s.name AS sector_name, ss.name AS sub_sector_name, r.name AS regulator_name
    INTO _lic
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    LEFT JOIN public.sub_sectors ss ON ss.id = l.sub_sector_id
    LEFT JOIN public.regulators r ON r.id = l.lead_regulator_id
   WHERE l.id = _entity_id;

  IF _lic.id IS NULL THEN
    RAISE EXCEPTION 'not_found: entity' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin(_uid)
          OR public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
               _lic.lead_regulator_id, _lic.sector_id, NULL, _lic.id, _uid)) THEN
    RAISE EXCEPTION 'not_authorized: entity out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  WITH cw AS (
    SELECT c.*, ct.name AS type_name, co.overall_outcome, co.harm_level,
           p.name AS product_name, ch.name AS channel_name, rc.name AS risk_category_name
      FROM public.complaints c
      LEFT JOIN public.complaint_types ct ON ct.id = c.complaint_type_id
      LEFT JOIN public.conduct_products p ON p.id = c.product_id
      LEFT JOIN public.conduct_channels ch ON ch.id = c.channel_id
      LEFT JOIN public.conduct_risk_categories rc ON rc.id = c.conduct_risk_category_id
      LEFT JOIN public.complaint_outcomes co
             ON co.complaint_id = c.id AND co.is_current IS TRUE
     WHERE c.licensee_id = _entity_id
       AND c.created_at >= _ws AND c.created_at <= _we
  ),
  call_ AS (
    SELECT c.* FROM public.complaints c WHERE c.licensee_id = _entity_id
  ),
  cprev AS (
    SELECT c.* FROM public.complaints c
     WHERE c.licensee_id = _entity_id AND c.created_at >= _pws AND c.created_at <= _pwe
  ),
  red AS (
    SELECT r.*, rt.name AS redress_type_name, c.complaint_number
      FROM public.complaint_redress r
      JOIN public.complaints c ON c.id = r.complaint_id
      LEFT JOIN public.complaint_redress_types rt ON rt.id = r.redress_type_id
     WHERE c.licensee_id = _entity_id AND r.created_at >= _ws AND r.created_at <= _we
  ),
  sig AS (
    SELECT s.*, rc.name AS risk_category_name
      FROM public.conduct_signals s
      LEFT JOIN public.conduct_risk_categories rc ON rc.id = s.conduct_risk_category_id
     WHERE s.licensee_id = _entity_id AND s.created_at >= _ws AND s.created_at <= _we
  ),
  pat AS (
    SELECT k.* FROM public.conduct_clusters k
     WHERE k.licensee_id = _entity_id
       AND k.first_detected_at >= _ws AND k.first_detected_at <= _we
  ),
  alr AS (
    SELECT a.*, c.complaint_number, k.reference AS pattern_reference
      FROM public.conduct_alerts a
      LEFT JOIN public.complaints c ON c.id = a.complaint_id
      LEFT JOIN public.conduct_clusters k ON k.raised_alert_id = a.id
     WHERE a.licensee_id = _entity_id AND a.created_at >= _ws AND a.created_at <= _we
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object(
      'start', _ws, 'end', _we, 'days', _days,
      'comparison_start', _pws, 'comparison_end', _pwe
    ),
    'entity', jsonb_build_object(
      'name', _lic.name,
      'licence_status', _lic.status,
      'sector', _lic.sector_name,
      'sub_sector', _lic.sub_sector_name,
      'regulator', _lic.regulator_name,
      'systemic_importance', _lic.systemic_importance,
      'supervisor', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _lic.assigned_supervisor_id),
      'portfolio_officer', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _lic.regulator_officer_id),
      'licences', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'reference', li.license_number, 'type', li.license_type,
                 'status', li.status, 'valid_from', li.valid_from, 'valid_until', li.valid_until)
                 ORDER BY li.issued_at DESC NULLS LAST)
          FROM public.licenses li WHERE li.holder_id = _entity_id), '[]'::jsonb),
      'source', 'Entity registry'
    ),
    'posture', jsonb_build_object(
      'measures', jsonb_build_object(
        'complaints_received_in_window', (SELECT count(*) FROM cw),
        'complaints_open_now', (SELECT count(*) FROM call_ c WHERE lower(c.status) NOT IN ('closed','withdrawn','rejected','resolved')),
        'complaints_closed_in_window', (SELECT count(*) FROM call_ c WHERE c.closed_at >= _ws AND c.closed_at <= _we),
        'complaints_upheld_in_window', (SELECT count(*) FROM cw WHERE upper(COALESCE(cw.overall_outcome,'')) LIKE '%UPHELD%' AND upper(COALESCE(cw.overall_outcome,'')) NOT LIKE 'NOT_%'),
        'complaints_overdue_now', (SELECT count(*) FROM call_ c WHERE c.sla_due_at IS NOT NULL AND c.sla_due_at < now() AND lower(c.status) NOT IN ('closed','withdrawn','rejected','resolved')),
        'signals_raised_in_window', (SELECT count(*) FROM sig),
        'signals_open_now', (SELECT count(*) FROM public.conduct_signals s WHERE s.licensee_id = _entity_id AND lower(s.status) NOT IN ('closed','dismissed')),
        'patterns_detected_in_window', (SELECT count(*) FROM pat),
        'patterns_confirmed_now', (SELECT count(*) FROM public.conduct_clusters k WHERE k.licensee_id = _entity_id AND lower(k.status) = 'confirmed'),
        'alerts_raised_in_window', (SELECT count(*) FROM alr),
        'alerts_open_now', (SELECT count(*) FROM public.conduct_alerts a WHERE a.licensee_id = _entity_id AND lower(a.status) NOT IN ('closed','dismissed')),
        'redress_ordered_amount', (SELECT COALESCE(sum(r.amount),0) FROM red r WHERE r.is_required IS TRUE),
        'redress_paid_amount', (SELECT COALESCE(sum(r.amount),0) FROM red r WHERE lower(r.status) IN ('completed','verified','paid'))
      ),
      'source', 'Complaints, signals, patterns and alerts registers'
    ),
    'complaints', jsonb_build_object(
      'measures', jsonb_build_object(
        'total', (SELECT count(*) FROM cw),
        'by_status', COALESCE((SELECT jsonb_object_agg(x.status, x.n) FROM (SELECT COALESCE(status,'unspecified') status, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'by_severity', COALESCE((SELECT jsonb_object_agg(x.severity, x.n) FROM (SELECT COALESCE(severity,'unspecified') severity, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'by_category', COALESCE((SELECT jsonb_object_agg(x.cat, x.n) FROM (SELECT COALESCE(type_name,'Uncategorised') cat, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'count', n) ORDER BY m)
                                FROM (SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n FROM cw GROUP BY 1) y), '[]'::jsonb),
        'by_outcome', COALESCE((SELECT jsonb_object_agg(x.oc, x.n) FROM (SELECT COALESCE(overall_outcome,'Outcome not recorded') oc, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb)
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'reference', cw.complaint_number,
                  'subject', cw.subject,
                  'category', cw.type_name,
                  'severity', cw.severity,
                  'status', cw.status,
                  'conduct_risk_level', cw.conduct_risk_level,
                  'systemic_potential', cw.systemic_potential,
                  'received_at', cw.created_at,
                  'sla_due_at', cw.sla_due_at,
                  'sla_state', CASE WHEN cw.sla_due_at IS NULL THEN 'not_tracked'
                                    WHEN cw.closed_at IS NOT NULL AND cw.closed_at <= cw.sla_due_at THEN 'met'
                                    WHEN cw.closed_at IS NOT NULL THEN 'breached'
                                    WHEN cw.sla_due_at < now() THEN 'overdue' ELSE 'on_track' END,
                  'closed_at', cw.closed_at,
                  'outcome', cw.overall_outcome,
                  'consumer_harm_level', cw.harm_level,
                  'product', cw.product_name,
                  'channel', cw.channel_name,
                  'href', '/complaints/' || cw.id::text)
                  ORDER BY cw.created_at DESC) FROM cw), '[]'::jsonb),
      'source', 'Complaints register and outcome records'
    ),
    'redress', jsonb_build_object(
      'measures', jsonb_build_object(
        'items_required', (SELECT count(*) FROM red WHERE is_required IS TRUE),
        'items_completed', (SELECT count(*) FROM red WHERE lower(status) IN ('completed','verified','paid')),
        'items_outstanding', (SELECT count(*) FROM red WHERE lower(COALESCE(status,'')) NOT IN ('completed','verified','paid','cancelled')),
        'items_overdue', (SELECT count(*) FROM red WHERE due_date IS NOT NULL AND due_date < current_date AND lower(COALESCE(status,'')) NOT IN ('completed','verified','paid','cancelled')),
        'amount_ordered', (SELECT COALESCE(sum(amount),0) FROM red WHERE is_required IS TRUE),
        'amount_paid', (SELECT COALESCE(sum(amount),0) FROM red WHERE lower(status) IN ('completed','verified','paid')),
        'amount_outstanding', (SELECT COALESCE(sum(amount),0) FROM red WHERE lower(COALESCE(status,'')) NOT IN ('completed','verified','paid','cancelled'))
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'complaint_reference', red.complaint_number,
                  'redress_type', red.redress_type_name,
                  'affected_party', red.affected_party_label,
                  'amount', red.amount,
                  'currency', red.currency,
                  'action_required', red.action_required,
                  'due_date', red.due_date,
                  'status', red.status,
                  'completed_at', red.completed_at,
                  'verified_at', red.verified_at,
                  'href', '/complaints/' || red.complaint_id::text)
                  ORDER BY red.created_at DESC) FROM red), '[]'::jsonb),
      'source', 'Complaint redress records'
    ),
    'signals', jsonb_build_object(
      'measures', jsonb_build_object(
        'total', (SELECT count(*) FROM sig),
        'by_status', COALESCE((SELECT jsonb_object_agg(x.status, x.n) FROM (SELECT COALESCE(status,'unspecified') status, count(*) n FROM sig GROUP BY 1) x), '{}'::jsonb),
        'by_severity', COALESCE((SELECT jsonb_object_agg(x.severity, x.n) FROM (SELECT COALESCE(severity,'unspecified') severity, count(*) n FROM sig GROUP BY 1) x), '{}'::jsonb),
        'systemic_potential_high', (SELECT count(*) FROM sig WHERE lower(COALESCE(systemic_potential,'')) IN ('high','confirmed'))
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'reference', sig.reference,
                  'title', sig.title,
                  'source', sig.source_type,
                  'category', COALESCE(sig.signal_category, sig.risk_category_name),
                  'severity', sig.severity,
                  'risk_score', sig.risk_score,
                  'systemic_potential', sig.systemic_potential,
                  'status', sig.status,
                  'raised_at', sig.created_at,
                  'href', '/conduct/signals/' || sig.id::text)
                  ORDER BY sig.created_at DESC) FROM sig), '[]'::jsonb),
      'source', 'Conduct signals register'
    ),
    'patterns', jsonb_build_object(
      'measures', jsonb_build_object(
        'total', (SELECT count(*) FROM pat),
        'confirmed', (SELECT count(*) FROM pat WHERE lower(status) = 'confirmed'),
        'under_review', (SELECT count(*) FROM pat WHERE lower(status) = 'open'),
        'dismissed', (SELECT count(*) FROM pat WHERE lower(status) = 'dismissed')
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'reference', pat.reference,
                  'title', pat.title,
                  'pattern_type', pat.pattern_type,
                  'rule', pat.rule_code,
                  'rule_version', pat.rule_version,
                  'measure', pat.metric,
                  'measured_value', pat.metric_value,
                  'measure_unit', pat.metric_unit,
                  'threshold_value', pat.threshold_value,
                  'comparison', pat.comparison_operator,
                  'window_start', pat.window_start,
                  'window_end', pat.window_end,
                  'window_days', pat.window_days,
                  'contributing_record_count', pat.member_count,
                  'severity', pat.severity,
                  'status', pat.status,
                  'why_it_matched', pat.match_explanation,
                  'first_detected_at', pat.first_detected_at,
                  'last_evaluated_at', pat.last_evaluated_at,
                  'raised_signal', (SELECT s2.reference FROM public.conduct_signals s2 WHERE s2.id = pat.raised_signal_id),
                  'contributing_records', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'type', m.member_type, 'reference', m.member_reference,
                              'title', m.member_title, 'severity', m.member_severity,
                              'occurred_at', m.occurred_at) ORDER BY m.occurred_at DESC)
                       FROM public.conduct_cluster_members m WHERE m.cluster_id = pat.id), '[]'::jsonb),
                  'href', '/conduct/patterns/' || pat.id::text)
                  ORDER BY pat.first_detected_at DESC) FROM pat), '[]'::jsonb),
      'source', 'Deterministic pattern detection (rule outcomes)'
    ),
    'alerts', jsonb_build_object(
      'measures', jsonb_build_object(
        'total', (SELECT count(*) FROM alr),
        'open', (SELECT count(*) FROM alr WHERE lower(status) NOT IN ('closed','dismissed')),
        'by_kind', COALESCE((SELECT jsonb_object_agg(x.kind, x.n) FROM (SELECT COALESCE(kind,'unspecified') kind, count(*) n FROM alr GROUP BY 1) x), '{}'::jsonb),
        'by_severity', COALESCE((SELECT jsonb_object_agg(x.severity, x.n) FROM (SELECT COALESCE(severity,'unspecified') severity, count(*) n FROM alr GROUP BY 1) x), '{}'::jsonb)
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'title', alr.title,
                  'kind', alr.kind,
                  'severity', alr.severity,
                  'status', alr.status,
                  'origin', COALESCE(alr.source, alr.generated_by),
                  'raised_at', alr.created_at,
                  'closed_at', alr.closed_at,
                  'linked_complaint', alr.complaint_number,
                  'linked_pattern', alr.pattern_reference,
                  'explanation', alr.explanation,
                  'href', '/conduct/alerts/' || alr.id::text)
                  ORDER BY alr.created_at DESC) FROM alr), '[]'::jsonb),
      'source', 'Conduct alerts register'
    ),
    'product_channel', jsonb_build_object(
      'measures', jsonb_build_object(
        'complaints_by_product', COALESCE((SELECT jsonb_object_agg(x.k, x.n) FROM (SELECT COALESCE(product_name,'Not recorded') k, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'complaints_by_channel', COALESCE((SELECT jsonb_object_agg(x.k, x.n) FROM (SELECT COALESCE(channel_name,'Not recorded') k, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'signals_by_product', COALESCE((SELECT jsonb_object_agg(x.k, x.n) FROM (
            SELECT COALESCE(p.name,'Not recorded') k, count(*) n FROM sig
            LEFT JOIN public.conduct_products p ON p.id = sig.product_id GROUP BY 1) x), '{}'::jsonb),
        'sector_comparison', jsonb_build_object(
          'sector', _lic.sector_name,
          'entity_complaints_in_window', (SELECT count(*) FROM cw),
          'sector_entities_with_complaints', (SELECT count(DISTINCT c.licensee_id) FROM public.complaints c
             JOIN public.licensees l2 ON l2.id = c.licensee_id
            WHERE l2.sector_id = _lic.sector_id AND c.created_at >= _ws AND c.created_at <= _we),
          'sector_complaints_in_window', (SELECT count(*) FROM public.complaints c
             JOIN public.licensees l2 ON l2.id = c.licensee_id
            WHERE l2.sector_id = _lic.sector_id AND c.created_at >= _ws AND c.created_at <= _we),
          'sector_average_complaints_per_entity', (SELECT round(
              (count(*)::numeric / GREATEST(1, count(DISTINCT c.licensee_id))), 2) FROM public.complaints c
             JOIN public.licensees l2 ON l2.id = c.licensee_id
            WHERE l2.sector_id = _lic.sector_id AND c.created_at >= _ws AND c.created_at <= _we)
        )
      ),
      'source', 'Product, channel and sector reference data'
    ),
    'risk_indicators', jsonb_build_object(
      'measures', jsonb_build_object(
        'complaints_by_risk_category', COALESCE((SELECT jsonb_object_agg(x.k, x.n) FROM (SELECT COALESCE(risk_category_name,'Not classified') k, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'complaints_by_conduct_risk_level', COALESCE((SELECT jsonb_object_agg(x.k, x.n) FROM (SELECT COALESCE(conduct_risk_level,'Not rated') k, count(*) n FROM cw GROUP BY 1) x), '{}'::jsonb),
        'signals_by_risk_category', COALESCE((SELECT jsonb_object_agg(x.k, x.n) FROM (SELECT COALESCE(risk_category_name,'Not classified') k, count(*) n FROM sig GROUP BY 1) x), '{}'::jsonb),
        'findings_recorded', (SELECT count(*) FROM public.conduct_findings f WHERE f.entity_id = _entity_id AND f.created_at >= _ws AND f.created_at <= _we)
      ),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'reference', f.finding_reference,
                  'title', f.title,
                  'category', f.category,
                  'severity', f.severity,
                  'risk_rating', f.risk_rating,
                  'status', f.status,
                  'opened_at', f.opened_at,
                  'closed_at', f.closed_at,
                  'last_reviewed_by', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = f.owner_id))
                  ORDER BY f.created_at DESC)
                FROM public.conduct_findings f
               WHERE f.entity_id = _entity_id AND f.created_at >= _ws AND f.created_at <= _we), '[]'::jsonb),
      'source', 'Conduct risk classifications and recorded findings'
    ),
    'trends', jsonb_build_object(
      'measures', jsonb_build_object(
        'complaints_received', jsonb_build_object(
          'current', (SELECT count(*) FROM cw),
          'previous', (SELECT count(*) FROM cprev),
          'change', (SELECT count(*) FROM cw) - (SELECT count(*) FROM cprev)),
        'complaints_closed', jsonb_build_object(
          'current', (SELECT count(*) FROM call_ c WHERE c.closed_at >= _ws AND c.closed_at <= _we),
          'previous', (SELECT count(*) FROM call_ c WHERE c.closed_at >= _pws AND c.closed_at <= _pwe),
          'change', (SELECT count(*) FROM call_ c WHERE c.closed_at >= _ws AND c.closed_at <= _we)
                    - (SELECT count(*) FROM call_ c WHERE c.closed_at >= _pws AND c.closed_at <= _pwe)),
        'signals_raised', jsonb_build_object(
          'current', (SELECT count(*) FROM sig),
          'previous', (SELECT count(*) FROM public.conduct_signals s WHERE s.licensee_id = _entity_id AND s.created_at >= _pws AND s.created_at <= _pwe),
          'change', (SELECT count(*) FROM sig)
                    - (SELECT count(*) FROM public.conduct_signals s WHERE s.licensee_id = _entity_id AND s.created_at >= _pws AND s.created_at <= _pwe)),
        'patterns_detected', jsonb_build_object(
          'current', (SELECT count(*) FROM pat),
          'previous', (SELECT count(*) FROM public.conduct_clusters k WHERE k.licensee_id = _entity_id AND k.first_detected_at >= _pws AND k.first_detected_at <= _pwe),
          'change', (SELECT count(*) FROM pat)
                    - (SELECT count(*) FROM public.conduct_clusters k WHERE k.licensee_id = _entity_id AND k.first_detected_at >= _pws AND k.first_detected_at <= _pwe)),
        'alerts_raised', jsonb_build_object(
          'current', (SELECT count(*) FROM alr),
          'previous', (SELECT count(*) FROM public.conduct_alerts a WHERE a.licensee_id = _entity_id AND a.created_at >= _pws AND a.created_at <= _pwe),
          'change', (SELECT count(*) FROM alr)
                    - (SELECT count(*) FROM public.conduct_alerts a WHERE a.licensee_id = _entity_id AND a.created_at >= _pws AND a.created_at <= _pwe))
      ),
      'source', 'Window versus preceding equal-length window'
    ),
    'open_items', jsonb_build_object(
      'measures', jsonb_build_object(
        'open_complaints', (SELECT count(*) FROM call_ c WHERE lower(c.status) NOT IN ('closed','withdrawn','rejected','resolved')),
        'open_investigations', (SELECT count(*) FROM public.conduct_investigations i WHERE i.licensee_id = _entity_id AND lower(i.status) NOT IN ('closed','discontinued')),
        'open_information_requests', (SELECT count(*) FROM public.complaint_rfis q WHERE q.licensee_id = _entity_id AND lower(q.status) NOT IN ('closed','cancelled','completed')),
        'open_reconsiderations', (SELECT count(*) FROM public.complaint_reconsiderations rr JOIN public.complaints c ON c.id = rr.complaint_id
                                   WHERE c.licensee_id = _entity_id AND lower(rr.status) NOT IN ('decided','closed','withdrawn')),
        'open_supervisory_actions', (SELECT count(*) FROM public.conduct_actions a WHERE a.entity_id = _entity_id AND lower(a.status) NOT IN ('completed','cancelled','closed')),
        'overdue_supervisory_actions', (SELECT count(*) FROM public.conduct_actions a WHERE a.entity_id = _entity_id AND a.due_date < current_date AND lower(a.status) NOT IN ('completed','cancelled','closed'))
      ),
      'items', (
        COALESCE((SELECT jsonb_agg(jsonb_build_object('type','Investigation','reference',i.code,'title',i.allegation,
                    'status',i.status,'severity',i.severity,'due_date',i.due_date,
                    'href','/conduct/investigations/' || i.id::text) ORDER BY i.created_at DESC)
             FROM public.conduct_investigations i
            WHERE i.licensee_id = _entity_id AND lower(i.status) NOT IN ('closed','discontinued')), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','Information request','reference',c.complaint_number,
                    'title',q.summary,'status',q.status,'due_date',q.due_at,
                    'href','/complaints/' || q.complaint_id::text) ORDER BY q.raised_at DESC)
             FROM public.complaint_rfis q JOIN public.complaints c ON c.id = q.complaint_id
            WHERE q.licensee_id = _entity_id AND lower(q.status) NOT IN ('closed','cancelled','completed')), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','Reconsideration','reference',rr.reference,
                    'title',rr.grounds,'status',rr.status,'due_date',NULL,
                    'href','/complaints/' || rr.complaint_id::text) ORDER BY rr.created_at DESC)
             FROM public.complaint_reconsiderations rr JOIN public.complaints c ON c.id = rr.complaint_id
            WHERE c.licensee_id = _entity_id AND lower(rr.status) NOT IN ('decided','closed','withdrawn')), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object('type','Supervisory action','reference',a.action_type,
                    'title',a.title,'status',a.status,'due_date',a.due_date,
                    'href','/conduct/actions/' || a.id::text) ORDER BY a.created_at DESC)
             FROM public.conduct_actions a
            WHERE a.entity_id = _entity_id AND lower(a.status) NOT IN ('completed','cancelled','closed')), '[]'::jsonb)
      ),
      'source', 'Investigations, information requests, reconsiderations and supervisory actions'
    ),
    'recent_activity', jsonb_build_object(
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('occurred_at', t.occurred_at, 'activity', t.activity,
                 'reference', t.reference, 'detail', t.detail, 'source', t.src, 'href', t.href)
                 ORDER BY t.occurred_at DESC)
          FROM (
            SELECT cw.created_at AS occurred_at, 'Complaint received' AS activity, cw.complaint_number AS reference,
                   cw.subject AS detail, 'Complaints' AS src, '/complaints/' || cw.id::text AS href FROM cw
            UNION ALL
            SELECT cw.closed_at, 'Complaint closed', cw.complaint_number, COALESCE(cw.overall_outcome, cw.closure_reason),
                   'Complaints', '/complaints/' || cw.id::text FROM cw WHERE cw.closed_at IS NOT NULL
            UNION ALL
            SELECT sig.created_at, 'Conduct signal raised', sig.reference, sig.title, 'Signals',
                   '/conduct/signals/' || sig.id::text FROM sig
            UNION ALL
            SELECT pat.first_detected_at, 'Pattern detected', pat.reference, pat.match_explanation, 'Patterns',
                   '/conduct/patterns/' || pat.id::text FROM pat
            UNION ALL
            SELECT alr.created_at, 'Alert raised', COALESCE(alr.pattern_reference, alr.complaint_number), alr.title,
                   'Alerts', '/conduct/alerts/' || alr.id::text FROM alr
            UNION ALL
            SELECT an.created_at, 'Supervisory note recorded', an.label, an.note, 'Supervisory record', NULL
              FROM public.conduct_supervision_annotations an
             WHERE an.licensee_id = _entity_id AND an.created_at >= _ws AND an.created_at <= _we
          ) t
          WHERE t.occurred_at IS NOT NULL
        ), '[]'::jsonb),
      'source', 'Material conduct events recorded in the window'
    ),
    'provenance', jsonb_build_object(
      'read_model', 'conduct_360_snapshot',
      'content_class', 'fact',
      'deterministic', true,
      'ai_content', false,
      'calculated_at', now(),
      'calculated_for', _lic.name,
      'sections', jsonb_build_array('entity','posture','complaints','redress','signals','patterns','alerts',
                                    'product_channel','risk_indicators','trends','open_items','recent_activity')
    )
  ) INTO _out;

  RETURN _out;
END;
$function$;

REVOKE ALL ON FUNCTION public.conduct_360_snapshot(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conduct_360_snapshot(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.conduct_360_snapshot(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_360_snapshot(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.conduct_360_snapshot(uuid, date, date) IS
  'MC-07.1 Conduct 360 fact read model. Facts only, deterministic, no AI fields. Regulator/ROS scope enforced; read-only.';