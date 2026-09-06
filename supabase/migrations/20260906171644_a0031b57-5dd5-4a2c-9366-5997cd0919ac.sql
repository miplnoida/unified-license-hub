-- OS-02F — Supervisory Management Assurance & Control: derivation + read models.

CREATE OR REPLACE FUNCTION public.supervisory_assurance_policy_effective(_domain text)
RETURNS TABLE (
  policy_id uuid, code text, name text, domain_code text, config_owner text,
  awaiting_review_tolerance_days integer, stale_activity_tolerance_days integer,
  repeat_occurrence_threshold integer, repeat_distinct_day_threshold integer,
  material_severities text[], version integer, effective_from date,
  resolution text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.id, p.code, p.name, p.domain_code, p.config_owner,
         p.awaiting_review_tolerance_days, p.stale_activity_tolerance_days,
         p.repeat_occurrence_threshold, p.repeat_distinct_day_threshold,
         p.material_severities, p.version, p.effective_from,
         CASE WHEN p.domain_code IS NOT NULL THEN 'DOMAIN_SPECIFIC_POLICY'
              ELSE 'GLOBAL_POLICY' END
    FROM public.supervisory_assurance_policy p
   WHERE p.is_active
     AND p.effective_from <= CURRENT_DATE
     AND (p.effective_to IS NULL OR p.effective_to > CURRENT_DATE)
     AND (p.domain_code IS NULL OR p.domain_code = _domain)
   ORDER BY (p.domain_code IS NOT NULL) DESC, p.effective_from DESC, p.version DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.supervisory_assurance_policy_effective(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_assurance_policy_effective(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Canonical derivation. Reads only; RLS of the caller applies (security_invoker).
-- ---------------------------------------------------------------------------
CREATE VIEW public.supervisory_management_assurance_matter
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    s.id AS signal_id, s.entity_id, l.name AS entity_name, s.domain_code,
    s.detector_code, s.source_kind, s.severity, s.summary, s.state AS condition_state,
    s.first_detected_at, s.last_detected_at, s.occurrence_count,
    s.observed_value, s.threshold_value, s.comparator, s.materiality_reason,
    s.source_table, s.source_id, s.source_reference, s.config_provenance,
    s.resolved_at, s.resolution_reason,
    (s.severity = ANY (p.material_severities)) AS is_material,
    p.policy_id, p.code AS policy_code, p.version AS policy_version,
    p.config_owner AS policy_owner, p.resolution AS policy_resolution,
    p.awaiting_review_tolerance_days, p.stale_activity_tolerance_days,
    p.repeat_occurrence_threshold, p.repeat_distinct_day_threshold,
    own.lead_supervisor_id AS owner_id, own.lead_supervisor_name AS owner_name,
    own.team_id AS owner_team_id, own.team_name AS owner_team_name,
    own.assignment_id AS ownership_assignment_id, own.assignment_scope AS ownership_scope,
    rv.id AS review_id, rv.reviewed_by, prv.full_name AS reviewed_by_name,
    rv.reviewed_at, rv.review_note, rv.disposition, rv.disposition_rationale,
    rv.disposition_by, rv.disposition_at, rv.linked_module AS disposition_module,
    rv.linked_record_id AS disposition_record_id,
    rv.linked_reference AS disposition_reference,
    occ.occurrence_total, occ.occurrence_days, occ.last_occurrence_at,
    -- canonical supervisory responses linked to this condition
    att.id AS attention_id, att.reference AS attention_reference, att.status AS attention_status,
    att.created_at AS attention_opened_at, att.target_review_date AS attention_due,
    att.closed_at AS attention_closed_at, att.updated_at AS attention_activity_at,
    att.owner_id AS attention_owner_id, att.team_id AS attention_team_id,
    fnd.id AS finding_id, fnd.reference AS finding_reference, fnd.status AS finding_status,
    fnd.issued_at AS finding_opened_at, fnd.due_date AS finding_due,
    fnd.closed_at AS finding_closed_at, fnd.updated_at AS finding_activity_at,
    fnd.owner_id AS finding_owner_id, fnd.team_id AS finding_team_id,
    rem.id AS remediation_id, rem.reference AS remediation_reference,
    rem.status AS remediation_status, rem.created_at AS remediation_opened_at,
    rem.target_date AS remediation_due, rem.closed_at AS remediation_closed_at,
    rem.updated_at AS remediation_activity_at, rem.owner_id AS remediation_owner_id,
    rr.id AS reassessment_id, rr.status AS reassessment_status,
    rr.created_at AS reassessment_opened_at, rr.due_date AS reassessment_due,
    rr.fulfilled_at AS reassessment_fulfilled_at, rr.updated_at AS reassessment_activity_at,
    rr.owner_id AS reassessment_owner_id, rr.team_id AS reassessment_team_id,
    ent_rr.id AS entity_reassessment_id, ent_rr.status AS entity_reassessment_status,
    ent_rr.created_at AS entity_reassessment_requested_at,
    asm.id AS assessment_id, asm.reference AS assessment_reference,
    asm.approved_at AS assessment_approved_at, asm.overall_rating AS assessment_rating,
    asm.next_review_date AS assessment_next_review
  FROM public.supervisory_signal s
  LEFT JOIN public.licensees l ON l.id = s.entity_id
  LEFT JOIN LATERAL public.supervisory_assurance_policy_effective(s.domain_code) p ON true
  LEFT JOIN LATERAL public.supervisory_domain_assignment(s.entity_id, s.domain_code) own ON true
  LEFT JOIN LATERAL (
    SELECT r.* FROM public.supervisory_signal_review r
     WHERE r.signal_id = s.id ORDER BY r.reviewed_at DESC LIMIT 1) rv ON true
  LEFT JOIN public.profiles prv ON prv.id = rv.reviewed_by
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS occurrence_total,
           count(DISTINCT ((o.observed_at AT TIME ZONE 'UTC')::date))::int AS occurrence_days,
           max(o.observed_at) AS last_occurrence_at
      FROM public.supervisory_signal_occurrence o WHERE o.signal_id = s.id) occ ON true
  LEFT JOIN LATERAL (
    SELECT a.* FROM public.supervisory_attention a
      JOIN public.supervisory_attention_origin o
        ON o.attention_id = a.id AND o.signal_id = s.id
     ORDER BY a.created_at DESC LIMIT 1) att ON true
  LEFT JOIN LATERAL (
    SELECT f.* FROM public.supervisory_finding f
     WHERE f.signal_id = s.id ORDER BY f.created_at DESC LIMIT 1) fnd ON true
  LEFT JOIN LATERAL (
    SELECT ra.* FROM public.supervisory_remediation_action ra
     WHERE ra.finding_id = fnd.id ORDER BY ra.created_at DESC LIMIT 1) rem ON true
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.supervisory_reassessment_requirement x
     WHERE x.signal_id = s.id ORDER BY x.created_at DESC LIMIT 1) rr ON true
  LEFT JOIN LATERAL (
    SELECT x.* FROM public.supervisory_reassessment_requirement x
     WHERE x.entity_id = s.entity_id AND x.domain_code = s.domain_code
       AND x.status = 'REQUIRED' ORDER BY x.created_at DESC LIMIT 1) ent_rr ON true
  LEFT JOIN LATERAL (
    SELECT a.* FROM public.supervisory_assessment a
     WHERE a.entity_id = s.entity_id AND a.domain_code = s.domain_code
       AND a.status = 'approved'
     ORDER BY COALESCE(a.approved_at, a.assessment_date::timestamptz) DESC NULLS LAST
     LIMIT 1) asm ON true
  WHERE s.detector_code IS NOT NULL
    AND public.supervisory_monitoring_scope_admits(
          auth.uid(), s.domain_code, s.entity_id, NULL, NULL)
), act AS (
  SELECT b.*,
    CASE WHEN b.remediation_id IS NOT NULL THEN 'REMEDIATION'
         WHEN b.finding_id IS NOT NULL THEN 'FINDING'
         WHEN b.attention_id IS NOT NULL THEN 'SUPERVISORY_ATTENTION'
         WHEN b.reassessment_id IS NOT NULL THEN 'REASSESSMENT_REQUIREMENT'
    END AS action_type,
    COALESCE(b.remediation_id, b.finding_id, b.attention_id, b.reassessment_id) AS action_record_id,
    CASE WHEN b.remediation_id IS NOT NULL THEN 'supervisory_remediation_action'
         WHEN b.finding_id IS NOT NULL THEN 'supervisory_finding'
         WHEN b.attention_id IS NOT NULL THEN 'supervisory_attention'
         WHEN b.reassessment_id IS NOT NULL THEN 'supervisory_reassessment_requirement'
    END AS action_source_table,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_reference
         WHEN b.finding_id IS NOT NULL THEN b.finding_reference
         WHEN b.attention_id IS NOT NULL THEN b.attention_reference
    END AS action_reference,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_status
         WHEN b.finding_id IS NOT NULL THEN b.finding_status
         WHEN b.attention_id IS NOT NULL THEN b.attention_status
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_status
    END AS action_status,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_opened_at
         WHEN b.finding_id IS NOT NULL THEN COALESCE(b.finding_opened_at, b.finding_activity_at)
         WHEN b.attention_id IS NOT NULL THEN b.attention_opened_at
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_opened_at
    END AS action_opened_at,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_due
         WHEN b.finding_id IS NOT NULL THEN b.finding_due
         WHEN b.attention_id IS NOT NULL THEN b.attention_due
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_due
    END AS action_due_date,
    CASE WHEN b.remediation_id IS NOT NULL AND b.remediation_due IS NOT NULL
              THEN 'supervisory_remediation_action.target_date'
         WHEN b.finding_id IS NOT NULL AND b.finding_due IS NOT NULL
              THEN 'supervisory_finding.due_date'
         WHEN b.attention_id IS NOT NULL AND b.attention_due IS NOT NULL
              THEN 'supervisory_attention.target_review_date'
         WHEN b.reassessment_id IS NOT NULL AND b.reassessment_due IS NOT NULL
              THEN 'supervisory_reassessment_requirement.due_date'
         WHEN b.remediation_id IS NOT NULL OR b.finding_id IS NOT NULL
              OR b.attention_id IS NOT NULL OR b.reassessment_id IS NOT NULL
              THEN 'NO_CANONICAL_DUE_DATE_RECORDED'
    END AS due_date_source,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_closed_at
         WHEN b.finding_id IS NOT NULL THEN b.finding_closed_at
         WHEN b.attention_id IS NOT NULL THEN b.attention_closed_at
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_fulfilled_at
    END AS action_closed_at,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_activity_at
         WHEN b.finding_id IS NOT NULL THEN b.finding_activity_at
         WHEN b.attention_id IS NOT NULL THEN b.attention_activity_at
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_activity_at
    END AS action_activity_at,
    CASE WHEN b.remediation_id IS NOT NULL THEN b.remediation_owner_id
         WHEN b.finding_id IS NOT NULL THEN b.finding_owner_id
         WHEN b.attention_id IS NOT NULL THEN b.attention_owner_id
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_owner_id
    END AS action_owner_id,
    CASE WHEN b.finding_id IS NOT NULL THEN b.finding_team_id
         WHEN b.attention_id IS NOT NULL THEN b.attention_team_id
         WHEN b.reassessment_id IS NOT NULL THEN b.reassessment_team_id
    END AS action_team_id,
    CASE WHEN b.remediation_id IS NOT NULL
              THEN (b.remediation_closed_at IS NULL
                    AND b.remediation_status NOT IN ('CLOSED','EFFECTIVE'))
         WHEN b.finding_id IS NOT NULL
              THEN (b.finding_closed_at IS NULL AND b.finding_status <> 'CLOSED')
         WHEN b.attention_id IS NOT NULL
              THEN (b.attention_closed_at IS NULL
                    AND b.attention_status NOT IN ('CLOSED','DISMISSED'))
         WHEN b.reassessment_id IS NOT NULL
              THEN (b.reassessment_status = 'REQUIRED')
         ELSE false
    END AS action_is_open
  FROM base b
), der AS (
  SELECT a.*,
    (current_date - (a.first_detected_at AT TIME ZONE 'UTC')::date) AS age_days,
    GREATEST(a.reviewed_at, a.disposition_at, a.action_opened_at,
             a.action_activity_at, a.action_closed_at) AS last_activity_at,
    (a.reviewed_at IS NOT NULL) AS is_reviewed,
    (a.reviewed_at IS NOT NULL AND a.last_occurrence_at > a.reviewed_at) AS recurred_after_review,
    (a.action_opened_at IS NOT NULL
      AND a.last_occurrence_at > a.action_opened_at) AS recurred_after_action_opened,
    (a.action_closed_at IS NOT NULL
      AND (a.condition_state = 'OPEN' OR a.last_occurrence_at > a.action_closed_at))
      AS persists_after_action_closed
  FROM act a
), fin AS (
  SELECT d.*,
    CASE WHEN d.last_activity_at IS NOT NULL
         THEN (current_date - (d.last_activity_at AT TIME ZONE 'UTC')::date)
    END AS days_since_supervisory_activity,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN d.condition_state = 'OPEN' AND d.is_material AND NOT d.is_reviewed
           THEN 'MATERIAL_AWAITING_REVIEW' END,
      CASE WHEN d.condition_state = 'OPEN' AND d.is_material AND NOT d.is_reviewed
                AND (current_date - (d.first_detected_at AT TIME ZONE 'UTC')::date)
                    > d.awaiting_review_tolerance_days
           THEN 'AWAITING_REVIEW_BEYOND_TOLERANCE' END,
      CASE WHEN d.is_reviewed AND d.disposition IS NULL AND NOT d.action_is_open
           THEN 'REVIEWED_NO_DISPOSITION' END,
      CASE WHEN ((d.condition_state = 'OPEN' AND d.is_material) OR d.action_is_open)
                AND d.owner_id IS NULL AND d.owner_team_id IS NULL
                AND d.action_owner_id IS NULL AND d.action_team_id IS NULL
           THEN 'UNOWNED_MATTER' END,
      CASE WHEN d.action_is_open AND d.action_due_date IS NOT NULL
                AND d.action_due_date < current_date
           THEN 'RESPONSE_OVERDUE' END,
      CASE WHEN (d.condition_state = 'OPEN' OR d.action_is_open)
                AND d.action_due_date IS NULL
                AND d.last_activity_at IS NOT NULL
                AND (current_date - (d.last_activity_at AT TIME ZONE 'UTC')::date)
                    > d.stale_activity_tolerance_days
           THEN 'RESPONSE_STALE' END,
      CASE WHEN d.occurrence_total >= d.repeat_occurrence_threshold
                AND d.occurrence_days >= d.repeat_distinct_day_threshold
           THEN 'REPEATED_CONDITION' END,
      CASE WHEN d.recurred_after_review THEN 'RECURRENCE_AFTER_REVIEW' END,
      CASE WHEN d.recurred_after_action_opened OR d.persists_after_action_closed
           THEN 'RECURRENCE_AFTER_ACTION' END,
      CASE WHEN d.condition_state = 'RESOLVED' AND d.action_is_open
           THEN 'CONDITION_RESOLVED_ACTION_OPEN' END,
      CASE WHEN d.persists_after_action_closed
           THEN 'ACTION_CLOSED_CONDITION_PERSISTS' END,
      CASE WHEN d.entity_reassessment_id IS NOT NULL
                AND (d.assessment_approved_at IS NULL
                     OR d.assessment_approved_at < d.entity_reassessment_requested_at)
           THEN 'ASSESSMENT_POTENTIALLY_STALE' END,
      CASE WHEN d.source_table IS NULL OR d.source_id IS NULL
                OR (d.disposition IN ('ACTION_OPENED','REASSESSMENT_REQUIRED',
                                      'COVERED_BY_EXISTING_ACTION')
                    AND d.disposition_record_id IS NULL)
                OR (d.policy_id IS NULL)
           THEN 'MISSING_TRACEABILITY' END
    ], NULL) AS assurance_conditions
  FROM der d
)
SELECT f.*,
  CASE
    WHEN 'MATERIAL_AWAITING_REVIEW' = ANY (f.assurance_conditions)
      THEN format('%s-severity %s condition first observed %s day(s) ago has not yet been reviewed by a supervisor.',
             initcap(COALESCE(f.severity,'unrated')), replace(f.domain_code,'_',' '),
             (current_date - (f.first_detected_at AT TIME ZONE 'UTC')::date))
    WHEN 'ACTION_CLOSED_CONDITION_PERSISTS' = ANY (f.assurance_conditions)
      THEN format('%s %s was closed on %s but the condition has been observed since.',
             COALESCE(f.action_type,'Supervisory response'),
             COALESCE(f.action_reference,''), (f.action_closed_at AT TIME ZONE 'UTC')::date)
    WHEN 'RESPONSE_OVERDUE' = ANY (f.assurance_conditions)
      THEN format('%s %s is %s day(s) past its recorded due date (%s).',
             COALESCE(f.action_type,'Supervisory response'), COALESCE(f.action_reference,''),
             (current_date - f.action_due_date), f.due_date_source)
    WHEN 'RECURRENCE_AFTER_ACTION' = ANY (f.assurance_conditions)
      THEN format('Condition has occurred %s time(s) and was observed again after %s %s was opened.',
             f.occurrence_total, COALESCE(f.action_type,'the supervisory response'),
             COALESCE(f.action_reference,''))
    WHEN 'RECURRENCE_AFTER_REVIEW' = ANY (f.assurance_conditions)
      THEN format('Condition was reviewed on %s and has been observed again since.',
             (f.reviewed_at AT TIME ZONE 'UTC')::date)
    WHEN 'REVIEWED_NO_DISPOSITION' = ANY (f.assurance_conditions)
      THEN format('Reviewed on %s but no supervisory disposition has been recorded.',
             (f.reviewed_at AT TIME ZONE 'UTC')::date)
    WHEN 'CONDITION_RESOLVED_ACTION_OPEN' = ANY (f.assurance_conditions)
      THEN format('Condition resolved on %s while %s %s remains open — confirm the response should continue.',
             (f.resolved_at AT TIME ZONE 'UTC')::date,
             COALESCE(f.action_type,'a supervisory response'), COALESCE(f.action_reference,''))
    WHEN 'UNOWNED_MATTER' = ANY (f.assurance_conditions)
      THEN 'No accountable supervisor or team is assigned for this domain on this entity.'
    WHEN 'RESPONSE_STALE' = ANY (f.assurance_conditions)
      THEN format('No supervisory activity for %s day(s), beyond the %s-day governed tolerance (%s v%s).',
             (current_date - (f.last_activity_at AT TIME ZONE 'UTC')::date),
             f.stale_activity_tolerance_days, f.policy_code, f.policy_version)
    WHEN 'ASSESSMENT_POTENTIALLY_STALE' = ANY (f.assurance_conditions)
      THEN 'A reassessment has been required but no subsequently approved assessment exists.'
    WHEN 'REPEATED_CONDITION' = ANY (f.assurance_conditions)
      THEN format('The same condition has been observed %s time(s) on %s separate day(s).',
             f.occurrence_total, f.occurrence_days)
    WHEN 'MISSING_TRACEABILITY' = ANY (f.assurance_conditions)
      THEN 'The assurance trail from condition to supervisory decision and action is incomplete.'
    ELSE 'No management assurance exception derived for this matter.'
  END AS assurance_explanation,
  jsonb_strip_nulls(jsonb_build_object(
    'condition', jsonb_build_object('table','supervisory_signal','id',f.signal_id,
        'detector_code',f.detector_code,'state',f.condition_state,
        'fingerprint_identity','detector_code:entity_id:domain_code:condition_key'),
    'source_record', jsonb_build_object('table',f.source_table,'id',f.source_id,
        'reference',f.source_reference),
    'occurrences', jsonb_build_object('table','supervisory_signal_occurrence',
        'total',f.occurrence_total,'distinct_days',f.occurrence_days,
        'first_observed',f.first_detected_at,'last_observed',f.last_occurrence_at),
    'review', CASE WHEN f.review_id IS NULL THEN NULL ELSE jsonb_build_object(
        'table','supervisory_signal_review','id',f.review_id,
        'reviewed_by',f.reviewed_by,'reviewed_at',f.reviewed_at,
        'disposition',f.disposition,'disposition_rationale',f.disposition_rationale,
        'disposition_by',f.disposition_by,'disposition_at',f.disposition_at) END,
    'action', CASE WHEN f.action_record_id IS NULL THEN NULL ELSE jsonb_build_object(
        'table',f.action_source_table,'id',f.action_record_id,'type',f.action_type,
        'reference',f.action_reference,'status',f.action_status,
        'opened_at',f.action_opened_at,'due_date',f.action_due_date,
        'due_date_source',f.due_date_source,'closed_at',f.action_closed_at,
        'is_open',f.action_is_open) END,
    'ownership', jsonb_build_object('source','entity_supervision_assignments',
        'resolver','supervisory_domain_assignment','assignment_id',f.ownership_assignment_id,
        'scope',f.ownership_scope,'owner_id',f.owner_id,'team_id',f.owner_team_id),
    'assessment', jsonb_build_object('table','supervisory_assessment','id',f.assessment_id,
        'reference',f.assessment_reference,'approved_at',f.assessment_approved_at,
        'reassessment_requirement_id',f.entity_reassessment_id,
        'reassessment_status',f.entity_reassessment_status),
    'timeliness', jsonb_build_object('due_date_source',f.due_date_source,
        'age_days',f.age_days,'days_since_activity',f.days_since_supervisory_activity,
        'policy', jsonb_build_object('table','supervisory_assurance_policy',
           'id',f.policy_id,'code',f.policy_code,'version',f.policy_version,
           'owner',f.policy_owner,'resolution',f.policy_resolution,
           'awaiting_review_tolerance_days',f.awaiting_review_tolerance_days,
           'stale_activity_tolerance_days',f.stale_activity_tolerance_days)),
    'detector_config', f.config_provenance
  )) AS assurance_provenance
FROM fin f;

GRANT SELECT ON public.supervisory_management_assurance_matter TO authenticated;
GRANT SELECT ON public.supervisory_management_assurance_matter TO service_role;

COMMENT ON VIEW public.supervisory_management_assurance_matter IS
  'OS-02F: derived management assurance over canonical supervisory records. Read-only; security_invoker so caller RLS and supervisory scope apply.';

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_management_assurance_register(
  _domain text DEFAULT NULL, _condition text DEFAULT NULL, _entity_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL, _severity text DEFAULT NULL,
  _overdue boolean DEFAULT NULL, _recurring boolean DEFAULT NULL,
  _action_status text DEFAULT NULL, _search text DEFAULT NULL,
  _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH scoped AS (
    SELECT m.* FROM public.supervisory_management_assurance_matter m
     WHERE (_domain IS NULL OR m.domain_code = _domain)
       AND (_entity_id IS NULL OR m.entity_id = _entity_id)
       AND (_severity IS NULL OR m.severity = _severity)
       AND (_owner_id IS NULL OR m.owner_id = _owner_id OR m.action_owner_id = _owner_id)
       AND (_team_id IS NULL OR m.owner_team_id = _team_id OR m.action_team_id = _team_id)
       AND (_action_status IS NULL OR m.action_status = _action_status)
       AND (_search IS NULL OR btrim(_search) = ''
            OR m.entity_name ILIKE '%'||_search||'%'
            OR m.summary ILIKE '%'||_search||'%'
            OR COALESCE(m.action_reference,'') ILIKE '%'||_search||'%')
  ), matters AS (
    SELECT s.* FROM scoped s WHERE cardinality(s.assurance_conditions) > 0
  ), filtered AS (
    SELECT m.* FROM matters m
     WHERE (_condition IS NULL OR _condition = m.assurance_conditions[1]
            OR _condition = ANY (m.assurance_conditions))
       AND (_overdue IS NULL
            OR _overdue = ('RESPONSE_OVERDUE' = ANY (m.assurance_conditions)))
       AND (_recurring IS NULL
            OR _recurring = ('REPEATED_CONDITION' = ANY (m.assurance_conditions)
                             OR 'RECURRENCE_AFTER_REVIEW' = ANY (m.assurance_conditions)
                             OR 'RECURRENCE_AFTER_ACTION' = ANY (m.assurance_conditions)))
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'policy', (SELECT to_jsonb(p) FROM public.supervisory_assurance_policy_effective(_domain) p),
    'summary', (SELECT jsonb_build_object(
        'matters', count(*),
        'awaiting_review', count(*) FILTER (WHERE 'MATERIAL_AWAITING_REVIEW' = ANY (assurance_conditions)),
        'awaiting_review_beyond_tolerance', count(*) FILTER (WHERE 'AWAITING_REVIEW_BEYOND_TOLERANCE' = ANY (assurance_conditions)),
        'reviewed_no_disposition', count(*) FILTER (WHERE 'REVIEWED_NO_DISPOSITION' = ANY (assurance_conditions)),
        'unowned', count(*) FILTER (WHERE 'UNOWNED_MATTER' = ANY (assurance_conditions)),
        'overdue', count(*) FILTER (WHERE 'RESPONSE_OVERDUE' = ANY (assurance_conditions)),
        'stale', count(*) FILTER (WHERE 'RESPONSE_STALE' = ANY (assurance_conditions)),
        'repeated', count(*) FILTER (WHERE 'REPEATED_CONDITION' = ANY (assurance_conditions)),
        'recurrence_after_review', count(*) FILTER (WHERE 'RECURRENCE_AFTER_REVIEW' = ANY (assurance_conditions)),
        'recurrence_after_action', count(*) FILTER (WHERE 'RECURRENCE_AFTER_ACTION' = ANY (assurance_conditions)),
        'condition_resolved_action_open', count(*) FILTER (WHERE 'CONDITION_RESOLVED_ACTION_OPEN' = ANY (assurance_conditions)),
        'action_closed_condition_persists', count(*) FILTER (WHERE 'ACTION_CLOSED_CONDITION_PERSISTS' = ANY (assurance_conditions)),
        'assessment_potentially_stale', count(*) FILTER (WHERE 'ASSESSMENT_POTENTIALLY_STALE' = ANY (assurance_conditions)),
        'missing_traceability', count(*) FILTER (WHERE 'MISSING_TRACEABILITY' = ANY (assurance_conditions))
      ) FROM matters),
    'rows', COALESCE((SELECT jsonb_agg(r ORDER BY r->>'severity',
                        (r->>'age_days')::int DESC) FROM (
        SELECT jsonb_build_object(
          'signal_id', f.signal_id, 'entity_id', f.entity_id, 'entity_name', f.entity_name,
          'domain_code', f.domain_code, 'detector_code', f.detector_code,
          'severity', f.severity, 'is_material', f.is_material, 'summary', f.summary,
          'condition_state', f.condition_state, 'materiality_reason', f.materiality_reason,
          'first_detected_at', f.first_detected_at, 'last_detected_at', f.last_detected_at,
          'last_occurrence_at', f.last_occurrence_at,
          'occurrence_count', f.occurrence_total, 'occurrence_days', f.occurrence_days,
          'age_days', f.age_days,
          'days_since_supervisory_activity', f.days_since_supervisory_activity,
          'is_reviewed', f.is_reviewed, 'reviewed_by', f.reviewed_by,
          'reviewed_by_name', f.reviewed_by_name, 'reviewed_at', f.reviewed_at,
          'disposition', f.disposition, 'disposition_rationale', f.disposition_rationale,
          'owner_id', f.owner_id, 'owner_name', f.owner_name,
          'owner_team_id', f.owner_team_id, 'owner_team_name', f.owner_team_name,
          'ownership_scope', f.ownership_scope,
          'action_type', f.action_type, 'action_source_table', f.action_source_table,
          'action_record_id', f.action_record_id, 'action_reference', f.action_reference,
          'action_status', f.action_status, 'action_opened_at', f.action_opened_at,
          'action_due_date', f.action_due_date, 'due_date_source', f.due_date_source,
          'action_closed_at', f.action_closed_at, 'action_is_open', f.action_is_open,
          'source_table', f.source_table, 'source_id', f.source_id,
          'source_reference', f.source_reference,
          'assessment_id', f.assessment_id, 'assessment_reference', f.assessment_reference,
          'assurance_conditions', to_jsonb(f.assurance_conditions),
          'assurance_explanation', f.assurance_explanation,
          'assurance_provenance', f.assurance_provenance) AS r
          FROM filtered f
         ORDER BY f.severity, f.age_days DESC
         LIMIT GREATEST(COALESCE(_limit,200), 1)) q), '[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.supervisory_management_assurance_register(
  text,text,uuid,uuid,uuid,text,boolean,boolean,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_management_assurance_register(
  text,text,uuid,uuid,uuid,text,boolean,boolean,text,text,integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_management_assurance_item(_signal_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT to_jsonb(m) FROM public.supervisory_management_assurance_matter m
   WHERE m.signal_id = _signal_id;
$$;

REVOKE ALL ON FUNCTION public.supervisory_management_assurance_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_management_assurance_item(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_management_assurance_trend(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH w AS (SELECT (now() - make_interval(days => GREATEST(COALESCE(_days,30),1))) AS since),
  m AS (SELECT * FROM public.supervisory_management_assurance_matter)
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_days', GREATEST(COALESCE(_days,30),1),
    'new_material_matters', (SELECT count(*) FROM m, w
       WHERE m.is_material AND m.first_detected_at >= w.since),
    'matters_reviewed', (SELECT count(*) FROM m, w
       WHERE m.reviewed_at >= w.since),
    'matters_dispositioned', (SELECT count(*) FROM m, w
       WHERE m.disposition_at >= w.since),
    'responses_overdue', (SELECT count(*) FROM m
       WHERE 'RESPONSE_OVERDUE' = ANY (m.assurance_conditions)),
    'recurring_conditions', (SELECT count(*) FROM m
       WHERE 'REPEATED_CONDITION' = ANY (m.assurance_conditions)),
    'closed_actions_followed_by_recurrence', (SELECT count(*) FROM m
       WHERE 'ACTION_CLOSED_CONDITION_PERSISTS' = ANY (m.assurance_conditions)),
    'conditions_resolved_in_window', (SELECT count(*) FROM m, w
       WHERE m.resolved_at >= w.since));
$$;

REVOKE ALL ON FUNCTION public.supervisory_management_assurance_trend(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_management_assurance_trend(integer)
  TO authenticated, service_role;