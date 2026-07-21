
-- Slice 11: Enforcement & Inspection RBAC Lockdown

-- 1) Permissions
INSERT INTO public.permissions (module, name, description, enforced) VALUES
  ('enforcement_management','view','View enforcement cases and events', true),
  ('enforcement_management','create','Open enforcement cases', true),
  ('enforcement_management','edit','Update enforcement cases and events', true),
  ('enforcement_management','delete','Delete enforcement cases and events', true),
  ('enforcement_management','view_all_entities','View enforcement cases for all entities', true),
  ('enforcement_management','workflow_action','Progress enforcement workflow', true),
  ('inspection_management','view','View inspections and findings', true),
  ('inspection_management','create','Schedule/create inspections and findings', true),
  ('inspection_management','edit','Update inspections and findings', true),
  ('inspection_management','delete','Delete inspections and findings', true),
  ('inspection_management','view_all_entities','View inspections for all entities', true),
  ('inspection_management','workflow_action','Progress inspection workflow', true)
ON CONFLICT (module, name) DO UPDATE
SET description = EXCLUDED.description, enforced = EXCLUDED.enforced;

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.can_read_enforcement(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'enforcement_management', 'view_all_entities')
    OR (public.has_permission(_user_id, 'enforcement_management', 'view')
        AND (_entity_id IS NULL OR public.user_has_entity_assignment(_user_id, _entity_id)))
    OR (_entity_id IS NOT NULL AND public.user_has_entity_assignment(_user_id, _entity_id));
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_enforcement(_user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_permission(_user_id, 'enforcement_management', _action);
$$;

CREATE OR REPLACE FUNCTION public.can_read_inspection(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'inspection_management', 'view_all_entities')
    OR (public.has_permission(_user_id, 'inspection_management', 'view')
        AND (_entity_id IS NULL OR public.user_has_entity_assignment(_user_id, _entity_id)))
    OR (_entity_id IS NOT NULL AND public.user_has_entity_assignment(_user_id, _entity_id));
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_inspection(_user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_permission(_user_id, 'inspection_management', _action);
$$;

REVOKE ALL ON FUNCTION public.can_read_enforcement(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_act_on_enforcement(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_inspection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_act_on_inspection(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_enforcement(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_enforcement(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_inspection(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_inspection(uuid,text) TO authenticated, service_role;

-- 3) Grants
REVOKE ALL ON public.enforcement_actions FROM anon;
REVOKE ALL ON public.enforcement_case_events FROM anon;
REVOKE ALL ON public.inspections FROM anon;
REVOKE ALL ON public.inspection_findings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enforcement_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enforcement_case_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_findings TO authenticated;
GRANT ALL ON public.enforcement_actions TO service_role;
GRANT ALL ON public.enforcement_case_events TO service_role;
GRANT ALL ON public.inspections TO service_role;
GRANT ALL ON public.inspection_findings TO service_role;

-- 4) Drop legacy policies
DROP POLICY IF EXISTS "Admins manage enforcement actions" ON public.enforcement_actions;
DROP POLICY IF EXISTS "Authenticated read enforcement actions" ON public.enforcement_actions;
DROP POLICY IF EXISTS "external_users_denied_enforcement_actions" ON public.enforcement_actions;
DROP POLICY IF EXISTS "Authenticated read enforcement case events" ON public.enforcement_case_events;
DROP POLICY IF EXISTS "Staff manage enforcement case events" ON public.enforcement_case_events;
DROP POLICY IF EXISTS "Admins manage inspections" ON public.inspections;
DROP POLICY IF EXISTS "Authenticated read inspections" ON public.inspections;
DROP POLICY IF EXISTS "external_users_denied_inspections" ON public.inspections;
DROP POLICY IF EXISTS "Internal staff read inspection findings" ON public.inspection_findings;
DROP POLICY IF EXISTS "Internal staff insert inspection findings" ON public.inspection_findings;
DROP POLICY IF EXISTS "Internal staff update inspection findings" ON public.inspection_findings;
DROP POLICY IF EXISTS "Internal staff delete inspection findings" ON public.inspection_findings;

ALTER TABLE public.enforcement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enforcement_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_findings ENABLE ROW LEVEL SECURITY;

-- 5) enforcement_actions
CREATE POLICY ea_select ON public.enforcement_actions FOR SELECT TO authenticated
USING (public.can_read_enforcement(auth.uid(), entity_id));
CREATE POLICY ea_insert ON public.enforcement_actions FOR INSERT TO authenticated
WITH CHECK (public.can_act_on_enforcement(auth.uid(), 'create')
  AND (opened_by IS NULL OR opened_by = auth.uid()));
CREATE POLICY ea_update ON public.enforcement_actions FOR UPDATE TO authenticated
USING (public.can_act_on_enforcement(auth.uid(),'edit') OR public.can_act_on_enforcement(auth.uid(),'workflow_action'))
WITH CHECK (public.can_act_on_enforcement(auth.uid(),'edit') OR public.can_act_on_enforcement(auth.uid(),'workflow_action'));
CREATE POLICY ea_delete ON public.enforcement_actions FOR DELETE TO authenticated
USING (public.can_act_on_enforcement(auth.uid(),'delete'));

-- 6) enforcement_case_events
CREATE POLICY ece_select ON public.enforcement_case_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.enforcement_actions ea
  WHERE ea.id = enforcement_case_events.case_id
    AND public.can_read_enforcement(auth.uid(), ea.entity_id)));
CREATE POLICY ece_insert ON public.enforcement_case_events FOR INSERT TO authenticated
WITH CHECK (public.can_act_on_enforcement(auth.uid(),'workflow_action')
  AND (actor_id IS NULL OR actor_id = auth.uid()));
CREATE POLICY ece_update ON public.enforcement_case_events FOR UPDATE TO authenticated
USING (public.can_act_on_enforcement(auth.uid(),'edit'))
WITH CHECK (public.can_act_on_enforcement(auth.uid(),'edit'));
CREATE POLICY ece_delete ON public.enforcement_case_events FOR DELETE TO authenticated
USING (public.can_act_on_enforcement(auth.uid(),'delete'));

-- 7) inspections
CREATE POLICY ins_select ON public.inspections FOR SELECT TO authenticated
USING (public.can_read_inspection(auth.uid(), entity_id));
CREATE POLICY ins_insert ON public.inspections FOR INSERT TO authenticated
WITH CHECK (public.can_act_on_inspection(auth.uid(),'create'));
CREATE POLICY ins_update ON public.inspections FOR UPDATE TO authenticated
USING (public.can_act_on_inspection(auth.uid(),'edit') OR public.can_act_on_inspection(auth.uid(),'workflow_action'))
WITH CHECK (public.can_act_on_inspection(auth.uid(),'edit') OR public.can_act_on_inspection(auth.uid(),'workflow_action'));
CREATE POLICY ins_delete ON public.inspections FOR DELETE TO authenticated
USING (public.can_act_on_inspection(auth.uid(),'delete'));

-- 8) inspection_findings
CREATE POLICY inf_select ON public.inspection_findings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inspections i
  WHERE i.id = inspection_findings.inspection_id
    AND public.can_read_inspection(auth.uid(), i.entity_id)));
CREATE POLICY inf_insert ON public.inspection_findings FOR INSERT TO authenticated
WITH CHECK (public.can_act_on_inspection(auth.uid(),'create')
  AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY inf_update ON public.inspection_findings FOR UPDATE TO authenticated
USING (public.can_act_on_inspection(auth.uid(),'edit') OR public.can_act_on_inspection(auth.uid(),'workflow_action'))
WITH CHECK (public.can_act_on_inspection(auth.uid(),'edit') OR public.can_act_on_inspection(auth.uid(),'workflow_action'));
CREATE POLICY inf_delete ON public.inspection_findings FOR DELETE TO authenticated
USING (public.can_act_on_inspection(auth.uid(),'delete'));
