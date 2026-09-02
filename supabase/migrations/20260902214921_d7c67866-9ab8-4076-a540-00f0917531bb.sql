DROP VIEW IF EXISTS public.supervisory_timeline_event CASCADE;

CREATE VIEW public.supervisory_timeline_event
WITH (security_invoker = true) AS
-- Assessments
SELECT a.entity_id, a.domain_code, a.created_at AS occurred_at, 'ASSESSMENT'::text AS event_category,
       'ASSESSMENT_CREATED'::text AS event_type, 'Risk assessment started'::text AS title,
       a.reference AS reference, a.summary AS detail, NULL::text AS rationale,
       a.created_by AS actor_id, false AS is_decision,
       'supervisory_assessment'::text AS source_object, a.id AS source_id
FROM public.supervisory_assessment a
UNION ALL
SELECT a.entity_id, a.domain_code, a.submitted_at, 'ASSESSMENT', 'ASSESSMENT_SUBMITTED',
       'Assessment submitted for review', a.reference, a.summary, NULL, a.submitted_by, false,
       'supervisory_assessment', a.id
FROM public.supervisory_assessment a WHERE a.submitted_at IS NOT NULL
UNION ALL
SELECT a.entity_id, a.domain_code, a.reviewed_at, 'ASSESSMENT', 'ASSESSMENT_REVIEWED',
       'Assessment reviewed', a.reference, a.summary, NULL, a.reviewed_by, true,
       'supervisory_assessment', a.id
FROM public.supervisory_assessment a WHERE a.reviewed_at IS NOT NULL
UNION ALL
SELECT a.entity_id, a.domain_code, a.approved_at, 'ASSESSMENT', 'ASSESSMENT_APPROVED',
       'Assessment approved: residual ' || COALESCE(a.residual_rating,'not rated'),
       a.reference, a.summary, NULL, a.approved_by, true, 'supervisory_assessment', a.id
FROM public.supervisory_assessment a WHERE a.approved_at IS NOT NULL
UNION ALL
-- Authoritative risk movements
SELECT m.entity_id, m.domain_code, COALESCE(m.approved_at, m.created_at), 'RISK_STATE',
       'RISK_STATE_CHANGED',
       'Risk state changed: ' || COALESCE(m.previous_rating,'none') || ' to ' || COALESCE(m.new_rating,'none'),
       NULL, 'Trend: ' || COALESCE(m.trend,'unchanged'), m.reason, m.approved_by, true,
       'entity_risk_state_movement', m.id
FROM public.entity_risk_state_movement m
UNION ALL
-- Attention
SELECT CASE WHEN COALESCE(array_length(t.entity_ids,1),0) = 1 THEN t.entity_ids[1] END,
       COALESCE(t.domain_code,'CROSS_DOMAIN'), t.created_at, 'ATTENTION', 'ATTENTION_RAISED',
       'Supervisory attention raised', t.reference, t.title, t.supervisory_basis, t.created_by, false,
       'supervisory_attention', t.id
FROM public.supervisory_attention t
UNION ALL
SELECT CASE WHEN COALESCE(array_length(t.entity_ids,1),0) = 1 THEN t.entity_ids[1] END,
       COALESCE(t.domain_code,'CROSS_DOMAIN'), t.confirmed_at, 'ATTENTION', 'ATTENTION_PRIORITY_CONFIRMED',
       'Priority confirmed: ' || COALESCE(t.confirmed_priority,'unspecified'), t.reference, t.title,
       t.confirmation_rationale, t.confirmed_by, true, 'supervisory_attention', t.id
FROM public.supervisory_attention t WHERE t.confirmed_at IS NOT NULL
UNION ALL
SELECT CASE WHEN COALESCE(array_length(t.entity_ids,1),0) = 1 THEN t.entity_ids[1] END,
       COALESCE(t.domain_code,'CROSS_DOMAIN'), t.closed_at, 'ATTENTION', 'ATTENTION_CLOSED',
       'Attention closed: ' || COALESCE(t.disposition,'disposed'), t.reference, t.title,
       t.disposition_rationale, t.closed_by, true, 'supervisory_attention', t.id
FROM public.supervisory_attention t WHERE t.closed_at IS NOT NULL
UNION ALL
-- Plans
SELECT CASE WHEN COALESCE(array_length(p.entity_ids,1),0) = 1 THEN p.entity_ids[1] END,
       COALESCE(p.domain_code,'CROSS_DOMAIN'), p.submitted_at, 'PLAN', 'PLAN_SUBMITTED',
       'Supervisory plan submitted', p.reference, p.title, p.factual_basis, p.submitted_by, false,
       'supervisory_plan', p.id
FROM public.supervisory_plan p WHERE p.submitted_at IS NOT NULL
UNION ALL
SELECT CASE WHEN COALESCE(array_length(p.entity_ids,1),0) = 1 THEN p.entity_ids[1] END,
       COALESCE(p.domain_code,'CROSS_DOMAIN'), p.approved_at, 'PLAN', 'PLAN_APPROVED',
       'Supervisory plan approved', p.reference, p.title, p.approval_rationale, p.approved_by, true,
       'supervisory_plan', p.id
FROM public.supervisory_plan p WHERE p.approved_at IS NOT NULL
UNION ALL
SELECT CASE WHEN COALESCE(array_length(p.entity_ids,1),0) = 1 THEN p.entity_ids[1] END,
       COALESCE(p.domain_code,'CROSS_DOMAIN'), p.completed_at, 'PLAN', 'PLAN_COMPLETED',
       'Supervisory plan completed', p.reference, p.outcome_summary, NULL, NULL, false,
       'supervisory_plan', p.id
FROM public.supervisory_plan p WHERE p.completed_at IS NOT NULL
UNION ALL
-- Interventions
SELECT v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'), v.proposed_at, 'INTERVENTION',
       'INTERVENTION_PROPOSED', 'Intervention proposed: ' || COALESCE(v.intervention_type,'intervention'),
       v.reference, v.title, v.basis, v.proposed_by, false, 'supervisory_intervention', v.id
FROM public.supervisory_intervention v WHERE v.proposed_at IS NOT NULL
UNION ALL
SELECT v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'), v.decided_at, 'INTERVENTION',
       'INTERVENTION_DECIDED', 'Intervention decision: ' || COALESCE(v.status,'decided'),
       v.reference, v.title, v.decision_rationale, v.decided_by, true, 'supervisory_intervention', v.id
FROM public.supervisory_intervention v WHERE v.decided_at IS NOT NULL
UNION ALL
SELECT v.licensee_id, COALESCE(v.domain_code,'CROSS_DOMAIN'), v.completed_at, 'INTERVENTION',
       'INTERVENTION_COMPLETED', 'Intervention completed', v.reference, v.outcome_note,
       v.outcome_rationale, v.outcome_recorded_by, false, 'supervisory_intervention', v.id
FROM public.supervisory_intervention v WHERE v.completed_at IS NOT NULL
UNION ALL
-- Examinations
SELECT e.entity_id, COALESCE(e.domain_code,'CROSS_DOMAIN'), ev.created_at, 'EXAMINATION',
       'EXAMINATION_' || upper(COALESCE(ev.event_type,'EVENT')),
       'Examination ' || COALESCE(ev.event_type,'event')
         || COALESCE(': ' || ev.from_stage || ' to ' || ev.to_stage, ''),
       e.reference, e.title, ev.notes, ev.actor_id,
       (ev.to_stage IS NOT NULL), 'examinations', e.id
FROM public.examination_events ev
JOIN public.examinations e ON e.id = ev.examination_id
UNION ALL
-- Findings
SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN'), f.created_at, 'FINDING', 'FINDING_RAISED',
       'Finding raised: ' || COALESCE(f.severity,'severity not set'), f.reference, f.title,
       f.observation, f.created_by, false, 'supervisory_finding', f.id
FROM public.supervisory_finding f
UNION ALL
SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN'), f.issued_at, 'FINDING', 'FINDING_ISSUED',
       'Finding issued to entity', f.reference, f.title, f.required_action, f.issued_by, true,
       'supervisory_finding', f.id
FROM public.supervisory_finding f WHERE f.issued_at IS NOT NULL
UNION ALL
SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN'), f.response_at, 'FINDING',
       'FINDING_RESPONSE_RECEIVED', 'Management response received', f.reference, f.title,
       f.management_response, f.response_by, false, 'supervisory_finding', f.id
FROM public.supervisory_finding f WHERE f.response_at IS NOT NULL
UNION ALL
SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN'), f.response_decision_at, 'FINDING',
       'FINDING_RESPONSE_DECIDED',
       'Response decision: ' || COALESCE(f.response_decision,'recorded'), f.reference, f.title,
       NULL, f.response_decision_by, true, 'supervisory_finding', f.id
FROM public.supervisory_finding f WHERE f.response_decision_at IS NOT NULL
UNION ALL
SELECT f.entity_id, COALESCE(f.domain_code,'CROSS_DOMAIN'), f.closed_at, 'FINDING', 'FINDING_CLOSED',
       'Finding closed', f.reference, f.validation_conclusion, f.closure_rationale, f.closed_by, true,
       'supervisory_finding', f.id
FROM public.supervisory_finding f WHERE f.closed_at IS NOT NULL
UNION ALL
-- Remediation
SELECT r.entity_id, COALESCE(r.domain_code,'CROSS_DOMAIN'), rev.created_at, 'REMEDIATION',
       'REMEDIATION_' || upper(COALESCE(rev.event_type,'EVENT')),
       'Remediation ' || COALESCE(rev.event_type,'event')
         || COALESCE(': ' || rev.from_status || ' to ' || rev.to_status, ''),
       r.reference, r.description, rev.rationale, rev.actor_id,
       (rev.to_status IS NOT NULL), 'supervisory_remediation_action', r.id
FROM public.supervisory_remediation_event rev
JOIN public.supervisory_remediation_action r ON r.id = rev.action_id
UNION ALL
-- Escalations
SELECT CASE WHEN s.source_entity_type IN ('licensee','entity') THEN s.source_entity_id END,
       'CROSS_DOMAIN', s.created_at, 'ESCALATION', 'ESCALATION_RAISED',
       'Escalation raised: ' || s.escalation_type::text, s.escalation_ref, s.source_reference,
       s.root_cause, s.created_by, false, 'escalations', s.id
FROM public.escalations s
UNION ALL
SELECT CASE WHEN s.source_entity_type IN ('licensee','entity') THEN s.source_entity_id END,
       'CROSS_DOMAIN', s.acknowledged_at, 'ESCALATION', 'ESCALATION_ACKNOWLEDGED',
       'Escalation acknowledged', s.escalation_ref, s.source_reference, NULL, s.acknowledged_by, true,
       'escalations', s.id
FROM public.escalations s WHERE s.acknowledged_at IS NOT NULL
UNION ALL
SELECT CASE WHEN s.source_entity_type IN ('licensee','entity') THEN s.source_entity_id END,
       'CROSS_DOMAIN', s.resolved_at, 'ESCALATION', 'ESCALATION_RESOLVED',
       'Escalation resolved', s.escalation_ref, s.resolution_narrative, s.root_cause, s.resolved_by,
       true, 'escalations', s.id
FROM public.escalations s WHERE s.resolved_at IS NOT NULL
UNION ALL
SELECT CASE WHEN s.source_entity_type IN ('licensee','entity') THEN s.source_entity_id END,
       'CROSS_DOMAIN', te.created_at, 'ESCALATION', 'ESCALATION_TIER_CHANGED',
       'Escalation tier ' || COALESCE(te.from_tier::text,'0') || ' to ' || COALESCE(te.to_tier::text,'0'),
       s.escalation_ref, te.trigger_source, te.reason, te.actor_id, true, 'escalations', s.id
FROM public.escalation_tier_events te
JOIN public.escalations s ON s.id = te.escalation_id
UNION ALL
-- Enforcement
SELECT x.entity_id, 'CROSS_DOMAIN', x.referred_at, 'ENFORCEMENT', 'ENFORCEMENT_REFERRED',
       'Referred to enforcement', x.case_number, x.description, x.referral_reason, x.referred_by, true,
       'enforcement_actions', x.id
FROM public.enforcement_actions x WHERE x.referred_at IS NOT NULL
UNION ALL
SELECT x.entity_id, 'CROSS_DOMAIN', x.notice_issued_at, 'ENFORCEMENT', 'ENFORCEMENT_NOTICE_ISSUED',
       'Enforcement notice issued', x.case_number, x.notice_reference, x.legal_basis, NULL, true,
       'enforcement_actions', x.id
FROM public.enforcement_actions x WHERE x.notice_issued_at IS NOT NULL
UNION ALL
SELECT x.entity_id, 'CROSS_DOMAIN', x.decision_at, 'ENFORCEMENT', 'ENFORCEMENT_DECIDED',
       'Enforcement decision: ' || COALESCE(x.decision_outcome,'recorded'), x.case_number,
       x.sanction_detail, x.decision_rationale, x.approved_by, true, 'enforcement_actions', x.id
FROM public.enforcement_actions x WHERE x.decision_at IS NOT NULL
UNION ALL
SELECT x.entity_id, 'CROSS_DOMAIN', x.closed_at, 'ENFORCEMENT', 'ENFORCEMENT_CLOSED',
       'Enforcement action closed', x.case_number, NULL, x.closure_rationale, x.closed_by, false,
       'enforcement_actions', x.id
FROM public.enforcement_actions x WHERE x.closed_at IS NOT NULL;

GRANT SELECT ON public.supervisory_timeline_event TO authenticated, service_role;

COMMENT ON VIEW public.supervisory_timeline_event IS
  'EPIC 4 canonical enterprise supervisory timeline. Derived from canonical supervisory records and their event tables only; carries actor and recorded rationale for every decision point.';

CREATE OR REPLACE FUNCTION public.supervisory_timeline(
  _entity_id uuid DEFAULT NULL,
  _domain    text DEFAULT NULL,
  _category  text DEFAULT NULL,
  _from      timestamptz DEFAULT NULL,
  _to        timestamptz DEFAULT NULL,
  _limit     integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _events jsonb; _counts jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_internal_staff(_uid) THEN
    RAISE EXCEPTION 'not_authorized: the supervisory timeline is restricted to internal staff'
      USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT e.* FROM public.supervisory_timeline_event e
    WHERE e.occurred_at IS NOT NULL
      AND (_entity_id IS NULL OR e.entity_id = _entity_id)
      AND (_domain IS NULL OR e.domain_code = upper(_domain))
      AND (_category IS NULL OR e.event_category = upper(_category))
      AND (_from IS NULL OR e.occurred_at >= _from)
      AND (_to IS NULL OR e.occurred_at <= _to)
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.occurred_at DESC), '[]'::jsonb)
       FROM (SELECT * FROM base ORDER BY occurred_at DESC
              LIMIT GREATEST(COALESCE(_limit,200),1)) t),
    (SELECT COALESCE(jsonb_object_agg(event_category, n), '{}'::jsonb)
       FROM (SELECT event_category, count(*) AS n FROM base GROUP BY 1) c)
  INTO _events, _counts;

  RETURN jsonb_build_object(
    'entity_id', _entity_id,
    'generated_at', now(),
    'counts', _counts,
    'events', _events
  );
END $$;

REVOKE ALL ON FUNCTION public.supervisory_timeline(uuid, text, text, timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_timeline(uuid, text, text, timestamptz, timestamptz, integer)
  TO authenticated, service_role;
