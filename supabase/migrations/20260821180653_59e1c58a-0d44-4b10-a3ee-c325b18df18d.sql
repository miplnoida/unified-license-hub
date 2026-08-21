-- ============================================================
-- Phase B / P08.17–P08.19, P08.28 — Alerts + full work-queue parity
-- ============================================================

-- ------------------------------------------------------------
-- Alert register
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_alert_register(
  _statuses text[] DEFAULT NULL,
  _severities text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, reference text, kind text, source text, entity_id uuid, entity_name text,
  product_name text, channel_name text, risk_category_name text,
  rule_id uuid, rule_version integer, threshold_value numeric,
  severity text, status text, disposition text, disposition_reason text,
  explanation text, observation_start timestamptz, observation_end timestamptz,
  generated_at timestamptz, acknowledged_by uuid, acknowledged_by_name text, acknowledged_at timestamptz,
  complaint_id uuid, complaint_href text, investigation_id uuid, investigation_href text,
  title text, last_activity_at timestamptz, canonical_href text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  RETURN QUERY
  WITH scoped AS (
    SELECT a.*, l.name AS entity_name, pr.name AS product_name, ch.name AS channel_name,
           rc.name AS risk_category_name, p.full_name AS acknowledged_by_name
      FROM public.conduct_alerts a
      LEFT JOIN public.licensees l ON l.id = a.licensee_id
      LEFT JOIN public.conduct_products pr ON pr.id = a.product_id
      LEFT JOIN public.conduct_channels ch ON ch.id = a.channel_id
      LEFT JOIN public.conduct_risk_categories rc ON rc.id = a.conduct_risk_category_id
      LEFT JOIN public.profiles p ON p.id = a.acknowledged_by
     WHERE (_include_closed OR a.status NOT IN ('closed', 'dismissed'))
       AND (_statuses IS NULL OR a.status = ANY(_statuses))
       AND (_severities IS NULL OR a.severity = ANY(_severities))
       AND (_entity_id IS NULL OR a.licensee_id = _entity_id)
       AND (_search IS NULL OR btrim(_search) = '' OR
            coalesce(a.title, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(l.name, '') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.id, 'AL-' || upper(left(s.id::text, 8)), s.kind, coalesce(s.source, s.generated_by),
         s.licensee_id, s.entity_name, s.product_name, s.channel_name, s.risk_category_name,
         s.triage_rule_id, s.rule_version, s.threshold_value,
         s.severity, s.status, s.disposition, s.disposition_reason,
         s.explanation,
         coalesce(s.observation_start, s.window_start), coalesce(s.observation_end, s.window_end),
         s.created_at, s.acknowledged_by, s.acknowledged_by_name, s.acknowledged_at,
         s.complaint_id, CASE WHEN s.complaint_id IS NOT NULL THEN '/complaints/' || s.complaint_id ELSE NULL END,
         s.investigation_id, CASE WHEN s.investigation_id IS NOT NULL THEN '/conduct/investigations/' || s.investigation_id ELSE NULL END,
         s.title, greatest(s.updated_at, s.created_at),
         '/conduct/alerts?alert=' || s.id, counted.n
    FROM scoped s CROSS JOIN counted
   ORDER BY CASE s.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            s.created_at DESC
   LIMIT greatest(1, least(coalesce(_limit, 50), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_alert_register(text[], text[], uuid, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_alert_register(text[], text[], uuid, text, boolean, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_alert_register_counts(_entity_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE a.status = 'open'),
    'acknowledged', count(*) FILTER (WHERE a.status = 'acknowledged'),
    'high_severity_open', count(*) FILTER (WHERE a.status NOT IN ('closed','dismissed') AND a.severity IN ('high','critical')),
    'promoted', count(*) FILTER (WHERE a.investigation_id IS NOT NULL),
    'closed', count(*) FILTER (WHERE a.status IN ('closed','dismissed'))) INTO _res
  FROM public.conduct_alerts a
  WHERE (_entity_id IS NULL OR a.licensee_id = _entity_id);
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_alert_register_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_alert_register_counts(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Governed alert dispositions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_alert_dispose(
  _alert_id uuid, _disposition text, _reason text, _target_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _a record; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct', 'edit');
  SELECT * INTO _a FROM public.conduct_alerts WHERE id = _alert_id;
  IF _a IS NULL THEN RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002'; END IF;
  IF _a.status IN ('closed', 'dismissed') THEN
    RAISE EXCEPTION 'This alert is already disposed' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_reason)), 0) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _disposition NOT IN ('DISMISS', 'LINK_TO_EXISTING_COMPLAINT', 'LINK_TO_EXISTING_INVESTIGATION') THEN
    RAISE EXCEPTION 'Unsupported disposition %', _disposition USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(a) INTO _before FROM public.conduct_alerts a WHERE a.id = _alert_id;

  IF _disposition = 'DISMISS' THEN
    UPDATE public.conduct_alerts
       SET status = 'dismissed', disposition = 'dismissed', disposition_reason = btrim(_reason),
           reviewed_by = _uid, reviewed_at = now(), closed_by = _uid, closed_at = now(), updated_at = now()
     WHERE id = _alert_id;

  ELSIF _disposition = 'LINK_TO_EXISTING_COMPLAINT' THEN
    IF _target_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = _target_id) THEN
      RAISE EXCEPTION 'A valid complaint must be selected' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_alerts
       SET complaint_id = _target_id, disposition = 'linked_to_complaint',
           disposition_reason = btrim(_reason),
           status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
           acknowledged_by = coalesce(acknowledged_by, _uid),
           acknowledged_at = coalesce(acknowledged_at, now()),
           reviewed_by = _uid, reviewed_at = now(), updated_at = now()
     WHERE id = _alert_id;

  ELSE
    IF _target_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.conduct_investigations i WHERE i.id = _target_id) THEN
      RAISE EXCEPTION 'A valid investigation must be selected' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_alerts
       SET investigation_id = _target_id, disposition = 'linked_to_investigation',
           disposition_reason = btrim(_reason),
           status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
           acknowledged_by = coalesce(acknowledged_by, _uid),
           acknowledged_at = coalesce(acknowledged_at, now()),
           reviewed_by = _uid, reviewed_at = now(), updated_at = now()
     WHERE id = _alert_id;
  END IF;

  SELECT to_jsonb(a) INTO _after FROM public.conduct_alerts a WHERE a.id = _alert_id;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_alert', _alert_id, _before, _after,
    _disposition || ' — ' || btrim(_reason));
  RETURN jsonb_build_object('id', _alert_id, 'disposition', _disposition);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_alert_dispose(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_alert_dispose(uuid, text, text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Alert → Investigation promotion: lineage is mandatory
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_alert_promote_to_investigation(
  _alert_id uuid, _rationale text, _allegation text DEFAULT NULL, _due_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _a record; _inv uuid; _code text; _before jsonb; _after jsonb; _lineage jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct', 'initiate_investigation');
  SELECT * INTO _a FROM public.conduct_alerts WHERE id = _alert_id;
  IF _a IS NULL THEN RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002'; END IF;
  IF _a.investigation_id IS NOT NULL THEN
    RAISE EXCEPTION 'This alert is already linked to an investigation' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(_rationale)), 0) < 20 THEN
    RAISE EXCEPTION 'A promotion rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  _code := 'CI-' || to_char(now(), 'YYYY') || '-' ||
           lpad((1 + coalesce((SELECT max(substring(i.code from '[0-9]+$')::int)
                                 FROM public.conduct_investigations i
                                WHERE i.code LIKE 'CI-' || to_char(now(), 'YYYY') || '-%'), 0))::text, 5, '0');

  _lineage := jsonb_build_object(
    'alert_id', _a.id,
    'signal_source', coalesce(_a.source, _a.generated_by),
    'alert_kind', _a.kind,
    'rule_id', _a.triage_rule_id,
    'rule_version', _a.rule_version,
    'rule_snapshot', _a.rule_snapshot,
    'monitoring_result_id', _a.monitoring_result_id,
    'observation_start', coalesce(_a.observation_start, _a.window_start),
    'observation_end', coalesce(_a.observation_end, _a.window_end),
    'threshold_value', _a.threshold_value,
    'explanation', _a.explanation,
    'source_record_ids', to_jsonb(_a.source_record_ids),
    'product_id', _a.product_id,
    'channel_id', _a.channel_id,
    'promotion_rationale', btrim(_rationale),
    'promoted_by', _uid,
    'promoted_at', now());

  INSERT INTO public.conduct_investigations(
    code, source_type, source_id, licensee_id, product_id, allegation,
    priority, severity, status, due_date, opened_by, metadata, legal_basis)
  VALUES (
    _code, 'conduct_alert', _a.id, _a.licensee_id, _a.product_id,
    coalesce(nullif(btrim(_allegation), ''), _a.title),
    CASE _a.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
    coalesce(_a.severity, 'medium'), 'opened', _due_date, _uid,
    jsonb_build_object('promoted_from_alert', _lineage), NULL)
  RETURNING id INTO _inv;

  SELECT to_jsonb(a) INTO _before FROM public.conduct_alerts a WHERE a.id = _alert_id;
  UPDATE public.conduct_alerts
     SET investigation_id = _inv, disposition = 'promoted_to_investigation',
         disposition_reason = btrim(_rationale),
         status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
         acknowledged_by = coalesce(acknowledged_by, _uid),
         acknowledged_at = coalesce(acknowledged_at, now()),
         reviewed_by = _uid, reviewed_at = now(), updated_at = now()
   WHERE id = _alert_id;
  SELECT to_jsonb(a) INTO _after FROM public.conduct_alerts a WHERE a.id = _alert_id;

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_alert', _alert_id, _before, _after,
    'PROMOTE_TO_INVESTIGATION — ' || btrim(_rationale));
  PERFORM public.log_compliance_audit('CREATE', 'conduct_investigation', _inv, NULL,
    (SELECT to_jsonb(i) FROM public.conduct_investigations i WHERE i.id = _inv),
    'Promoted from conduct alert ' || _alert_id::text);

  RETURN jsonb_build_object('investigation_id', _inv, 'alert_id', _alert_id, 'code', _code);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_alert_promote_to_investigation(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_alert_promote_to_investigation(uuid, text, text, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Unified work items view — the single source for queue + counts
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_conduct_work_items AS
  -- Complaints
  SELECT c.id AS item_id, 'COMPLAINT'::text AS kind, 'Complaints'::text AS kind_label,
         c.complaint_number AS reference, c.subject,
         coalesce(c.licensee_id, c.license_holder_id) AS entity_id, l.name AS entity_name,
         upper(c.status) AS stage, initcap(replace(c.status, '_', ' ')) AS stage_label, c.status,
         coalesce(c.priority, 'medium') AS priority, coalesce(c.severity, 'medium') AS severity,
         c.investigator_id AS assigned_to, p.full_name AS assigned_to_name,
         c.sla_due_at,
         CASE WHEN c.resolved_at IS NOT NULL OR c.status IN ('closed', 'resolved') THEN 'paused'
              WHEN c.sla_due_at IS NULL THEN 'paused'
              WHEN c.sla_due_at < now() THEN 'breached'
              WHEN c.sla_due_at < now() + interval '3 days' THEN 'due_soon'
              ELSE 'on_track' END AS sla_state,
         CASE WHEN c.investigator_id IS NULL THEN 'Case allocation' ELSE 'Assigned officer' END AS waiting_on,
         CASE WHEN c.investigator_id IS NULL THEN 'Allocate and triage'
              WHEN c.status = 'under_investigation' THEN 'Progress investigation'
              ELSE 'Review complaint' END AS next_action_label,
         '[]'::jsonb AS blockers,
         greatest(c.updated_at, c.created_at) AS last_activity_at,
         '/complaints/' || c.id AS canonical_href,
         (c.status IN ('closed', 'resolved')) AS is_terminal,
         c.created_at
    FROM public.complaints c
    LEFT JOIN public.licensees l ON l.id = coalesce(c.licensee_id, c.license_holder_id)
    LEFT JOIN public.profiles p ON p.id = c.investigator_id

  UNION ALL
  -- Conduct alerts
  SELECT a.id, 'ALERT', 'Conduct alerts',
         'AL-' || upper(left(a.id::text, 8)), a.title,
         a.licensee_id, l.name,
         upper(a.status), initcap(replace(a.status, '_', ' ')), a.status,
         CASE a.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
         coalesce(a.severity, 'medium'),
         a.assigned_to, p.full_name,
         NULL::timestamptz,
         CASE WHEN a.status IN ('closed', 'dismissed') THEN 'paused'
              WHEN a.created_at < now() - interval '14 days' THEN 'breached'
              WHEN a.created_at < now() - interval '7 days' THEN 'due_soon'
              ELSE 'on_track' END,
         CASE WHEN a.acknowledged_at IS NULL THEN 'Acknowledgement' ELSE 'Disposition' END,
         CASE WHEN a.acknowledged_at IS NULL THEN 'Acknowledge alert' ELSE 'Record disposition' END,
         '[]'::jsonb,
         greatest(a.updated_at, a.created_at),
         '/conduct/alerts?alert=' || a.id,
         (a.status IN ('closed', 'dismissed')),
         a.created_at
    FROM public.conduct_alerts a
    LEFT JOIN public.licensees l ON l.id = a.licensee_id
    LEFT JOIN public.profiles p ON p.id = a.assigned_to

  UNION ALL
  -- Investigations
  SELECT s.id, 'INVESTIGATION', 'Investigations',
         coalesce(s.code, left(s.id::text, 8)), left(s.allegation, 160),
         s.entity_id, s.entity_name,
         s.stage, s.stage_label, s.status,
         coalesce(s.priority, 'medium'), coalesce(s.severity, 'medium'),
         s.assigned_to, s.assigned_to_name,
         s.sla_due_at, s.sla_state,
         CASE WHEN s.is_terminal THEN NULL
              WHEN s.stage = 'PROPOSED_OUTCOME' THEN 'Supervisory approval'
              WHEN s.assigned_to IS NULL THEN 'Case allocation'
              ELSE 'Investigating officer' END,
         CASE s.stage
           WHEN 'INTAKE' THEN 'Scope and allocate'
           WHEN 'EVIDENCE' THEN 'Gather evidence'
           WHEN 'ANALYSIS' THEN 'Complete analysis'
           WHEN 'PROPOSED_OUTCOME' THEN 'Submit closure determination'
           ELSE NULL END,
         public.conduct_investigation_blockers(s.id),
         s.last_activity_at,
         '/conduct/investigations/' || s.id,
         s.is_terminal,
         s.created_at
    FROM public.v_conduct_investigation_state s

  UNION ALL
  -- Remediation / supervisory actions
  SELECT r.id, 'ACTION', 'Remediation',
         r.action_reference, r.title,
         r.entity_id, r.entity_name,
         upper(r.status), r.stage_label, r.status,
         CASE WHEN r.is_overdue THEN 'high' ELSE 'medium' END, 'medium',
         r.assigned_to, r.assigned_to_name,
         r.sla_due_at, r.sla_state,
         r.waiting_on, r.next_action_label,
         '[]'::jsonb,
         r.last_activity_at,
         '/conduct/actions/' || r.id,
         r.is_terminal,
         r.created_at
    FROM public.v_conduct_action_state r

  UNION ALL
  -- Findings awaiting supervisory review
  SELECT f.id, 'FINDING', 'Findings',
         f.finding_reference, f.title,
         f.entity_id, l.name,
         upper(f.status), initcap(replace(f.status, '_', ' ')), f.status,
         CASE f.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
         f.severity,
         f.owner_id, p.full_name,
         NULL::timestamptz,
         CASE WHEN f.status = 'closed' THEN 'paused'
              WHEN f.opened_at < now() - interval '30 days' THEN 'breached'
              WHEN f.opened_at < now() - interval '21 days' THEN 'due_soon'
              ELSE 'on_track' END,
         CASE WHEN f.status = 'awaiting_entity_response' THEN 'Regulated entity'
              WHEN f.status = 'closed' THEN NULL ELSE 'Conduct officer' END,
         CASE f.status
           WHEN 'draft' THEN 'Complete the finding analysis'
           WHEN 'under_analysis' THEN 'Confirm or dismiss the finding'
           WHEN 'awaiting_entity_response' THEN 'Await entity response'
           WHEN 'response_received' THEN 'Confirm or dismiss the finding'
           WHEN 'confirmed' THEN 'Decide remediation or referral'
           WHEN 'remediation_required' THEN 'Monitor remediation'
           ELSE NULL END,
         '[]'::jsonb,
         greatest(f.updated_at, f.created_at),
         '/conduct/findings/' || f.id,
         (f.status = 'closed'),
         f.created_at
    FROM public.conduct_findings f
    LEFT JOIN public.licensees l ON l.id = f.entity_id
    LEFT JOIN public.profiles p ON p.id = f.owner_id;

ALTER VIEW public.v_conduct_work_items SET (security_invoker = true);
GRANT SELECT ON public.v_conduct_work_items TO authenticated, service_role;

-- Queue now reads the canonical view, and counts cover the full set.
CREATE OR REPLACE FUNCTION public.conduct_work_queue(
  _kinds text[] DEFAULT NULL,
  _sla_states text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _sort text DEFAULT 'sla',
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  item_id uuid, kind text, kind_label text, reference text, subject text,
  entity_id uuid, entity_name text, stage text, stage_label text, status text,
  priority text, severity text, assigned_to uuid, assigned_to_name text,
  sla_due_at timestamptz, sla_state text, waiting_on text,
  next_action_label text, blockers jsonb, last_activity_at timestamptz,
  canonical_href text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  RETURN QUERY
  WITH scoped AS (
    SELECT i.* FROM public.v_conduct_work_items i
     WHERE (_include_closed OR NOT i.is_terminal)
       AND (_kinds IS NULL OR i.kind = ANY(_kinds))
       AND (_sla_states IS NULL OR i.sla_state = ANY(_sla_states))
       AND (_entity_id IS NULL OR i.entity_id = _entity_id)
       AND (_assigned_to IS NULL OR i.assigned_to = _assigned_to)
       AND (NOT coalesce(_unassigned, false) OR i.assigned_to IS NULL)
       AND (_search IS NULL OR btrim(_search) = '' OR
            coalesce(i.reference, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(i.subject, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(i.entity_name, '') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.item_id, s.kind, s.kind_label, s.reference, s.subject, s.entity_id, s.entity_name,
         s.stage, s.stage_label, s.status, s.priority, s.severity, s.assigned_to, s.assigned_to_name,
         s.sla_due_at, s.sla_state, s.waiting_on, s.next_action_label, s.blockers,
         s.last_activity_at, s.canonical_href, counted.n
    FROM scoped s CROSS JOIN counted
   ORDER BY
     CASE WHEN _sort = 'sla' THEN
       CASE s.sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 WHEN 'on_track' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     CASE WHEN _sort = 'priority' THEN
       CASE s.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     s.sla_due_at NULLS LAST, s.created_at DESC
   LIMIT greatest(1, least(coalesce(_limit, 50), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_work_queue(text[], text[], uuid, uuid, boolean, text, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_work_queue(text[], text[], uuid, uuid, boolean, text, boolean, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_work_queue_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'total_open', count(*),
    'breached', count(*) FILTER (WHERE i.sla_state = 'breached'),
    'due_soon', count(*) FILTER (WHERE i.sla_state = 'due_soon'),
    'unassigned', count(*) FILTER (WHERE i.assigned_to IS NULL),
    'by_kind', coalesce((SELECT jsonb_object_agg(z.kind, z.n) FROM (
        SELECT w.kind, count(*) AS n FROM public.v_conduct_work_items w
         WHERE NOT w.is_terminal GROUP BY w.kind) z), '{}'::jsonb))
    INTO _res
  FROM public.v_conduct_work_items i
  WHERE NOT i.is_terminal;
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_work_queue_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_work_queue_counts() TO authenticated, service_role;