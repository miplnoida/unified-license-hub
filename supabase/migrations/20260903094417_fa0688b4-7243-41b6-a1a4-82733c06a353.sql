CREATE OR REPLACE VIEW public.supervisory_work_item AS
SELECT (s.work_type || ':'::text) || s.source_id::text AS work_key,
    s.work_type,
    wt.label AS work_type_label,
    wt.decision_point,
    s.source_object,
    s.source_id,
    s.reference,
    s.title,
    s.domain_code,
    s.entity_id,
    l.name AS entity_name,
    s.source_status,
    s.work_state,
    s.opened_at,
    s.due_date,
    s.due_date IS NOT NULL AND s.due_date < CURRENT_DATE AS is_overdue,
    s.due_date IS NOT NULL AND s.due_date >= CURRENT_DATE AND s.due_date <= (CURRENT_DATE + '7 days'::interval) AS is_due_soon,
        CASE upper(COALESCE(s.raw_priority, ''::text))
            WHEN 'CRITICAL'::text THEN 'CRITICAL'::text
            WHEN 'SEVERE'::text THEN 'CRITICAL'::text
            WHEN 'URGENT'::text THEN 'CRITICAL'::text
            WHEN 'HIGH'::text THEN 'HIGH'::text
            WHEN 'MEDIUM'::text THEN 'MEDIUM'::text
            WHEN 'MODERATE'::text THEN 'MEDIUM'::text
            WHEN 'NORMAL'::text THEN 'MEDIUM'::text
            WHEN 'LOW'::text THEN 'LOW'::text
            WHEN 'ROUTINE'::text THEN 'ROUTINE'::text
            ELSE 'MEDIUM'::text
        END AS priority,
    s.maker_id,
    s.owner_id AS record_owner_id,
    s.team_id AS record_team_id,
    COALESCE(asg.assigned_to, s.owner_id) AS effective_owner_id,
    COALESCE(asg.assigned_team, s.team_id) AS effective_team_id,
    COALESCE(asg.assigned_to, s.owner_id) IS NULL AND COALESCE(asg.assigned_team, s.team_id) IS NULL AS is_unassigned,
    asg.assigned_to AS overlay_assigned_to,
    asg.assigned_team AS overlay_assigned_team,
    asg.note AS assignment_note,
        CASE s.work_type
            WHEN 'ASSESSMENT_DRAFTING'::text THEN
            CASE
                WHEN s.domain_code = 'AML_CFT'::text THEN '/supervision/aml/assessments/'::text || s.source_id::text
                ELSE '/prudential/assessments/'::text || s.source_id::text
            END
            WHEN 'ASSESSMENT_APPROVAL'::text THEN
            CASE
                WHEN s.domain_code = 'AML_CFT'::text THEN '/supervision/aml/assessments/'::text || s.source_id::text
                ELSE '/prudential/assessments/'::text || s.source_id::text
            END
            WHEN 'ATTENTION_PRIORITY_CONFIRMATION'::text THEN '/conduct/attention/'::text || s.source_id::text
            WHEN 'ATTENTION_DISPOSITION'::text THEN '/conduct/attention/'::text || s.source_id::text
            WHEN 'PLAN_APPROVAL'::text THEN '/conduct/plans/'::text || s.source_id::text
            WHEN 'PLAN_ITEM_DELIVERY'::text THEN '/conduct/plans/'::text || s.source_id::text
            WHEN 'INTERVENTION_DECISION'::text THEN '/conduct/interventions/'::text || s.source_id::text
            WHEN 'INTERVENTION_DELIVERY'::text THEN '/conduct/interventions/'::text || s.source_id::text
            WHEN 'EXAMINATION_STAGE_DECISION'::text THEN '/supervision/examinations/'::text || s.source_id::text
            WHEN 'EXAMINATION_DATA_REQUEST'::text THEN '/supervision/examinations/'::text || s.source_id::text
            WHEN 'FINDING_ISSUANCE'::text THEN '/supervision/findings/'::text || s.source_id::text
            WHEN 'FINDING_RESPONSE_REVIEW'::text THEN '/supervision/findings/'::text || s.source_id::text
            WHEN 'REMEDIATION_DECISION'::text THEN COALESCE('/supervision/findings/' || ra.finding_id::text || '?action=' || s.source_id::text, '/my-work'::text)
            WHEN 'REMEDIATION_DELIVERY'::text THEN COALESCE('/supervision/findings/' || ra.finding_id::text || '?action=' || s.source_id::text, '/my-work'::text)
            WHEN 'REASSESSMENT_FULFILMENT'::text THEN
            CASE
                WHEN s.entity_id IS NOT NULL THEN '/entities/'::text || s.entity_id::text
                ELSE '/my-work'::text
            END
            WHEN 'ESCALATION_RESPONSE'::text THEN '/admin/escalations'::text
            WHEN 'ENFORCEMENT_REFERRAL_REVIEW'::text THEN '/enforcement/'::text || s.source_id::text
            WHEN 'APPLICATION_ASSESSMENT'::text THEN '/licensing/applications/'::text || s.source_id::text
            WHEN 'COMPLAINT_HANDLING'::text THEN '/complaints/'::text || s.source_id::text
            WHEN 'COMPLAINT_INVESTIGATION_TASK'::text THEN '/complaints'::text
            WHEN 'PROVIDER_SUBMISSION_ACCEPTANCE'::text THEN '/admin/people-access?provider_package='::text || s.source_id::text
            ELSE '/my-work'::text
        END AS route,
    wt.sort_order
   FROM supervisory_work_item_source s
     JOIN supervisory_work_type wt ON wt.code = s.work_type AND wt.is_active
     LEFT JOIN supervisory_work_assignment asg ON asg.work_key = ((s.work_type || ':'::text) || s.source_id::text)
     LEFT JOIN licensees l ON l.id = s.entity_id
     LEFT JOIN supervisory_remediation_action ra
            ON s.work_type IN ('REMEDIATION_DECISION','REMEDIATION_DELIVERY')
           AND ra.id = s.source_id;

GRANT SELECT ON public.supervisory_work_item TO authenticated;
GRANT ALL ON public.supervisory_work_item TO service_role;