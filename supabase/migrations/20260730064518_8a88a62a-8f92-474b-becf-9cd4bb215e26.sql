-- ===========================================================================
-- Licensing Appeals module
-- ===========================================================================

-- 1. Panels ------------------------------------------------------------------
CREATE TABLE public.license_appeal_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  regulator_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_appeal_panels TO authenticated;
GRANT ALL ON public.license_appeal_panels TO service_role;
ALTER TABLE public.license_appeal_panels ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.license_appeal_panel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id uuid NOT NULL REFERENCES public.license_appeal_panels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (panel_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_appeal_panel_members TO authenticated;
GRANT ALL ON public.license_appeal_panel_members TO service_role;
ALTER TABLE public.license_appeal_panel_members ENABLE ROW LEVEL SECURITY;

-- 2. Appeals -----------------------------------------------------------------
CREATE TABLE public.license_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_reference text NOT NULL UNIQUE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  license_id uuid,
  licensee_id uuid,
  regulator_id uuid,
  filed_by uuid NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  appeal_deadline timestamptz,
  grounds text NOT NULL,
  relief_sought text,
  supporting_docs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'submitted',
  panel_id uuid REFERENCES public.license_appeal_panels(id) ON DELETE SET NULL,
  assigned_to uuid,
  hearing_date timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  decision text,
  decision_rationale text,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT license_appeals_status_chk CHECK (
    status IN ('submitted','under_review','panel_review','decided','withdrawn','rejected_out_of_time')
  ),
  CONSTRAINT license_appeals_decision_chk CHECK (
    decision IS NULL OR decision IN ('upheld','partially_upheld','dismissed','remitted','overturned_to_approved')
  )
);

CREATE INDEX idx_license_appeals_application ON public.license_appeals(application_id);
CREATE INDEX idx_license_appeals_status ON public.license_appeals(status);
CREATE INDEX idx_license_appeals_filed_by ON public.license_appeals(filed_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_appeals TO authenticated;
GRANT ALL ON public.license_appeals TO service_role;
ALTER TABLE public.license_appeals ENABLE ROW LEVEL SECURITY;

-- 3. Events ------------------------------------------------------------------
CREATE TABLE public.license_appeal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES public.license_appeals(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text NOT NULL,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_appeal_events_appeal ON public.license_appeal_events(appeal_id);

GRANT SELECT, INSERT ON public.license_appeal_events TO authenticated;
GRANT ALL ON public.license_appeal_events TO service_role;
ALTER TABLE public.license_appeal_events ENABLE ROW LEVEL SECURITY;

-- 4. Helper: can the current user read a given appeal? ------------------------
CREATE OR REPLACE FUNCTION public.can_read_license_appeal(_user_id uuid, _appeal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.license_appeals la
    JOIN public.applications a ON a.id = la.application_id
    WHERE la.id = _appeal_id
      AND (
        la.filed_by = _user_id
        OR a.applicant_id = _user_id
        OR public.has_permission(_user_id, 'license_appeals', 'view')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_license_appeal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_license_appeal(uuid, uuid) TO authenticated, service_role;

-- 5. Reference generation + validation ---------------------------------------
CREATE OR REPLACE FUNCTION public.license_appeal_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_seq integer;
  v_year text := to_char(now(), 'YYYY');
BEGIN
  SELECT id, status, rejected_at, regulator_id, applicant_id
    INTO v_app
  FROM public.applications
  WHERE id = NEW.application_id;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application_not_found';
  END IF;

  IF lower(coalesce(v_app.status, '')) <> 'rejected' THEN
    RAISE EXCEPTION 'appeal_requires_refused_application';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.license_appeals
    WHERE application_id = NEW.application_id
      AND status NOT IN ('withdrawn','rejected_out_of_time','decided')
  ) THEN
    RAISE EXCEPTION 'appeal_already_open_for_application';
  END IF;

  NEW.appeal_deadline := COALESCE(
    NEW.appeal_deadline,
    COALESCE(v_app.rejected_at, now()) + interval '30 days'
  );

  IF now() > NEW.appeal_deadline THEN
    RAISE EXCEPTION 'appeal_window_expired';
  END IF;

  NEW.regulator_id := COALESCE(NEW.regulator_id, v_app.regulator_id);
  NEW.filed_by := COALESCE(NEW.filed_by, auth.uid());
  NEW.status := COALESCE(NEW.status, 'submitted');

  SELECT count(*) + 1 INTO v_seq
  FROM public.license_appeals
  WHERE appeal_reference LIKE 'APL-' || v_year || '-%';

  NEW.appeal_reference := 'APL-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_license_appeal_before_insert
BEFORE INSERT ON public.license_appeals
FOR EACH ROW EXECUTE FUNCTION public.license_appeal_before_insert();

CREATE OR REPLACE FUNCTION public.license_appeal_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_license_appeals_touch
BEFORE UPDATE ON public.license_appeals
FOR EACH ROW EXECUTE FUNCTION public.license_appeal_touch();

CREATE TRIGGER trg_license_appeal_panels_touch
BEFORE UPDATE ON public.license_appeal_panels
FOR EACH ROW EXECUTE FUNCTION public.license_appeal_touch();

CREATE TRIGGER trg_license_appeal_panel_members_touch
BEFORE UPDATE ON public.license_appeal_panel_members
FOR EACH ROW EXECUTE FUNCTION public.license_appeal_touch();

-- Auto-log lifecycle events
CREATE OR REPLACE FUNCTION public.license_appeal_log_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id)
    VALUES (NEW.id, 'filed', 'Appeal lodged (' || NEW.appeal_reference || ')', NEW.filed_by);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id)
    VALUES (NEW.id, 'status_changed',
            'Status changed to ' || replace(NEW.status, '_', ' '), auth.uid());
  END IF;

  IF NEW.panel_id IS DISTINCT FROM OLD.panel_id AND NEW.panel_id IS NOT NULL THEN
    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id)
    VALUES (NEW.id, 'panel_assigned',
            'Appeal panel assigned: ' ||
            COALESCE((SELECT name FROM public.license_appeal_panels WHERE id = NEW.panel_id), 'panel'),
            auth.uid());
  END IF;

  IF NEW.hearing_date IS DISTINCT FROM OLD.hearing_date AND NEW.hearing_date IS NOT NULL THEN
    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id)
    VALUES (NEW.id, 'hearing_scheduled',
            'Hearing scheduled for ' || to_char(NEW.hearing_date, 'DD Mon YYYY'), auth.uid());
  END IF;

  IF NEW.decision IS DISTINCT FROM OLD.decision AND NEW.decision IS NOT NULL THEN
    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id)
    VALUES (NEW.id, 'decided',
            'Decision recorded: ' || replace(NEW.decision, '_', ' '), auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_license_appeal_log_insert
AFTER INSERT ON public.license_appeals
FOR EACH ROW EXECUTE FUNCTION public.license_appeal_log_event();

CREATE TRIGGER trg_license_appeal_log_update
AFTER UPDATE ON public.license_appeals
FOR EACH ROW EXECUTE FUNCTION public.license_appeal_log_event();

-- 6. RLS policies ------------------------------------------------------------
CREATE POLICY "appeals_select" ON public.license_appeals
FOR SELECT TO authenticated
USING (
  filed_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.applicant_id = auth.uid())
  OR public.has_permission(auth.uid(), 'license_appeals', 'view')
);

CREATE POLICY "appeals_insert" ON public.license_appeals
FOR INSERT TO authenticated
WITH CHECK (
  filed_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.applicant_id = auth.uid())
    OR public.has_permission(auth.uid(), 'license_appeals', 'create')
  )
);

CREATE POLICY "appeals_update_internal" ON public.license_appeals
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'license_appeals', 'edit'))
WITH CHECK (public.has_permission(auth.uid(), 'license_appeals', 'edit'));

-- applicant may only withdraw their own open appeal
CREATE POLICY "appeals_update_owner_withdraw" ON public.license_appeals
FOR UPDATE TO authenticated
USING (filed_by = auth.uid() AND status IN ('submitted','under_review'))
WITH CHECK (filed_by = auth.uid() AND status IN ('submitted','withdrawn','under_review'));

CREATE POLICY "appeal_events_select" ON public.license_appeal_events
FOR SELECT TO authenticated
USING (public.can_read_license_appeal(auth.uid(), appeal_id));

CREATE POLICY "appeal_events_insert" ON public.license_appeal_events
FOR INSERT TO authenticated
WITH CHECK (public.can_read_license_appeal(auth.uid(), appeal_id));

CREATE POLICY "appeal_panels_select" ON public.license_appeal_panels
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'license_appeals', 'view'));

CREATE POLICY "appeal_panels_manage" ON public.license_appeal_panels
FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'license_appeals', 'manage_config'))
WITH CHECK (public.has_permission(auth.uid(), 'license_appeals', 'manage_config'));

CREATE POLICY "appeal_panel_members_select" ON public.license_appeal_panel_members
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'license_appeals', 'view'));

CREATE POLICY "appeal_panel_members_manage" ON public.license_appeal_panel_members
FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'license_appeals', 'manage_config'))
WITH CHECK (public.has_permission(auth.uid(), 'license_appeals', 'manage_config'));

-- 7. Permission catalogue ----------------------------------------------------
INSERT INTO public.permission_modules (key, label, description, audience, is_system, sort_order)
VALUES ('license_appeals', 'Licensing Appeals',
        'Post-refusal appeal lodging, appeal register, panels and outcome tracking for licensing.',
        'both', true, 25)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_actions (module_id, key, label, audience, is_system, sort_order)
SELECT m.id, x.key, x.label, 'internal', true, x.sort_order
FROM public.permission_modules m
CROSS JOIN (VALUES
  ('view','View',10),
  ('create','Create',20),
  ('edit','Edit',30),
  ('assign_panel','Assign Panel',40),
  ('decide','Record Decision',50),
  ('manage_config','Manage Configuration',60),
  ('view_all_entities','View All Entities',70)
) AS x(key,label,sort_order)
WHERE m.key = 'license_appeals'
ON CONFLICT DO NOTHING;

INSERT INTO public.permissions (name, module, description, action_id)
SELECT a.key, 'license_appeals',
       a.label || ' licensing appeals',
       a.id
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key = 'license_appeals'
  AND NOT EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.module = 'license_appeals' AND p.name = a.key
  );

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.module = 'license_appeals'
  AND p.name = 'view'
  AND r.system_role IN ('super_admin','admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.module = 'license_appeals'
  AND p.name <> 'view'
  AND r.system_role IN ('super_admin','admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- 8. Notification event configs ---------------------------------------------
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template,
   email_subject_template, email_body_template, channels, recipient_rules,
   notification_type, is_active)
VALUES
  ('license_appeal.filed', 'Licensing appeal lodged',
   'Appeal lodged: {{appeal_reference}}',
   'An appeal has been lodged against refused application {{application_number}}.',
   'Appeal lodged: {{appeal_reference}}',
   'An appeal ({{appeal_reference}}) has been lodged against refused application {{application_number}}.',
   ARRAY['in_app','email'], '[{"type":"payload_user"}]'::jsonb, 'info', true),
  ('license_appeal.acknowledged', 'Licensing appeal acknowledged',
   'Appeal {{appeal_reference}} acknowledged',
   'Your appeal {{appeal_reference}} has been acknowledged and is under review.',
   'Appeal {{appeal_reference}} acknowledged',
   'Your appeal {{appeal_reference}} has been acknowledged and is now under review.',
   ARRAY['in_app','email'], '[{"type":"payload_user"}]'::jsonb, 'info', true),
  ('license_appeal.panel_assigned', 'Licensing appeal panel assigned',
   'Appeal {{appeal_reference}} referred to panel',
   'Your appeal {{appeal_reference}} has been referred to an appeal panel.',
   'Appeal {{appeal_reference}} referred to panel',
   'Your appeal {{appeal_reference}} has been referred to an appeal panel. {{hearing_line}}',
   ARRAY['in_app','email'], '[{"type":"payload_user"}]'::jsonb, 'info', true),
  ('license_appeal.decided', 'Licensing appeal decided',
   'Decision on appeal {{appeal_reference}}',
   'A decision has been made on your appeal {{appeal_reference}}: {{decision_label}}.',
   'Decision on appeal {{appeal_reference}}',
   'A decision has been made on your appeal {{appeal_reference}}: {{decision_label}}. {{decision_rationale}}',
   ARRAY['in_app','email'], '[{"type":"payload_user"}]'::jsonb, 'info', true)
ON CONFLICT (event_key) DO NOTHING;