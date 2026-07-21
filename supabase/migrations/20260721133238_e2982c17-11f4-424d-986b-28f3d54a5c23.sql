
-- Slice 8: Approval Workflow & Collaborative Review RBAC

DO $$
DECLARE mod_id uuid;
BEGIN
  SELECT id INTO mod_id FROM public.permission_modules WHERE key='workflow_management';
  IF mod_id IS NULL THEN
    INSERT INTO public.permission_modules(key,label) VALUES('workflow_management','Workflow Management') RETURNING id INTO mod_id;
  END IF;
  INSERT INTO public.permission_actions(module_id,key,label,audience,is_system) VALUES
    (mod_id,'delete','Delete Workflow','internal',true),
    (mod_id,'workflow_action','Act on Workflow','internal',true),
    (mod_id,'manage_config','Manage Workflow Configuration','internal',true),
    (mod_id,'view_all','View All Workflow Instances','internal',true)
  ON CONFLICT (module_id,key) DO NOTHING;
END$$;

CREATE OR REPLACE FUNCTION public.can_read_approval_config(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'workflow_management','view')
      OR public.has_permission(_user,'workflow_management','manage_config');
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_approval_config(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'workflow_management','manage_config');
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_approval(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'workflow_management','workflow_action')
      OR public.has_permission(_user,'workflow_management','manage_config');
$$;

CREATE OR REPLACE FUNCTION public.can_read_workflow_instance(_user uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'workflow_management','view')
      OR public.has_permission(_user,'workflow_management','view_all')
      OR EXISTS (SELECT 1 FROM public.applications a WHERE a.id=_entity_id AND a.applicant_id=_user);
$$;

DO $$
DECLARE t text; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'approval_workflows','approval_workflow_versions','approval_workflow_types',
    'approval_steps','approval_step_actions','approval_actions',
    'approval_action_notifications','approval_step_entry_notifications',
    'delegation_rules','workflow_instances','workflow_templates',
    'review_comments','review_suggestions','review_step_permissions',
    'review_role_display_settings','review_narrative_fields'
  ] LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;

CREATE POLICY "workflow_config_read" ON public.approval_workflows FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "workflow_config_write" ON public.approval_workflows FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "workflow_versions_read" ON public.approval_workflow_versions FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "workflow_versions_write" ON public.approval_workflow_versions FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "workflow_types_read" ON public.approval_workflow_types FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "workflow_types_write" ON public.approval_workflow_types FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "approval_steps_read" ON public.approval_steps FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "approval_steps_write" ON public.approval_steps FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "approval_step_actions_read" ON public.approval_step_actions FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "approval_step_actions_write" ON public.approval_step_actions FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "delegation_rules_read" ON public.delegation_rules FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "delegation_rules_write" ON public.delegation_rules FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "workflow_templates_read" ON public.workflow_templates FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "workflow_templates_write" ON public.workflow_templates FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "approval_actions_read" ON public.approval_actions FOR SELECT TO authenticated
  USING (auth.uid() = actor_id OR public.can_read_approval_config(auth.uid()) OR public.can_act_on_approval(auth.uid()));
CREATE POLICY "approval_actions_insert" ON public.approval_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id AND public.can_act_on_approval(auth.uid()));
CREATE POLICY "approval_actions_update" ON public.approval_actions FOR UPDATE TO authenticated
  USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));
CREATE POLICY "approval_actions_delete" ON public.approval_actions FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "approval_action_notif_read" ON public.approval_action_notifications FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "approval_action_notif_write" ON public.approval_action_notifications FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "approval_step_entry_notif_read" ON public.approval_step_entry_notifications FOR SELECT TO authenticated USING (public.can_read_approval_config(auth.uid()));
CREATE POLICY "approval_step_entry_notif_write" ON public.approval_step_entry_notifications FOR ALL TO authenticated USING (public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "workflow_instances_read" ON public.workflow_instances FOR SELECT TO authenticated
  USING (public.can_read_workflow_instance(auth.uid(), entity_id));
CREATE POLICY "workflow_instances_write" ON public.workflow_instances FOR ALL TO authenticated
  USING (public.can_act_on_approval(auth.uid()) OR public.can_mutate_approval_config(auth.uid()))
  WITH CHECK (public.can_act_on_approval(auth.uid()) OR public.can_mutate_approval_config(auth.uid()));

CREATE POLICY "review_comments_select" ON public.review_comments FOR SELECT TO authenticated USING (public.can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY "review_comments_insert" ON public.review_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_user_id AND public.can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY "review_comments_update" ON public.review_comments FOR UPDATE TO authenticated USING (auth.uid() = author_user_id OR public.is_collab_admin(auth.uid())) WITH CHECK (auth.uid() = author_user_id OR public.is_collab_admin(auth.uid()));
CREATE POLICY "review_comments_delete" ON public.review_comments FOR DELETE TO authenticated USING (auth.uid() = author_user_id OR public.is_collab_admin(auth.uid()));

CREATE POLICY "review_suggestions_select" ON public.review_suggestions FOR SELECT TO authenticated USING (public.can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY "review_suggestions_insert" ON public.review_suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_user_id AND public.can_access_review_entity(auth.uid(), entity_type, entity_id));
CREATE POLICY "review_suggestions_update" ON public.review_suggestions FOR UPDATE TO authenticated USING (auth.uid() = author_user_id OR public.is_collab_admin(auth.uid())) WITH CHECK (auth.uid() = author_user_id OR public.is_collab_admin(auth.uid()));
CREATE POLICY "review_suggestions_delete" ON public.review_suggestions FOR DELETE TO authenticated USING (auth.uid() = author_user_id OR public.is_collab_admin(auth.uid()));

CREATE POLICY "review_step_perms_read" ON public.review_step_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "review_step_perms_write" ON public.review_step_permissions FOR ALL TO authenticated USING (public.is_collab_admin(auth.uid())) WITH CHECK (public.is_collab_admin(auth.uid()));

CREATE POLICY "review_role_display_read" ON public.review_role_display_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "review_role_display_write" ON public.review_role_display_settings FOR ALL TO authenticated USING (public.is_collab_admin(auth.uid())) WITH CHECK (public.is_collab_admin(auth.uid()));

CREATE POLICY "review_narrative_read" ON public.review_narrative_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "review_narrative_write" ON public.review_narrative_fields FOR ALL TO authenticated USING (public.is_collab_admin(auth.uid()) OR public.can_mutate_approval_config(auth.uid())) WITH CHECK (public.is_collab_admin(auth.uid()) OR public.can_mutate_approval_config(auth.uid()));
