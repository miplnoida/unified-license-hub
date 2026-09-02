-- ============================================================================
-- EPIC 3 CLOSURE — security corrections, AML personas, notifications, read model
-- ============================================================================

-- ---------------------------------------------------------------- A. RBAC ---
-- A1. Remove the pre-existing over-privileged officer grant of
--     aml_supervision.view_confidential (inconsistent with the approved model:
--     confidential AML material is supervisor level and above only).
DELETE FROM public.sec_role_permissions rp
USING public.sec_permissions p, public.sec_modules m, public.sec_roles r
WHERE rp.permission_id = p.id
  AND p.module_id = m.id
  AND rp.role_id = r.id
  AND m.key = 'aml_supervision'
  AND p.key = 'view_confidential'
  AND r.key IN ('aml_supervision_officer');

-- A2. Senior AML/CFT Analyst + Head of AML/CFT personas.
INSERT INTO public.sec_roles (key, name, description, role_type, role_category, dashboard_tier, status, is_system)
VALUES
  ('aml_senior_analyst', 'Senior AML/CFT Analyst',
   'Prepares and submits AML/CFT risk assessments, examinations, findings and remediation. Cannot approve or view confidential material.',
   'internal', 'operational', 'operational', 'active', true),
  ('aml_head', 'Head of AML/CFT',
   'Accountable head of the AML/CFT function. Reviews, approves, assigns and configures AML/CFT methodology; may view confidential material.',
   'internal', 'supervisory', 'supervisory', 'active', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.sec_roles r
JOIN public.sec_permissions p ON true
JOIN public.sec_modules m ON m.id = p.module_id
WHERE m.key = 'aml_supervision'
  AND (
    (r.key = 'aml_senior_analyst' AND p.key IN ('view','create','edit','submit','examine','finding_manage','remediation_manage'))
    OR (r.key = 'aml_head' AND p.key IN ('view','view_confidential','create','edit','review','approve','assign','examine','finding_manage','remediation_manage','manage_config'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.sec_role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
  );

-- ------------------------------------------------- B. anon RPC boundary -----
-- Pre-existing AI-governance leakage: three routines remained EXECUTEable by
-- the unauthenticated role with no pre-auth journey. One of them is a mutation.
REVOKE EXECUTE ON FUNCTION public.ai_governance_model_save(uuid,text,text,text,text,text,text,text,text,boolean,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_gov_can_view_technical_provenance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_gov_display_alias(text,text) FROM anon;

-- ------------------------------------------------- C. AML portfolio model ---
DROP FUNCTION IF EXISTS public.aml_portfolio(integer);

CREATE FUNCTION public.aml_portfolio(_limit integer DEFAULT 200)
RETURNS TABLE(
  entity_id uuid, entity_name text, sector_name text, licence_reference text,
  residual_rating text, inherent_rating text, control_rating text,
  prior_rating text, trend text,
  last_review_date date, next_review_date date, assessment_current boolean,
  last_assessment_id uuid, last_assessment_reference text, last_assessment_status text,
  methodology_version text, assigned_officer_id uuid, assigned_officer_name text,
  assigned_team_id uuid,
  high_risk_dimensions text[], open_findings integer, critical_findings integer,
  overdue_remediation integer, active_examinations integer, reassessment_required boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH cur AS (
    SELECT a.* FROM public.supervisory_assessment a
     WHERE a.domain_code = 'AML_CFT' AND a.status = 'approved' AND a.is_current
  )
  SELECT l.id, l.name, s.name,
         (SELECT lic.license_number FROM public.entity_licenses el
            JOIN public.licenses lic ON lic.id = el.license_id
           WHERE el.entity_id = l.id
           ORDER BY el.is_primary DESC NULLS LAST, el.effective_from DESC NULLS LAST LIMIT 1),
         rs.residual_rating, rs.inherent_rating, rs.control_rating,
         (SELECT m.previous_rating FROM public.entity_risk_state_movement m
            WHERE m.entity_id = l.id AND m.domain_code = 'AML_CFT'
            ORDER BY m.approved_at DESC LIMIT 1),
         COALESCE((SELECT m.trend FROM public.entity_risk_state_movement m
                    WHERE m.entity_id = l.id AND m.domain_code = 'AML_CFT'
                    ORDER BY m.approved_at DESC LIMIT 1), 'STABLE'),
         rs.last_review_date, rs.next_review_date,
         (rs.next_review_date IS NULL OR rs.next_review_date >= current_date),
         c.id, c.reference, COALESCE(c.status, 'none'), c.methodology_version,
         c.owner_id,
         (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = c.owner_id),
         c.team_id,
         COALESCE((SELECT array_agg(d.dimension_code ORDER BY d.dimension_code)
                     FROM public.supervisory_assessment_dimension d
                    WHERE d.assessment_id = rs.driving_assessment_id
                      AND upper(COALESCE(d.residual_rating,'')) IN ('HIGH','SEVERE','MEDIUM_HIGH')), '{}'::text[]),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id = l.id AND f.domain_code = 'AML_CFT'
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_finding f
           WHERE f.entity_id = l.id AND f.domain_code = 'AML_CFT' AND f.severity IN ('HIGH','CRITICAL')
             AND f.status NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')),
         (SELECT count(*)::int FROM public.supervisory_remediation_action a
           WHERE a.entity_id = l.id AND a.domain_code = 'AML_CFT' AND a.target_date < current_date
             AND a.status NOT IN ('EFFECTIVE','CLOSED')),
         (SELECT count(*)::int FROM public.examinations e
           WHERE e.entity_id = l.id AND e.domain_code = 'AML_CFT' AND e.closed_at IS NULL),
         EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                  WHERE rr.entity_id = l.id AND rr.domain_code = 'AML_CFT'
                    AND rr.status IN ('REQUIRED','IN_PROGRESS'))
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    LEFT JOIN public.entity_risk_state rs
           ON rs.entity_id = l.id AND rs.domain_code = 'AML_CFT'
    LEFT JOIN cur c ON c.entity_id = l.id
   WHERE COALESCE(l.status,'') <> 'archived'
   ORDER BY CASE upper(COALESCE(rs.residual_rating,''))
              WHEN 'SEVERE' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM_HIGH' THEN 3
              WHEN 'MODERATE' THEN 4 WHEN 'LOW' THEN 5 ELSE 6 END,
            l.name
   LIMIT _limit;
$function$;

REVOKE ALL ON FUNCTION public.aml_portfolio(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aml_portfolio(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aml_portfolio(integer) TO service_role;

-- ------------------------------------------------- D. Notification events ---
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template,
   email_subject_template, email_body_template,
   channels, recipient_rules, notification_type, category, severity, module, action_required)
VALUES
  ('aml.assessment_assigned', 'AML/CFT assessment assigned to an officer',
   'AML/CFT assessment assigned: {{entity_name}}',
   'You have been assigned AML/CFT assessment {{reference}} for {{entity_name}}.',
   'AML/CFT assessment assigned: {{entity_name}}',
   'You have been assigned AML/CFT assessment {{reference}} for {{entity_name}}.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"}]'::jsonb,
   'info', 'action_required', 'medium', 'aml_supervision', true),
  ('aml.assessment_submitted', 'AML/CFT assessment submitted for review',
   'AML/CFT assessment submitted: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} has been submitted for supervisory review.',
   'AML/CFT assessment submitted: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} has been submitted for supervisory review.',
   ARRAY['in_app'], '[{"type":"role","role":"supervisor"}]'::jsonb,
   'info', 'action_required', 'medium', 'aml_supervision', true),
  ('aml.assessment_approval_required', 'AML/CFT assessment awaiting approval',
   'AML/CFT approval required: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} is reviewed and awaiting approval.',
   'AML/CFT approval required: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} is reviewed and awaiting approval.',
   ARRAY['in_app'], '[{"type":"role","role":"supervisor"}]'::jsonb,
   'info', 'action_required', 'high', 'aml_supervision', true),
  ('aml.assessment_returned', 'AML/CFT assessment returned for amendment',
   'AML/CFT assessment returned: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} was returned for amendment.',
   'AML/CFT assessment returned: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} was returned for amendment.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"}]'::jsonb,
   'warning', 'action_required', 'medium', 'aml_supervision', true),
  ('aml.assessment_approved', 'AML/CFT assessment approved',
   'AML/CFT assessment approved: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} was approved. Residual risk: {{residual_rating}}.',
   'AML/CFT assessment approved: {{entity_name}}',
   'AML/CFT assessment {{reference}} for {{entity_name}} was approved. Residual risk: {{residual_rating}}.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"},{"type":"role","role":"supervisor"}]'::jsonb,
   'info', 'info', 'medium', 'aml_supervision', false),
  ('aml.finding_issued', 'AML/CFT supervisory finding issued',
   'AML/CFT finding issued: {{reference}}',
   'AML/CFT finding {{reference}} ({{severity}}) was issued for {{entity_name}}.',
   'AML/CFT finding issued: {{reference}}',
   'AML/CFT finding {{reference}} ({{severity}}) was issued for {{entity_name}}.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"},{"type":"role","role":"supervisor"}]'::jsonb,
   'warning', 'action_required', 'high', 'aml_supervision', true),
  ('aml.management_response_due', 'AML/CFT management response due or overdue',
   'Management response due: {{reference}}',
   'A management response for AML/CFT finding {{reference}} ({{entity_name}}) is due on {{due_date}}.',
   'Management response due: {{reference}}',
   'A management response for AML/CFT finding {{reference}} ({{entity_name}}) is due on {{due_date}}.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"}]'::jsonb,
   'warning', 'action_required', 'high', 'aml_supervision', true),
  ('aml.remediation_due', 'AML/CFT remediation action due or overdue',
   'AML/CFT remediation due: {{reference}}',
   'Remediation action {{reference}} for {{entity_name}} is due on {{target_date}}.',
   'AML/CFT remediation due: {{reference}}',
   'Remediation action {{reference}} for {{entity_name}} is due on {{target_date}}.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"}]'::jsonb,
   'warning', 'action_required', 'high', 'aml_supervision', true),
  ('aml.validation_required', 'AML/CFT remediation awaiting supervisory validation',
   'Validation required: {{reference}}',
   'Remediation action {{reference}} for {{entity_name}} has evidence submitted and awaits supervisory validation.',
   'Validation required: {{reference}}',
   'Remediation action {{reference}} for {{entity_name}} has evidence submitted and awaits supervisory validation.',
   ARRAY['in_app'], '[{"type":"role","role":"supervisor"}]'::jsonb,
   'info', 'action_required', 'high', 'aml_supervision', true),
  ('aml.reassessment_required', 'AML/CFT reassessment requirement raised',
   'AML/CFT reassessment required: {{entity_name}}',
   'A reassessment of {{entity_name}} is required ({{trigger_kind}}). Due {{due_date}}.',
   'AML/CFT reassessment required: {{entity_name}}',
   'A reassessment of {{entity_name}} is required ({{trigger_kind}}). Due {{due_date}}.',
   ARRAY['in_app'], '[{"type":"payload_user","key":"owner_id"},{"type":"role","role":"supervisor"}]'::jsonb,
   'warning', 'action_required', 'high', 'aml_supervision', true)
ON CONFLICT (event_key) DO NOTHING;

-- ------------------------------------------------- E. Notification triggers -
CREATE OR REPLACE FUNCTION public.aml_assessment_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF NEW.domain_code <> 'AML_CFT' THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'reference', NEW.reference,
    'entity_id', NEW.entity_id,
    'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = NEW.entity_id),
    'owner_id', NEW.owner_id,
    'residual_rating', NEW.residual_rating,
    'status', NEW.status,
    'href', '/supervision/aml/assessments/' || NEW.id
  );

  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NOT NULL THEN
      PERFORM public.notification_enqueue_event('aml.assessment_assigned', 'supervisory_assessment', NEW.id, v_payload, NEW.status);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'submitted' THEN
      PERFORM public.notification_enqueue_event('aml.assessment_submitted', 'supervisory_assessment', NEW.id, v_payload, NEW.status);
    ELSIF NEW.status = 'reviewed' THEN
      PERFORM public.notification_enqueue_event('aml.assessment_approval_required', 'supervisory_assessment', NEW.id, v_payload, NEW.status);
    ELSIF NEW.status = 'draft' AND OLD.status IN ('submitted','reviewed') THEN
      PERFORM public.notification_enqueue_event('aml.assessment_returned', 'supervisory_assessment', NEW.id, v_payload, NEW.status);
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.notification_enqueue_event('aml.assessment_approved', 'supervisory_assessment', NEW.id, v_payload, NEW.status);
    END IF;
  ELSIF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NEW.owner_id IS NOT NULL THEN
    PERFORM public.notification_enqueue_event('aml.assessment_assigned', 'supervisory_assessment', NEW.id, v_payload, NEW.owner_id::text);
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_aml_assessment_notify ON public.supervisory_assessment;
CREATE TRIGGER trg_aml_assessment_notify
AFTER INSERT OR UPDATE ON public.supervisory_assessment
FOR EACH ROW EXECUTE FUNCTION public.aml_assessment_notify();

CREATE OR REPLACE FUNCTION public.aml_finding_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF NEW.domain_code <> 'AML_CFT' THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'reference', NEW.reference,
    'entity_id', NEW.entity_id,
    'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = NEW.entity_id),
    'owner_id', NEW.owner_id,
    'severity', NEW.severity,
    'due_date', NEW.due_date,
    'href', '/supervision/aml/findings/' || NEW.id
  );

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ISSUED' THEN
    PERFORM public.notification_enqueue_event('aml.finding_issued', 'supervisory_finding', NEW.id, v_payload, 'ISSUED');
    IF NEW.due_date IS NOT NULL THEN
      PERFORM public.notification_enqueue_event('aml.management_response_due', 'supervisory_finding', NEW.id, v_payload, NEW.due_date::text);
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_aml_finding_notify ON public.supervisory_finding;
CREATE TRIGGER trg_aml_finding_notify
AFTER UPDATE ON public.supervisory_finding
FOR EACH ROW EXECUTE FUNCTION public.aml_finding_notify();

CREATE OR REPLACE FUNCTION public.aml_remediation_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_payload jsonb;
BEGIN
  IF NEW.domain_code <> 'AML_CFT' THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'reference', NEW.reference,
    'entity_id', NEW.entity_id,
    'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = NEW.entity_id),
    'owner_id', NEW.owner_id,
    'target_date', NEW.target_date,
    'status', NEW.status,
    'href', '/supervision/aml/findings/' || NEW.finding_id
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notification_enqueue_event('aml.remediation_due', 'supervisory_remediation_action', NEW.id, v_payload, COALESCE(NEW.target_date::text,'-'));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('EVIDENCE_SUBMITTED','VALIDATION') THEN
      PERFORM public.notification_enqueue_event('aml.validation_required', 'supervisory_remediation_action', NEW.id, v_payload, NEW.status);
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_aml_remediation_notify ON public.supervisory_remediation_action;
CREATE TRIGGER trg_aml_remediation_notify
AFTER INSERT OR UPDATE ON public.supervisory_remediation_action
FOR EACH ROW EXECUTE FUNCTION public.aml_remediation_notify();

CREATE OR REPLACE FUNCTION public.aml_reassessment_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.domain_code <> 'AML_CFT' THEN RETURN NEW; END IF;

  PERFORM public.notification_enqueue_event(
    'aml.reassessment_required', 'supervisory_reassessment_requirement', NEW.id,
    jsonb_build_object(
      'entity_id', NEW.entity_id,
      'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = NEW.entity_id),
      'owner_id', NEW.owner_id,
      'trigger_kind', NEW.trigger_kind,
      'due_date', NEW.due_date,
      'href', '/supervision/aml/work-queue'
    ), NEW.trigger_kind);

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_aml_reassessment_notify ON public.supervisory_reassessment_requirement;
CREATE TRIGGER trg_aml_reassessment_notify
AFTER INSERT ON public.supervisory_reassessment_requirement
FOR EACH ROW EXECUTE FUNCTION public.aml_reassessment_notify();