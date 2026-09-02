INSERT INTO public.supervisory_work_type (code, label, canonical_object, decision_point, description, sort_order) VALUES
  ('APPLICATION_ASSESSMENT',          'Licensing application assessment', 'applications',                    false, 'Licensing application assigned to an officer and still in progress.', 180),
  ('COMPLAINT_HANDLING',              'Complaint handling',               'complaints',                      false, 'Open complaint assigned to an investigator.',                        190),
  ('COMPLAINT_INVESTIGATION_TASK',    'Complaint investigation task',     'complaint_investigation_tasks',   false, 'Open complaint investigation task owned by an officer.',             200),
  ('PROVIDER_SUBMISSION_ACCEPTANCE',  'Provider submission acceptance',   'provider_work_packages',          true,  'Provider submission awaiting internal acceptance.',                 210)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label, canonical_object = EXCLUDED.canonical_object,
      decision_point = EXCLUDED.decision_point, description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order, is_active = true, updated_at = now();

CREATE OR REPLACE VIEW public.supervisory_work_item_source
WITH (security_invoker = true) AS
SELECT 'ASSESSMENT_DRAFTING'::text AS work_type, 'supervisory_assessment'::text AS source_object,
       a.id AS source_id, a.reference, COALESCE(a.summary, a.reference) AS title,
       a.domain_code, a.entity_id, a.owner_id, a.team_id, a.created_by AS maker_id,
       a.status AS source_status, 'IN_PROGRESS'::text AS work_state,
       a.next_review_date AS due_date, a.created_at AS opened_at,
       NULL::text AS raw_priority
FROM public.supervisory_assessment a
WHERE a.status IN ('draft','returned_for_revision')
UNION ALL
SELECT 'ASSESSMENT_APPROVAL', 'supervisory_assessment', a.id, a.reference,
       COALESCE(a.summary, a.reference), a.domain_code, a.entity_id, a.owner_id, a.team_id,
       COALESCE(a.submitted_by, a.created_by), a.status, 'AWAITING_DECISION',
       a.next_review_date, COALESCE(a.submitted_at, a.created_at), NULL::text
FROM public.supervisory_assessment a
WHERE a.status IN ('submitted','reviewed')
UNION ALL
SELECT 'ATTENTION_PRIORITY_CONFIRMATION', 'supervisory_attention', t.id, t.reference, t.title,
       COALESCE(t.domain_code,'CROSS_DOMAIN'),
       CASE WHEN COALESCE(array_length(t.entity_ids,1),0) = 1 THEN t.entity_ids[1] END,
       t.owner_id, t.team_id, t.created_by, t.status, 'AWAITING_DECISION',
       t.target_review_date, t.created_at, COALESCE(t.calculated_priority, t.urgency)
FROM public.supervisory_attention t
WHERE t.status <> 'CLOSED' AND t.confirmed_priority IS NULL
UNION ALL
SELECT 'ATTENTION_DISPOSITION', 'supervisory_attention', t.id, t.reference, t.title,
       COALESCE(t.domain_code,'CROSS_DOMAIN'),
       CASE WHEN COALESCE(array_length(t.entity_ids,1),0) = 1 THEN t.entity_ids[1] END,
       t.owner_id, t.team_id, t.created_by, t.status, 'IN_PROGRESS',
       t.target_review_date, t.created_at, COALESCE(t.confirmed_priority, t.calculated_priority)
FROM public.supervisory_attention t
WHERE t.status <> 'CLOSED' AND t.confirmed_priority IS NOT NULL
UNION ALL
SELECT 'PLAN_APPROVAL', 'supervisory_plan', p.id, p.reference, p.title,
       COALESCE(p.domain_code,'CROSS_DOMAIN'),
       CASE WHEN COALESCE(array_length(p.entity_ids,1),0) = 1 THEN p.entity_ids[1] END,
       p.lead_officer_id, p.team_id, COALESCE(p.submitted_by, p.created_by), p.status,
       'AWAITING_DECISION', p.target_completion, COALESCE(p.submitted_at, p.created_at), p.priority
FROM public.supervisory_plan p
WHERE p.status = 'SUBMITTED'
UNION ALL
SELECT 'PLAN_ITEM_DELIVERY', 'supervisory_plan_item', i.id,
       p.reference || '-' || left(i.id::text, 8), i.title,
       COALESCE(p.domain_code,'CROSS_DOMAIN'),
       CASE WHEN COALESCE(array_length(p.entity_ids,1),0) = 1 THEN p.entity_ids[1] END,
       COALESCE(i.owner_id, p.lead_officer_id), COALESCE(i.team_id, p.team_id), i.created_by,
       i.status, CASE WHEN i.status = 'IN_PROGRESS' THEN 'IN_PROGRESS' ELSE 'NOT_STARTED' END,
       i.due_date, i.created_at, p.priority
FROM public.supervisory_plan_item i
JOIN public.supervisory_plan p ON p.id = i.plan_id
WHERE i.status IN ('PENDING','OPEN','IN_PROGRESS')
  AND p.status IN ('APPROVED','ACTIVE')
UNION ALL
SELECT 'INTERVENTION_DECISION', 'supervisory_intervention', v.id, v.reference, v.title,
       COALESCE(v.domain_code,'CROSS_DOMAIN'), v.licensee_id, v.owner_id, v.team_id,
       COALESCE(v.proposed_by, v.owner_id), v.status, 'AWAITING_DECISION',
       v.planned_end, COALESCE(v.proposed_at, v.created_at), NULL::text
FROM public.supervisory_intervention v
WHERE v.status = 'PROPOSED'
UNION ALL
SELECT 'INTERVENTION_DELIVERY', 'supervisory_intervention', v.id, v.reference, v.title,
       COALESCE(v.domain_code,'CROSS_DOMAIN'), v.licensee_id, v.owner_id, v.team_id,
       COALESCE(v.proposed_by, v.owner_id), v.status,
       CASE WHEN v.status = 'ACTIVE' THEN 'IN_PROGRESS' ELSE 'NOT_STARTED' END,
       COALESCE(v.followup_due_date, v.planned_end), COALESCE(v.activated_at, v.created_at), NULL::text
FROM public.supervisory_intervention v
WHERE v.status IN ('ENDORSED','ACTIVE')
UNION ALL
SELECT 'EXAMINATION_STAGE_DECISION', 'examinations', e.id, e.reference, e.title,
       COALESCE(e.domain_code,'CROSS_DOMAIN'), e.entity_id, e.lead_examiner_id, NULL::uuid,
       e.created_by, e.stage, 'AWAITING_DECISION',
       COALESCE(e.fieldwork_end, e.period_under_review_end), e.created_at, e.risk_rating
FROM public.examinations e
WHERE e.closed_at IS NULL
  AND lower(COALESCE(e.stage,'')) NOT IN ('closed','cancelled','completed')
UNION ALL
SELECT 'EXAMINATION_DATA_REQUEST', 'examination_data_requests', d.id,
       e.reference || '-DR' || COALESCE(d.item_no::text,''), d.title,
       COALESCE(e.domain_code,'CROSS_DOMAIN'), e.entity_id,
       COALESCE(d.requested_by, e.lead_examiner_id), NULL::uuid, d.requested_by, d.status,
       'AWAITING_ENTITY', d.due_date, COALESCE(d.issued_at, d.created_at), NULL::text
FROM public.examination_data_requests d
JOIN public.examinations e ON e.id = d.examination_id
WHERE upper(COALESCE(d.status,'')) NOT IN ('RECEIVED','CLOSED','CANCELLED','COMPLETE','COMPLETED')
UNION ALL
SELECT 'FINDING_ISSUANCE', 'supervisory_finding', f.id, f.reference, f.title,
       COALESCE(f.domain_code,'CROSS_DOMAIN'), f.entity_id, f.owner_id, f.team_id, f.created_by,
       f.status, 'AWAITING_DECISION', f.due_date, f.created_at, f.severity
FROM public.supervisory_finding f
WHERE f.status IN ('DRAFT','REVIEW')
UNION ALL
SELECT 'FINDING_RESPONSE_REVIEW', 'supervisory_finding', f.id, f.reference, f.title,
       COALESCE(f.domain_code,'CROSS_DOMAIN'), f.entity_id, f.owner_id, f.team_id, f.response_by,
       f.status, 'AWAITING_DECISION', COALESCE(f.response_target_date, f.due_date),
       COALESCE(f.response_at, f.issued_at, f.created_at), f.severity
FROM public.supervisory_finding f
WHERE f.status = 'MANAGEMENT_RESPONSE'
  AND f.response_at IS NOT NULL
  AND f.response_decision IS NULL
UNION ALL
SELECT 'REMEDIATION_DECISION', 'supervisory_remediation_action', r.id, r.reference, r.description,
       COALESCE(r.domain_code,'CROSS_DOMAIN'), r.entity_id, r.owner_id, NULL::uuid, r.created_by,
       r.status, 'AWAITING_DECISION', r.target_date, r.created_at, NULL::text
FROM public.supervisory_remediation_action r
WHERE r.status IN ('ACTION_PLAN_SUBMITTED','UNDER_REVIEW','EVIDENCE_SUBMITTED','VALIDATION')
UNION ALL
SELECT 'REMEDIATION_DELIVERY', 'supervisory_remediation_action', r.id, r.reference, r.description,
       COALESCE(r.domain_code,'CROSS_DOMAIN'), r.entity_id, r.owner_id, NULL::uuid, r.created_by,
       r.status,
       CASE WHEN r.status IN ('IMPLEMENTING','REOPENED') THEN 'IN_PROGRESS'
            WHEN r.status = 'OPEN' THEN 'AWAITING_ENTITY' ELSE 'NOT_STARTED' END,
       r.target_date, r.created_at, NULL::text
FROM public.supervisory_remediation_action r
WHERE r.status IN ('OPEN','ACCEPTED','IMPLEMENTING','REOPENED','PARTIALLY_EFFECTIVE','INEFFECTIVE')
UNION ALL
SELECT 'REASSESSMENT_FULFILMENT', 'supervisory_reassessment_requirement', q.id,
       'RSR-' || left(q.id::text, 8),
       'Reassessment required: ' || COALESCE(q.trigger_kind,'trigger'),
       COALESCE(q.domain_code,'CROSS_DOMAIN'), q.entity_id, q.owner_id, q.team_id, q.created_by,
       q.status, CASE WHEN q.status = 'IN_PROGRESS' THEN 'IN_PROGRESS' ELSE 'NOT_STARTED' END,
       q.due_date, q.created_at, NULL::text
FROM public.supervisory_reassessment_requirement q
WHERE q.status IN ('REQUIRED','IN_PROGRESS')
UNION ALL
SELECT 'ESCALATION_RESPONSE', 'escalations', s.id, s.escalation_ref,
       COALESCE(s.source_reference, s.escalation_type::text), 'CROSS_DOMAIN',
       CASE WHEN s.source_entity_type IN ('licensee','entity') THEN s.source_entity_id END,
       s.assigned_user_id, NULL::uuid, s.created_by, s.status::text,
       CASE WHEN s.status::text IN ('open') THEN 'NOT_STARTED' ELSE 'IN_PROGRESS' END,
       COALESCE(s.resolution_deadline, s.acknowledgement_deadline)::date, s.created_at,
       s.severity::text
FROM public.escalations s
WHERE s.status::text IN ('open','acknowledged','in_progress','escalated')
UNION ALL
SELECT 'ENFORCEMENT_REFERRAL_REVIEW', 'enforcement_actions', x.id, x.case_number,
       COALESCE(x.description, x.enforcement_type), 'CROSS_DOMAIN', x.entity_id,
       x.assigned_to, NULL::uuid, COALESCE(x.referred_by, x.opened_by), x.stage,
       'AWAITING_DECISION', x.appeal_deadline, COALESCE(x.referred_at, x.created_at), x.severity
FROM public.enforcement_actions x
WHERE x.stage IN ('REFERRAL','ASSESSMENT') AND x.closed_at IS NULL
UNION ALL
-- module work converged into the same model
SELECT 'APPLICATION_ASSESSMENT', 'applications', ap.id, ap.application_number,
       COALESCE(ap.license_type, 'Licensing application'), 'CROSS_DOMAIN', ap.entity_id,
       ap.assigned_to, NULL::uuid, ap.assigned_by, ap.status, 'IN_PROGRESS',
       NULL::date, ap.created_at, NULL::text
FROM public.applications ap
WHERE ap.assigned_to IS NOT NULL
  AND ap.status NOT IN ('draft','approved','rejected','cancelled')
UNION ALL
SELECT 'COMPLAINT_HANDLING', 'complaints', c.id, c.complaint_number, c.subject,
       'MARKET_CONDUCT', c.licensee_id, c.investigator_id, NULL::uuid, NULL::uuid, c.status,
       'IN_PROGRESS', c.sla_due_at::date, c.created_at, c.priority::text
FROM public.complaints c
WHERE c.closed_at IS NULL AND c.investigator_id IS NOT NULL
UNION ALL
SELECT 'COMPLAINT_INVESTIGATION_TASK', 'complaint_investigation_tasks', ct.id,
       'TASK-' || left(ct.id::text, 8), ct.title, 'MARKET_CONDUCT', NULL::uuid,
       ct.owner_id, NULL::uuid, NULL::uuid, ct.status,
       CASE WHEN upper(COALESCE(ct.status,'')) = 'IN_PROGRESS' THEN 'IN_PROGRESS' ELSE 'NOT_STARTED' END,
       ct.due_date, ct.created_at, ct.priority::text
FROM public.complaint_investigation_tasks ct
WHERE upper(COALESCE(ct.status,'')) NOT IN ('COMPLETED','CANCELLED')
UNION ALL
SELECT 'PROVIDER_SUBMISSION_ACCEPTANCE', 'provider_work_packages', w.id, w.reference,
       'Provider submission awaiting internal acceptance', 'CROSS_DOMAIN', w.entity_id,
       w.accepted_by, NULL::uuid, w.assigned_member_id, w.state, 'AWAITING_DECISION',
       w.due_at::date, COALESCE(w.submitted_at, w.created_at), NULL::text
FROM public.provider_work_packages w
WHERE w.state IN ('SUBMITTED','INTERNAL_REVIEW') AND w.closed_at IS NULL;

CREATE OR REPLACE VIEW public.supervisory_work_item
WITH (security_invoker = true) AS
SELECT
  s.work_type || ':' || s.source_id::text                       AS work_key,
  s.work_type,
  wt.label                                                      AS work_type_label,
  wt.decision_point,
  s.source_object,
  s.source_id,
  s.reference,
  s.title,
  s.domain_code,
  s.entity_id,
  l.name                                                        AS entity_name,
  s.source_status,
  s.work_state,
  s.opened_at,
  s.due_date,
  (s.due_date IS NOT NULL AND s.due_date < CURRENT_DATE)        AS is_overdue,
  (s.due_date IS NOT NULL AND s.due_date >= CURRENT_DATE
     AND s.due_date <= CURRENT_DATE + INTERVAL '7 days')        AS is_due_soon,
  CASE upper(COALESCE(s.raw_priority,''))
    WHEN 'CRITICAL' THEN 'CRITICAL' WHEN 'SEVERE' THEN 'CRITICAL'
    WHEN 'URGENT' THEN 'CRITICAL'
    WHEN 'HIGH' THEN 'HIGH' WHEN 'MEDIUM' THEN 'MEDIUM'
    WHEN 'MODERATE' THEN 'MEDIUM' WHEN 'NORMAL' THEN 'MEDIUM'
    WHEN 'LOW' THEN 'LOW' WHEN 'ROUTINE' THEN 'ROUTINE'
    ELSE 'MEDIUM' END                                           AS priority,
  s.maker_id,
  s.owner_id                                                    AS record_owner_id,
  s.team_id                                                     AS record_team_id,
  COALESCE(asg.assigned_to, s.owner_id)                         AS effective_owner_id,
  COALESCE(asg.assigned_team, s.team_id)                        AS effective_team_id,
  (COALESCE(asg.assigned_to, s.owner_id) IS NULL
     AND COALESCE(asg.assigned_team, s.team_id) IS NULL)        AS is_unassigned,
  asg.assigned_to                                               AS overlay_assigned_to,
  asg.assigned_team                                             AS overlay_assigned_team,
  asg.note                                                      AS assignment_note,
  CASE s.work_type
    WHEN 'ASSESSMENT_DRAFTING' THEN CASE WHEN s.domain_code = 'AML_CFT'
        THEN '/supervision/aml/assessments/' || s.source_id::text
        ELSE '/prudential/assessments/' || s.source_id::text END
    WHEN 'ASSESSMENT_APPROVAL' THEN CASE WHEN s.domain_code = 'AML_CFT'
        THEN '/supervision/aml/assessments/' || s.source_id::text
        ELSE '/prudential/assessments/' || s.source_id::text END
    WHEN 'ATTENTION_PRIORITY_CONFIRMATION' THEN '/conduct/attention/' || s.source_id::text
    WHEN 'ATTENTION_DISPOSITION'           THEN '/conduct/attention/' || s.source_id::text
    WHEN 'PLAN_APPROVAL'                   THEN '/conduct/plans/' || s.source_id::text
    WHEN 'PLAN_ITEM_DELIVERY'              THEN '/conduct/plans/' || s.source_id::text
    WHEN 'INTERVENTION_DECISION'           THEN '/conduct/interventions/' || s.source_id::text
    WHEN 'INTERVENTION_DELIVERY'           THEN '/conduct/interventions/' || s.source_id::text
    WHEN 'EXAMINATION_STAGE_DECISION'      THEN '/prudential/examinations/' || s.source_id::text
    WHEN 'EXAMINATION_DATA_REQUEST'        THEN '/prudential/examinations/' || s.source_id::text
    WHEN 'FINDING_ISSUANCE'                THEN '/conduct/findings/' || s.source_id::text
    WHEN 'FINDING_RESPONSE_REVIEW'         THEN '/conduct/findings/' || s.source_id::text
    WHEN 'REMEDIATION_DECISION'            THEN '/conduct/actions/' || s.source_id::text
    WHEN 'REMEDIATION_DELIVERY'            THEN '/conduct/actions/' || s.source_id::text
    WHEN 'REASSESSMENT_FULFILMENT'         THEN CASE WHEN s.entity_id IS NOT NULL
        THEN '/entities/' || s.entity_id::text ELSE '/my-work' END
    WHEN 'ESCALATION_RESPONSE'             THEN '/admin/escalations'
    WHEN 'ENFORCEMENT_REFERRAL_REVIEW'     THEN '/enforcement/' || s.source_id::text
    WHEN 'APPLICATION_ASSESSMENT'          THEN '/licensing/applications/' || s.source_id::text
    WHEN 'COMPLAINT_HANDLING'              THEN '/complaints/' || s.source_id::text
    WHEN 'COMPLAINT_INVESTIGATION_TASK'    THEN '/complaints'
    WHEN 'PROVIDER_SUBMISSION_ACCEPTANCE'  THEN '/admin/people-access?provider_package=' || s.source_id::text
    ELSE '/my-work' END                                         AS route,
  wt.sort_order
FROM public.supervisory_work_item_source s
JOIN public.supervisory_work_type wt ON wt.code = s.work_type AND wt.is_active
LEFT JOIN public.supervisory_work_assignment asg
       ON asg.work_key = s.work_type || ':' || s.source_id::text
LEFT JOIN public.licensees l ON l.id = s.entity_id;
