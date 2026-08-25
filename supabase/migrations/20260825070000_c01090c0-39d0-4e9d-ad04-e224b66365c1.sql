-- 1. Structured complainant fields ------------------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS complainant_name text,
  ADD COLUMN IF NOT EXISTS complainant_phone text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS incident_date date;

-- 2. Support ticket context --------------------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_team text,
  ADD COLUMN IF NOT EXISTS license_id uuid,
  ADD COLUMN IF NOT EXISTS sector_id uuid,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS page_path text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- 3. Support permission module ----------------------------------------------
INSERT INTO public.sec_modules(key, label, description, module_type, audience, sort_order, is_system, is_active)
SELECT 'support_management', 'Support Management', 'Applicant / licensee technical support desk',
       m.module_type, m.audience, 900, true, true
  FROM public.sec_modules m WHERE m.key = 'complaint_management'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_permissions(module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, a.key, a.label, a.descr, a.ord, false, true, true, true
  FROM public.sec_modules m
  CROSS JOIN (VALUES
    ('view','View','View support tickets',10),
    ('assign','Assign','Assign support tickets to staff or a team',20),
    ('respond','Respond','Reply to support tickets',30),
    ('update','Update','Change priority, category or context of a ticket',40),
    ('resolve','Resolve','Mark a support ticket resolved',50),
    ('close','Close','Close a support ticket',60)
  ) AS a(key,label,descr,ord)
 WHERE m.key = 'support_management'
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_modules(key, label, description, audience, sort_order, is_system, is_active)
VALUES ('support_management','Support Management','Applicant / licensee technical support desk','internal',900,true,true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_actions(module_id, key, label, description, sort_order, is_system, audience, is_active)
SELECT m.id, a.key, a.label, a.descr, a.ord, true, 'internal', true
  FROM public.permission_modules m
  CROSS JOIN (VALUES
    ('view','View','View support tickets',10),
    ('assign','Assign','Assign support tickets',20),
    ('respond','Respond','Reply to support tickets',30),
    ('update','Update','Update ticket attributes',40),
    ('resolve','Resolve','Resolve support tickets',50),
    ('close','Close','Close support tickets',60)
  ) AS a(key,label,descr,ord)
 WHERE m.key = 'support_management'
ON CONFLICT DO NOTHING;

INSERT INTO public.permissions(name, module, description, action_id, enforced, deprecated)
SELECT a.key, 'support_management', a.description, a.id, true, false
  FROM public.permission_actions a
  JOIN public.permission_modules m ON m.id = a.module_id
 WHERE m.key = 'support_management'
   AND NOT EXISTS (
     SELECT 1 FROM public.permissions p WHERE p.module = 'support_management' AND p.name = a.key
   );

INSERT INTO public.rbac_module_scopes(module, scope, selector, label, help)
VALUES ('support_management','all','','All tickets',''),
       ('support_management','assigned','','Assigned only','')
ON CONFLICT DO NOTHING;

-- 4. Permission-driven staff predicate --------------------------------------
CREATE OR REPLACE FUNCTION public.support_is_staff(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'support_management', 'view')
    OR (public.sec_is_internal_user(_user_id) AND NOT public.has_external_role(_user_id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.support_is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_is_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.support_has_action(_action text, _uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_super_admin(_uid)
    OR public.has_permission(_uid, 'support_management', _action)
    OR (public.sec_is_internal_user(_uid) AND NOT public.has_external_role(_uid))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.support_has_action(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_has_action(text, uuid) TO authenticated, service_role;

-- 5. Attachments -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_ticket_messages(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_ticket_attachments TO authenticated;
GRANT ALL ON public.support_ticket_attachments TO service_role;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support attachments readable by requester or staff" ON public.support_ticket_attachments;
CREATE POLICY "support attachments readable by requester or staff"
  ON public.support_ticket_attachments FOR SELECT TO authenticated
  USING (
    public.support_is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_ticket_attachments.ticket_id
         AND t.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support attachments insertable by requester or staff" ON public.support_ticket_attachments;
CREATE POLICY "support attachments insertable by requester or staff"
  ON public.support_ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.support_is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
         WHERE t.id = support_ticket_attachments.ticket_id
           AND t.requester_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS support_ticket_attachments_ticket_idx
  ON public.support_ticket_attachments(ticket_id);

-- 6. Audit trail -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_ticket_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_ticket_audit TO authenticated;
GRANT ALL ON public.support_ticket_audit TO service_role;
ALTER TABLE public.support_ticket_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support audit readable by staff" ON public.support_ticket_audit;
CREATE POLICY "support audit readable by staff"
  ON public.support_ticket_audit FOR SELECT TO authenticated
  USING (public.support_is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS support_ticket_audit_ticket_idx
  ON public.support_ticket_audit(ticket_id, created_at DESC);
