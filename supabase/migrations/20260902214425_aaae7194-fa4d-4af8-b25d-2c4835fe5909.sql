-- =====================================================================
-- EPIC 4 / W1 : CANONICAL ENTERPRISE SUPERVISORY WORK MODEL
-- One work model derived from canonical objects. No duplicated status.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.supervisory_work_type (
  code             text PRIMARY KEY,
  label            text NOT NULL,
  canonical_object text NOT NULL,
  decision_point   boolean NOT NULL DEFAULT false,
  description      text,
  sort_order       integer NOT NULL DEFAULT 100,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisory_work_type TO authenticated;
GRANT ALL ON public.supervisory_work_type TO service_role;
ALTER TABLE public.supervisory_work_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swt_read ON public.supervisory_work_type;
CREATE POLICY swt_read ON public.supervisory_work_type
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS swt_admin_write ON public.supervisory_work_type;
CREATE POLICY swt_admin_write ON public.supervisory_work_type
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.supervisory_work_type (code, label, canonical_object, decision_point, description, sort_order) VALUES
  ('ASSESSMENT_DRAFTING',            'Assessment drafting',              'supervisory_assessment',                false, 'Risk assessment in preparation or returned for revision.',            10),
  ('ASSESSMENT_APPROVAL',            'Assessment approval',              'supervisory_assessment',                true,  'Submitted or reviewed assessment awaiting an approval decision.',     20),
  ('ATTENTION_PRIORITY_CONFIRMATION','Priority confirmation',            'supervisory_attention',                 true,  'Calculated priority awaiting supervisory confirmation or override.',   30),
  ('ATTENTION_DISPOSITION',          'Attention disposition',            'supervisory_attention',                 false, 'Open supervisory attention matter requiring a disposition decision.',  40),
  ('PLAN_APPROVAL',                  'Supervisory plan approval',        'supervisory_plan',                      true,  'Submitted supervisory plan awaiting approval.',                        50),
  ('PLAN_ITEM_DELIVERY',             'Plan item delivery',               'supervisory_plan_item',                 false, 'Planned supervisory activity still to be delivered.',                  60),
  ('INTERVENTION_DECISION',          'Intervention decision',            'supervisory_intervention',              true,  'Proposed intervention awaiting an endorsement decision.',              70),
  ('INTERVENTION_DELIVERY',          'Intervention delivery',            'supervisory_intervention',              false, 'Endorsed or active intervention in delivery.',                         80),
  ('EXAMINATION_STAGE_DECISION',     'Examination stage decision',       'examinations',                          true,  'Open examination requiring the next stage decision.',                  90),
  ('EXAMINATION_DATA_REQUEST',       'Examination information request',  'examination_data_requests',             false, 'Outstanding examination information request.',                        100),
  ('FINDING_ISSUANCE',               'Finding issuance',                 'supervisory_finding',                   true,  'Draft or in-review finding awaiting issuance.',                       110),
  ('FINDING_RESPONSE_REVIEW',        'Finding response review',          'supervisory_finding',                   true,  'Management response received and awaiting supervisory review.',       120),
  ('REMEDIATION_DECISION',           'Remediation decision',             'supervisory_remediation_action',        true,  'Remediation submission awaiting acceptance or validation decision.',  130),
  ('REMEDIATION_DELIVERY',           'Remediation monitoring',           'supervisory_remediation_action',        false, 'Accepted remediation being implemented and monitored.',               140),
  ('REASSESSMENT_FULFILMENT',        'Reassessment fulfilment',          'supervisory_reassessment_requirement',  false, 'Required reassessment not yet fulfilled.',                            150),
  ('ESCALATION_RESPONSE',            'Escalation response',              'escalations',                           false, 'Open escalation requiring acknowledgement, review or resolution.',    160),
  ('ENFORCEMENT_REFERRAL_REVIEW',    'Enforcement referral review',      'enforcement_actions',                   true,  'Enforcement referral awaiting assessment or decision.',               170)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      canonical_object = EXCLUDED.canonical_object,
      decision_point = EXCLUDED.decision_point,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      is_active = true,
      updated_at = now();

-- ---------------------------------------------------------------------
-- Assignment overlay: assignment only. No business status is stored.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisory_work_assignment (
  work_key      text PRIMARY KEY,
  work_type     text NOT NULL REFERENCES public.supervisory_work_type(code),
  source_object text NOT NULL,
  source_id     uuid NOT NULL,
  assigned_to   uuid REFERENCES auth.users(id),
  assigned_team uuid,
  note          text,
  assigned_by   uuid REFERENCES auth.users(id),
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swa_target_chk CHECK (assigned_to IS NOT NULL OR assigned_team IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS swa_assigned_to_idx ON public.supervisory_work_assignment(assigned_to);
CREATE INDEX IF NOT EXISTS swa_source_idx ON public.supervisory_work_assignment(source_object, source_id);

GRANT SELECT ON public.supervisory_work_assignment TO authenticated;
GRANT ALL ON public.supervisory_work_assignment TO service_role;
ALTER TABLE public.supervisory_work_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS swa_read ON public.supervisory_work_assignment;
CREATE POLICY swa_read ON public.supervisory_work_assignment
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- No direct write policy: writes flow only through the governed operation.

CREATE OR REPLACE FUNCTION public.tg_supervisory_work_assignment_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS swa_touch ON public.supervisory_work_assignment;
CREATE TRIGGER swa_touch BEFORE UPDATE ON public.supervisory_work_assignment
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_work_assignment_touch();

-- ---------------------------------------------------------------------
-- Derived work model (authoritative records only, no stored state)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.supervisory_work_item CASCADE;
DROP VIEW IF EXISTS public.supervisory_work_item_source CASCADE;

CREATE VIEW public.supervisory_work_item_source
WITH (security_invoker = true) AS
-- 1/2 assessments
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
-- 3/4 attention
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
-- 5/6 plan
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
-- 7/8 intervention
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
-- 9/10 examinations
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
-- 11/12 findings
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
-- 13/14 remediation
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
-- 15 reassessment
SELECT 'REASSESSMENT_FULFILMENT', 'supervisory_reassessment_requirement', q.id,
       'RSR-' || left(q.id::text, 8),
       'Reassessment required: ' || COALESCE(q.trigger_kind,'trigger'),
       COALESCE(q.domain_code,'CROSS_DOMAIN'), q.entity_id, q.owner_id, q.team_id, q.created_by,
       q.status, CASE WHEN q.status = 'IN_PROGRESS' THEN 'IN_PROGRESS' ELSE 'NOT_STARTED' END,
       q.due_date, q.created_at, NULL::text
FROM public.supervisory_reassessment_requirement q
WHERE q.status IN ('REQUIRED','IN_PROGRESS')
UNION ALL
-- 16 escalations
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
-- 17 enforcement referral
SELECT 'ENFORCEMENT_REFERRAL_REVIEW', 'enforcement_actions', x.id, x.case_number,
       COALESCE(x.description, x.enforcement_type), 'CROSS_DOMAIN', x.entity_id,
       x.assigned_to, NULL::uuid, COALESCE(x.referred_by, x.opened_by), x.stage,
       'AWAITING_DECISION', x.appeal_deadline, COALESCE(x.referred_at, x.created_at), x.severity
FROM public.enforcement_actions x
WHERE x.stage IN ('REFERRAL','ASSESSMENT') AND x.closed_at IS NULL;

CREATE VIEW public.supervisory_work_item
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
    WHEN 'HIGH' THEN 'HIGH' WHEN 'MEDIUM' THEN 'MEDIUM'
    WHEN 'MODERATE' THEN 'MEDIUM' WHEN 'LOW' THEN 'LOW'
    WHEN 'ROUTINE' THEN 'ROUTINE' ELSE 'MEDIUM' END             AS priority,
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
    ELSE '/my-work' END                                         AS route,
  wt.sort_order
FROM public.supervisory_work_item_source s
JOIN public.supervisory_work_type wt ON wt.code = s.work_type AND wt.is_active
LEFT JOIN public.supervisory_work_assignment asg
       ON asg.work_key = s.work_type || ':' || s.source_id::text
LEFT JOIN public.licensees l ON l.id = s.entity_id;

GRANT SELECT ON public.supervisory_work_item_source TO authenticated, service_role;
GRANT SELECT ON public.supervisory_work_item TO authenticated, service_role;

COMMENT ON VIEW public.supervisory_work_item IS
  'EPIC 4 canonical enterprise supervisory work model. Derived only from canonical supervisory records; stores no business status. Assignment overlay adds ownership only.';

-- ---------------------------------------------------------------------
-- Governed reader: one model, many scopes (My Work is a filter)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_work_queue(
  _scope     text DEFAULT 'MY_WORK',
  _domain    text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _work_type text DEFAULT NULL,
  _limit     integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  _uid   uuid := auth.uid();
  _scope_u text := upper(COALESCE(_scope,'MY_WORK'));
  _teams uuid[];
  _items jsonb;
  _counts jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_internal_staff(_uid) THEN
    RAISE EXCEPTION 'not_authorized: supervisory work queue is restricted to internal staff'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(m.team_id), ARRAY[]::uuid[]) INTO _teams
  FROM public.regulatory_team_members m
  WHERE m.user_id = _uid
    AND COALESCE(m.status,'active') = 'active'
    AND (m.effective_to IS NULL OR m.effective_to > now());

  WITH base AS (
    SELECT w.* FROM public.supervisory_work_item w
    WHERE (_domain IS NULL OR w.domain_code = upper(_domain))
      AND (_entity_id IS NULL OR w.entity_id = _entity_id)
      AND (_work_type IS NULL OR w.work_type = upper(_work_type))
  ), scoped AS (
    SELECT b.* FROM base b
    WHERE CASE _scope_u
      WHEN 'MY_WORK'             THEN b.effective_owner_id = _uid
      WHEN 'MY_TEAM'             THEN b.effective_team_id = ANY(_teams)
      WHEN 'UNASSIGNED'          THEN b.is_unassigned
      WHEN 'DUE_SOON'            THEN b.is_due_soon
      WHEN 'OVERDUE'             THEN b.is_overdue
      WHEN 'HIGH_PRIORITY'       THEN b.priority IN ('CRITICAL','HIGH')
      WHEN 'AWAITING_MY_APPROVAL' THEN b.decision_point
                                       AND b.work_state = 'AWAITING_DECISION'
                                       AND (b.maker_id IS NULL OR b.maker_id <> _uid)
      WHEN 'ALL'                 THEN true
      ELSE b.effective_owner_id = _uid END
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.is_overdue DESC,
            CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
                            WHEN 'LOW' THEN 4 ELSE 5 END,
            t.due_date NULLS LAST, t.sort_order), '[]'::jsonb)
  INTO _items
  FROM (SELECT * FROM scoped LIMIT GREATEST(COALESCE(_limit,200), 1)) t;

  WITH base AS (
    SELECT w.* FROM public.supervisory_work_item w
    WHERE (_domain IS NULL OR w.domain_code = upper(_domain))
      AND (_entity_id IS NULL OR w.entity_id = _entity_id)
      AND (_work_type IS NULL OR w.work_type = upper(_work_type))
  )
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
  ) INTO _counts FROM base;

  RETURN jsonb_build_object(
    'scope', _scope_u,
    'generated_at', now(),
    'counts', _counts,
    'items', _items
  );
END $$;

REVOKE ALL ON FUNCTION public.supervisory_work_queue(text, text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_work_queue(text, text, uuid, text, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Governed assignment operation (only writer of the overlay)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_work_item_assign(
  _work_key      text,
  _assigned_to   uuid DEFAULT NULL,
  _assigned_team uuid DEFAULT NULL,
  _note          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _type text;
  _sid  text;
  _obj  text;
  _before jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR (public.is_internal_staff(_uid) AND public.has_any_permission(_uid, ARRAY[
        'supervisory_spine.edit','aml_supervision.assessment_manage','aml_supervision.remediation_manage',
        'prudential_supervision.manage_remediation','market_conduct.approve','inspection_management.edit'])))
  THEN
    RAISE EXCEPTION 'not_authorized: assigning supervisory work requires supervisory permissions'
      USING ERRCODE = '42501';
  END IF;
  IF _assigned_to IS NULL AND _assigned_team IS NULL THEN
    RAISE EXCEPTION 'invalid_input: an officer or a team must be supplied' USING ERRCODE = '22023';
  END IF;

  _type := split_part(_work_key, ':', 1);
  _sid  := split_part(_work_key, ':', 2);
  SELECT canonical_object INTO _obj FROM public.supervisory_work_type
   WHERE code = _type AND is_active;
  IF _obj IS NULL THEN
    RAISE EXCEPTION 'not_found: unknown supervisory work type %', _type USING ERRCODE = '22023';
  END IF;
  IF _sid IS NULL OR _sid = '' THEN
    RAISE EXCEPTION 'invalid_input: malformed work key' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(a) INTO _before FROM public.supervisory_work_assignment a WHERE a.work_key = _work_key;

  INSERT INTO public.supervisory_work_assignment
    (work_key, work_type, source_object, source_id, assigned_to, assigned_team, note, assigned_by, assigned_at)
  VALUES (_work_key, _type, _obj, _sid::uuid, _assigned_to, _assigned_team, _note, _uid, now())
  ON CONFLICT (work_key) DO UPDATE
    SET assigned_to = EXCLUDED.assigned_to,
        assigned_team = EXCLUDED.assigned_team,
        note = EXCLUDED.note,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now();

  PERFORM public.log_compliance_audit(
    'UPDATE'::public.compliance_audit_action,
    'supervisory_work_assignment',
    _work_key,
    _before,
    (SELECT to_jsonb(a) FROM public.supervisory_work_assignment a WHERE a.work_key = _work_key),
    COALESCE(_note, 'Supervisory work assignment')
  );

  RETURN jsonb_build_object('work_key', _work_key, 'assigned_to', _assigned_to,
                            'assigned_team', _assigned_team, 'assigned_at', now());
END $$;

REVOKE ALL ON FUNCTION public.supervisory_work_item_assign(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_work_item_assign(text, uuid, uuid, text)
  TO authenticated, service_role;
