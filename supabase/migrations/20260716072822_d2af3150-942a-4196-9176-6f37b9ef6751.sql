
-- 1) Normalize legacy status values
UPDATE public.complaints SET status = 'submitted' WHERE status = 'open';

-- 2) Enforce canonical lifecycle values (kept as text for backward compatibility)
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('submitted','under_investigation','resolved','closed','rejected','duplicate'));

-- 3) Seed permission actions for complaint_management
DO $$
DECLARE m uuid;
BEGIN
  SELECT id INTO m FROM public.permission_modules WHERE key = 'complaint_management';
  IF m IS NULL THEN RETURN; END IF;
  INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, audience)
  VALUES
    (m,'assign','Assign','Assign complaint to investigator/team',30,'internal'),
    (m,'investigate','Start Investigation','Move complaint into investigation',40,'internal'),
    (m,'resolve','Resolve','Record resolution and close SLA clock',50,'internal'),
    (m,'close','Close','Close a resolved complaint',60,'internal'),
    (m,'escalate','Escalate','Escalate complaint to enforcement',70,'internal'),
    (m,'retry_triage','Retry Triage','Re-run automated triage engine',80,'internal'),
    (m,'analytics','Analytics','View complaint analytics dashboards',90,'internal')
  ON CONFLICT (module_id, key) DO NOTHING;
END$$;

-- 4) Helper: does current user have complaint_management.<action>?
CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Legacy admins / super admins bypass
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      JOIN public.permission_actions pa ON pa.id = p.action_id
      JOIN public.permission_modules pm ON pm.id = pa.module_id
      JOIN public.user_dynamic_roles udr ON udr.role_id = rp.role_id
      WHERE udr.user_id = _user_id
        AND pm.key = 'complaint_management'
        AND pa.key = _action
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_complaint_perm(uuid, text) TO authenticated, service_role;

-- 5) Shared SLA function (parity with src/lib/complaintsSla.ts)
CREATE OR REPLACE FUNCTION public.complaint_sla_status(
  _created_at timestamptz,
  _sla_due_at timestamptz,
  _sla_days integer,
  _resolved_at timestamptz
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  due timestamptz;
  ms_left double precision;
  days_left double precision;
BEGIN
  IF _resolved_at IS NOT NULL THEN RETURN 'resolved'; END IF;
  IF _sla_due_at IS NOT NULL THEN
    due := _sla_due_at;
  ELSIF _created_at IS NOT NULL AND _sla_days IS NOT NULL THEN
    due := _created_at + make_interval(days => _sla_days);
  ELSE
    RETURN 'unknown';
  END IF;
  ms_left := EXTRACT(EPOCH FROM (due - now()));
  IF ms_left < 0 THEN RETURN 'breached'; END IF;
  days_left := ms_left / 86400.0;
  IF days_left <= 2 THEN RETURN 'at_risk'; END IF;
  IF _sla_days IS NOT NULL AND _sla_days > 0 AND (days_left / _sla_days) <= 0.25 THEN RETURN 'at_risk'; END IF;
  RETURN 'on_track';
END;
$$;

GRANT EXECUTE ON FUNCTION public.complaint_sla_status(timestamptz,timestamptz,integer,timestamptz) TO anon, authenticated, service_role;

-- 6) Lifecycle RPCs (SECURITY DEFINER, permission-checked, audited)

-- Assign
CREATE OR REPLACE FUNCTION public.assign_complaint(
  _id uuid, _investigator uuid DEFAULT NULL, _team text DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  before_row public.complaints%ROWTYPE;
  after_row public.complaints%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'assign') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.assign' USING ERRCODE='42501';
  END IF;
  SELECT * INTO before_row FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;

  UPDATE public.complaints
     SET investigator_id = COALESCE(_investigator, investigator_id),
         assigned_team   = COALESCE(_team, assigned_team),
         updated_at      = now()
   WHERE id = _id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.assigned', 'complaint', _id,
          jsonb_build_object('investigator_id', before_row.investigator_id, 'assigned_team', before_row.assigned_team),
          jsonb_build_object('investigator_id', after_row.investigator_id, 'assigned_team', after_row.assigned_team, 'reason', _reason));
  RETURN after_row;
END;
$$;

-- Start investigation
CREATE OR REPLACE FUNCTION public.start_complaint_investigation(_id uuid)
RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  before_row public.complaints%ROWTYPE;
  after_row public.complaints%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'investigate') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.investigate' USING ERRCODE='42501';
  END IF;
  SELECT * INTO before_row FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF before_row.status NOT IN ('submitted','under_investigation') THEN
    RAISE EXCEPTION 'invalid transition from % to under_investigation', before_row.status USING ERRCODE='22023';
  END IF;

  UPDATE public.complaints
     SET status = 'under_investigation',
         investigator_id = COALESCE(investigator_id, actor),
         acknowledged_at = COALESCE(acknowledged_at, now()),
         updated_at = now()
   WHERE id = _id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.investigation_started', 'complaint', _id,
          jsonb_build_object('status', before_row.status),
          jsonb_build_object('status', after_row.status, 'investigator_id', after_row.investigator_id));
  RETURN after_row;
END;
$$;

-- Resolve
CREATE OR REPLACE FUNCTION public.resolve_complaint(_id uuid, _resolution text)
RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  before_row public.complaints%ROWTYPE;
  after_row public.complaints%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'resolve') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.resolve' USING ERRCODE='42501';
  END IF;
  IF _resolution IS NULL OR length(btrim(_resolution)) < 5 THEN
    RAISE EXCEPTION 'resolution notes required (min 5 chars)' USING ERRCODE='22023';
  END IF;
  SELECT * INTO before_row FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF before_row.status NOT IN ('submitted','under_investigation','resolved') THEN
    RAISE EXCEPTION 'invalid transition from % to resolved', before_row.status USING ERRCODE='22023';
  END IF;

  UPDATE public.complaints
     SET status = 'resolved',
         resolution = btrim(_resolution),
         resolved_at = COALESCE(resolved_at, now()),
         updated_at = now()
   WHERE id = _id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.resolved', 'complaint', _id,
          jsonb_build_object('status', before_row.status),
          jsonb_build_object('status', after_row.status, 'resolution', after_row.resolution));
  RETURN after_row;
END;
$$;

-- Close
CREATE OR REPLACE FUNCTION public.close_complaint(_id uuid, _reason text DEFAULT NULL)
RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  before_row public.complaints%ROWTYPE;
  after_row public.complaints%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'close') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.close' USING ERRCODE='42501';
  END IF;
  SELECT * INTO before_row FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF before_row.status = 'closed' THEN
    RETURN before_row; -- idempotent
  END IF;

  UPDATE public.complaints
     SET status = 'closed', updated_at = now()
   WHERE id = _id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.closed', 'complaint', _id,
          jsonb_build_object('status', before_row.status),
          jsonb_build_object('status', after_row.status, 'reason', _reason));
  RETURN after_row;
END;
$$;

-- Transactional escalation to enforcement
CREATE OR REPLACE FUNCTION public.escalate_complaint_to_enforcement(_id uuid, _findings text)
RETURNS TABLE(complaint_id uuid, enforcement_id uuid, case_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  c public.complaints%ROWTYPE;
  new_ea_id uuid;
  new_case_number text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.has_complaint_perm(actor, 'escalate') THEN
    RAISE EXCEPTION 'permission denied: complaint_management.escalate' USING ERRCODE='42501';
  END IF;
  IF _findings IS NULL OR length(btrim(_findings)) < 10 THEN
    RAISE EXCEPTION 'findings required (min 10 chars)' USING ERRCODE='22023';
  END IF;

  SELECT * INTO c FROM public.complaints WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complaint not found' USING ERRCODE='P0002'; END IF;
  IF c.licensee_id IS NULL THEN
    RAISE EXCEPTION 'complaint must be linked to a licensee before escalation' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.enforcement_actions
    (entity_id, enforcement_type, status, description, findings, opened_by, source_type, source_reference_id)
  VALUES
    (c.licensee_id, 'complaint_escalation', 'open',
     format('Escalated from complaint %s: %s'||E'\n\nFindings: %s', c.complaint_number, c.subject, btrim(_findings)),
     btrim(_findings), actor, 'complaint', c.id)
  RETURNING id, case_number INTO new_ea_id, new_case_number;

  UPDATE public.complaints
     SET enforcement_action_id = new_ea_id, updated_at = now()
   WHERE id = _id;

  INSERT INTO public.enforcement_case_events (case_id, event_type, note, detail, actor_id)
  VALUES (new_ea_id, 'opened',
          format('Auto-opened from complaint %s', c.complaint_number),
          jsonb_build_object('complaint_id', c.id), actor);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (actor, 'complaint.escalated_to_enforcement', 'complaint', _id,
          jsonb_build_object('enforcement_action_id', c.enforcement_action_id),
          jsonb_build_object('enforcement_action_id', new_ea_id, 'case_number', new_case_number, 'findings', btrim(_findings)));

  complaint_id := _id;
  enforcement_id := new_ea_id;
  case_number := new_case_number;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_complaint(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_complaint_investigation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_complaint(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_complaint(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_complaint_to_enforcement(uuid,text) TO authenticated;
