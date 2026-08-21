CREATE OR REPLACE FUNCTION public.prudential_assessment_case(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH a AS (
  SELECT a.*, l.name AS entity_name, l.sector_id
    FROM public.prudential_assessments a
    JOIN public.licensees l ON l.id = a.entity_id
   WHERE a.id = _assessment_id
),
gaps AS (
  SELECT coalesce(public.prudential_assessment_finalisation_gaps(_assessment_id), ARRAY[]::text[]) AS codes
),
asg AS (
  SELECT supervisor_id, supervisor_name, team
    FROM public.entity_supervision_assignments
   WHERE entity_id = (SELECT entity_id FROM a) AND status = 'active'
   ORDER BY effective_from DESC NULLS LAST LIMIT 1
),
sla AS (
  SELECT sla_days, due_soon_days FROM public.prudential_process_sla_config WHERE work_item_type = 'ASSESSMENT'
),
hdr AS (
  SELECT
    a.*,
    coalesce(a.submitted_at, a.created_at) + make_interval(days => (SELECT sla_days FROM sla)) AS sla_due_at,
    (SELECT codes FROM gaps) AS gap_codes
  FROM a
),
blockers AS (
  SELECT coalesce(jsonb_agg(b), '[]'::jsonb) AS list FROM (
    SELECT jsonb_build_object('code','component_rating_missing',
                              'label','Record a component rating for ' || c,
                              'href','/prudential/assessments/' || _assessment_id::text || '?section=risk') AS b
      FROM unnest((SELECT gap_codes FROM hdr)) AS c
     WHERE (SELECT status FROM hdr) IN ('draft','returned_for_revision')
    UNION ALL
    SELECT jsonb_build_object('code','rationale_required','label','Record the assessment rationale',
                              'href','/prudential/assessments/' || _assessment_id::text || '?section=risk')
     WHERE (SELECT status FROM hdr) IN ('draft','returned_for_revision')
       AND coalesce(btrim((SELECT rationale FROM hdr)), '') = ''
  ) s
),
filing AS (
  SELECT jsonb_build_object(
           'return_filing_id', f.id,
           'filing_reference', f.filing_reference,
           'status', f.status,
           'period_label', rp.period_label,
           'period_end', rp.period_end,
           'accepted_version_id', f.accepted_version_id,
           'accepted_version_number', av.version_number,
           'accepted_at', f.accepted_at,
           'href', '/returns/filings/' || f.id::text
         ) AS obj
    FROM public.return_filings f
    LEFT JOIN public.reporting_periods rp ON rp.id = f.reporting_period_id
    LEFT JOIN public.return_filing_versions av ON av.id = f.accepted_version_id
   WHERE f.id = (SELECT return_filing_id FROM hdr)
),
linked_actions AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', pa.id, 'reference', pa.action_reference, 'title', pa.title,
           'status', pa.status, 'severity', pa.severity, 'due_date', pa.due_date,
           'href', '/prudential/actions?action=' || pa.id::text
         ) ORDER BY pa.created_at DESC), '[]'::jsonb) AS list
    FROM public.prudential_actions pa
   WHERE pa.source_type = 'assessment' AND pa.source_id = _assessment_id
),
related AS (
  SELECT coalesce(jsonb_agg(r), '[]'::jsonb) AS list FROM (
    SELECT jsonb_build_object('kind','return_filing', 'label', coalesce(f.filing_reference, 'Return filing'),
                              'detail', rp.period_label, 'href', '/returns/filings/' || f.id::text) AS r
      FROM public.return_filings f
      LEFT JOIN public.reporting_periods rp ON rp.id = f.reporting_period_id
     WHERE f.id = (SELECT return_filing_id FROM hdr)
    UNION ALL
    SELECT jsonb_build_object('kind','signal','label', 'Breach · ' || b.metric_key,
                              'detail', b.period_label, 'href', '/supervision/breaches?breach=' || b.id::text)
      FROM public.v_prudential_current_breaches b
     WHERE b.entity_id = (SELECT entity_id FROM hdr)
       AND (b.return_filing_id = (SELECT return_filing_id FROM hdr) OR (SELECT return_filing_id FROM hdr) IS NULL)
    UNION ALL
    SELECT jsonb_build_object('kind','supervisory_action','label', pa.action_reference || ' · ' || pa.title,
                              'detail', pa.status, 'href', '/prudential/actions?action=' || pa.id::text)
      FROM public.prudential_actions pa
     WHERE pa.source_type = 'assessment' AND pa.source_id = _assessment_id
    UNION ALL
    SELECT jsonb_build_object('kind','escalation','label', 'Escalation · ' || x.escalation_type,
                              'detail', x.status, 'href', '/prudential/escalations?escalation=' || x.id::text)
      FROM public.prudential_escalations x
     WHERE x.related_type = 'assessment' AND x.related_id = _assessment_id
    UNION ALL
    SELECT jsonb_build_object('kind','examination','label', ex.reference || ' · ' || ex.title,
                              'detail', ex.stage, 'href', '/prudential/examinations/' || ex.id::text)
      FROM public.examinations ex
     WHERE ex.entity_id = (SELECT entity_id FROM hdr) AND ex.closed_at IS NULL
    UNION ALL
    SELECT jsonb_build_object('kind','correspondence','label', coalesce(t.reference, t.subject),
                              'detail', t.status, 'href', '/correspondence/' || t.id::text)
      FROM public.correspondence_threads t
     WHERE t.licensee_id = (SELECT entity_id FROM hdr)
       AND coalesce(t.module, '') IN ('prudential','prudential_supervision')
  ) s
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM hdr) THEN jsonb_build_object('found', false)
ELSE (
  SELECT jsonb_build_object(
    'found', true,
    'generated_at', now(),
    'header', jsonb_build_object(
      'reference', 'PA-ASMT-' || substr(h.id::text, 1, 8),
      'subject', h.entity_name,
      'entity_id', h.entity_id,
      'entity_href', '/entities/' || h.entity_id::text || '?view=prudential',
      'assessment_type', 'CAMELS prudential assessment',
      'period_start', h.period_start,
      'period_end', h.period_end,
      'stage', CASE h.status
                 WHEN 'draft' THEN 'DATA_REVIEW'
                 WHEN 'returned_for_revision' THEN 'RISK_ASSESSMENT'
                 WHEN 'submitted' THEN 'SUPERVISORY_REVIEW'
                 WHEN 'reviewed' THEN 'DECISION'
                 WHEN 'approved' THEN 'ACTION_MONITORING'
                 ELSE 'CLOSED' END,
      'stage_label', CASE h.status
                 WHEN 'draft' THEN 'Data review'
                 WHEN 'returned_for_revision' THEN 'Risk assessment (revision)'
                 WHEN 'submitted' THEN 'Supervisory review'
                 WHEN 'reviewed' THEN 'Decision'
                 WHEN 'approved' THEN 'Action monitoring'
                 ELSE 'Closed' END,
      'status', h.status,
      'status_label', initcap(replace(h.status, '_', ' ')),
      'overall_rating', h.overall_rating,
      'owner_user_id', coalesce(h.reviewed_by, h.created_by, (SELECT supervisor_id FROM asg)),
      'owner_name', coalesce((SELECT full_name FROM public.profiles WHERE id = coalesce(h.reviewed_by, h.created_by)),
                             (SELECT supervisor_name FROM asg)),
      'team', (SELECT team FROM asg),
      'priority', CASE WHEN h.overall_rating ~ '^[45]' THEN 'high'
                       WHEN h.sla_due_at < now() THEN 'high' ELSE 'medium' END,
      'sla_due_at', h.sla_due_at,
      'sla_state', CASE WHEN h.status IN ('approved','closed') THEN 'paused'
                        WHEN h.sla_due_at < now() THEN 'breached'
                        WHEN h.sla_due_at < now() + make_interval(days => (SELECT due_soon_days FROM sla)) THEN 'due_soon'
                        ELSE 'on_track' END,
      'waiting_on', 'regulator',
      'last_activity_at', h.updated_at
    ),
    'blockers', (SELECT list FROM blockers),
    'filing', (SELECT obj FROM filing),
    'linked_actions', (SELECT list FROM linked_actions),
    /*
     * EPR-02 §6 — supervisory rating policy is server-owned. No configured
     * rating methodology exists on this platform, so the read model reports
     * that there is NO automated rating suggestion rather than inventing one.
     * The human rating remains governed by the assessment process.
     */
    'rating_guidance', jsonb_build_object(
      'has_methodology', false,
      'suggested_rating', NULL,
      'basis', NULL,
      'message', 'NO AUTOMATED RATING SUGGESTION',
      'detail', 'No configured supervisory rating methodology exists. The overall rating is a human-governed determination recorded against the component ratings and rationale.'
    ),
    'evidence', jsonb_build_object(
      'return_filing_id', h.return_filing_id,
      'return_filing_version_id', h.return_filing_version_id,
      'available', h.return_filing_id IS NOT NULL
    ),
    'available_actions', (
      CASE h.status
        WHEN 'draft' THEN jsonb_build_array(jsonb_build_object(
          'code','submit','label','Submit for review','to_status','submitted',
          'requires_reason', false, 'permission','prudential_supervision.workflow_action',
          'enabled', jsonb_array_length((SELECT list FROM blockers)) = 0))
        WHEN 'returned_for_revision' THEN jsonb_build_array(jsonb_build_object(
          'code','resubmit','label','Resubmit for review','to_status','submitted',
          'requires_reason', false, 'permission','prudential_supervision.workflow_action',
          'enabled', jsonb_array_length((SELECT list FROM blockers)) = 0))
        WHEN 'submitted' THEN jsonb_build_array(
          jsonb_build_object('code','review','label','Mark reviewed','to_status','reviewed',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true),
          jsonb_build_object('code','return','label','Return for revision','to_status','returned_for_revision',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true))
        WHEN 'reviewed' THEN jsonb_build_array(
          jsonb_build_object('code','approve','label','Approve assessment','to_status','approved',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true),
          jsonb_build_object('code','return','label','Return for revision','to_status','returned_for_revision',
            'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true))
        WHEN 'approved' THEN jsonb_build_array(jsonb_build_object(
          'code','close','label','Close assessment','to_status','closed',
          'requires_reason', true, 'permission','prudential_supervision.workflow_action','enabled', true))
        ELSE '[]'::jsonb END),
    'next_action', CASE h.status
        WHEN 'draft' THEN jsonb_build_object('code','submit','label','Complete and submit the assessment')
        WHEN 'returned_for_revision' THEN jsonb_build_object('code','resubmit','label','Address review comments and resubmit')
        WHEN 'submitted' THEN jsonb_build_object('code','review','label','Review the assessment')
        WHEN 'reviewed' THEN jsonb_build_object('code','approve','label','Take the approval decision')
        WHEN 'approved' THEN jsonb_build_object('code','monitor','label','Monitor the resulting supervisory actions')
        ELSE jsonb_build_object('code','none','label','No further action required') END,
    'completed_steps', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'at', s.at)), '[]'::jsonb)
        FROM (
          SELECT 'Assessment opened' AS label, h.created_at AS at
          UNION ALL SELECT 'Submitted for review', h.submitted_at WHERE h.submitted_at IS NOT NULL
          UNION ALL SELECT 'Supervisory review recorded', h.reviewed_at WHERE h.reviewed_at IS NOT NULL
          UNION ALL SELECT 'Approved', h.approved_at WHERE h.approved_at IS NOT NULL
          UNION ALL SELECT 'Closed', h.closed_at WHERE h.closed_at IS NOT NULL
        ) s
    ),
    'review_notes', h.review_notes,
    'related_cases', (SELECT list FROM related)
  )
  FROM hdr h
) END;
$function$;