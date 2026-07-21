
-- Slice 9: Prudential Supervision RBAC

DO $$
DECLARE mod_id uuid;
BEGIN
  SELECT id INTO mod_id FROM public.permission_modules WHERE key='prudential_supervision';
  IF mod_id IS NULL THEN
    INSERT INTO public.permission_modules(key,label) VALUES('prudential_supervision','Prudential Supervision') RETURNING id INTO mod_id;
  END IF;
  INSERT INTO public.permission_actions(module_id,key,label,audience,is_system) VALUES
    (mod_id,'create','Create Prudential Records','internal',true),
    (mod_id,'edit','Edit Prudential Records','internal',true),
    (mod_id,'delete','Delete Prudential Records','internal',true),
    (mod_id,'view_all_entities','View All Entities','internal',true),
    (mod_id,'manage_config','Manage Prudential Configuration','internal',true),
    (mod_id,'workflow_action','Act on Prudential Workflow','internal',true)
  ON CONFLICT (module_id,key) DO NOTHING;

  INSERT INTO public.permissions(module, action_id, name, enforced)
  SELECT 'prudential_supervision', a.id, a.key, true
  FROM public.permission_actions a
  WHERE a.module_id = mod_id
    AND a.key IN ('create','edit','delete','view_all_entities','manage_config','workflow_action')
  ON CONFLICT DO NOTHING;
END$$;

CREATE OR REPLACE FUNCTION public.can_read_prudential_entity(_user uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'prudential_supervision','view_all_entities')
      OR (
        public.has_permission(_user,'prudential_supervision','view')
        AND (
          _entity_id IS NULL
          OR public.user_has_entity_assignment(_user, _entity_id)
          OR EXISTS (SELECT 1 FROM public.entity_user_access eua WHERE eua.entity_id=_entity_id AND eua.user_id=_user)
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_prudential_config(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'prudential_supervision','manage_config');
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_prudential(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'prudential_supervision','workflow_action')
      OR public.has_permission(_user,'prudential_supervision','edit')
      OR public.has_permission(_user,'prudential_supervision','create');
$$;

DO $$
DECLARE t text; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prudential_ratios','prudential_ratio_versions',
    'prudential_thresholds','prudential_threshold_versions',
    'prudential_risk_taxonomy','prudential_stress_indicators',
    'prudential_stress_events','prudential_assessments',
    'prudential_actions','prudential_escalations',
    'prudential_data_feed_logs'
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

CREATE POLICY "prudential_ratios_read" ON public.prudential_ratios FOR SELECT TO authenticated USING (true);
CREATE POLICY "prudential_ratios_write" ON public.prudential_ratios FOR ALL TO authenticated USING (public.can_manage_prudential_config(auth.uid())) WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE POLICY "prudential_ratio_versions_read" ON public.prudential_ratio_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "prudential_ratio_versions_write" ON public.prudential_ratio_versions FOR ALL TO authenticated USING (public.can_manage_prudential_config(auth.uid())) WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE POLICY "prudential_thresholds_read" ON public.prudential_thresholds FOR SELECT TO authenticated USING (true);
CREATE POLICY "prudential_thresholds_write" ON public.prudential_thresholds FOR ALL TO authenticated USING (public.can_manage_prudential_config(auth.uid())) WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE POLICY "prudential_threshold_versions_read" ON public.prudential_threshold_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "prudential_threshold_versions_write" ON public.prudential_threshold_versions FOR ALL TO authenticated USING (public.can_manage_prudential_config(auth.uid())) WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE POLICY "prudential_risk_taxonomy_read" ON public.prudential_risk_taxonomy FOR SELECT TO authenticated USING (true);
CREATE POLICY "prudential_risk_taxonomy_write" ON public.prudential_risk_taxonomy FOR ALL TO authenticated USING (public.can_manage_prudential_config(auth.uid())) WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE POLICY "prudential_stress_indicators_read" ON public.prudential_stress_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "prudential_stress_indicators_write" ON public.prudential_stress_indicators FOR ALL TO authenticated USING (public.can_manage_prudential_config(auth.uid())) WITH CHECK (public.can_manage_prudential_config(auth.uid()));

CREATE POLICY "prudential_assessments_read" ON public.prudential_assessments FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY "prudential_assessments_insert" ON public.prudential_assessments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_act_on_prudential(auth.uid())
    AND (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
         OR public.user_has_entity_assignment(auth.uid(), entity_id))
  );
CREATE POLICY "prudential_assessments_update" ON public.prudential_assessments FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
    OR public.has_permission(auth.uid(),'prudential_supervision','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
    OR public.has_permission(auth.uid(),'prudential_supervision','workflow_action')
  );
CREATE POLICY "prudential_assessments_delete" ON public.prudential_assessments FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'prudential_supervision','delete'));

CREATE POLICY "prudential_actions_read" ON public.prudential_actions FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY "prudential_actions_insert" ON public.prudential_actions FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_act_on_prudential(auth.uid())
    AND (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
         OR public.user_has_entity_assignment(auth.uid(), entity_id))
  );
CREATE POLICY "prudential_actions_update" ON public.prudential_actions FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
    OR public.has_permission(auth.uid(),'prudential_supervision','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
    OR public.has_permission(auth.uid(),'prudential_supervision','workflow_action')
  );
CREATE POLICY "prudential_actions_delete" ON public.prudential_actions FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'prudential_supervision','delete'));

CREATE POLICY "prudential_escalations_read" ON public.prudential_escalations FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY "prudential_escalations_insert" ON public.prudential_escalations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_act_on_prudential(auth.uid())
    AND (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
         OR public.user_has_entity_assignment(auth.uid(), entity_id))
  );
CREATE POLICY "prudential_escalations_update" ON public.prudential_escalations FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','workflow_action')
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','workflow_action')
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
  );
CREATE POLICY "prudential_escalations_delete" ON public.prudential_escalations FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'prudential_supervision','delete'));

CREATE POLICY "prudential_stress_events_read" ON public.prudential_stress_events FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));
CREATE POLICY "prudential_stress_events_write" ON public.prudential_stress_events FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
    OR public.has_permission(auth.uid(),'prudential_supervision','manage_config')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','edit')
    OR public.has_permission(auth.uid(),'prudential_supervision','manage_config')
  );

CREATE POLICY "prudential_data_feed_logs_read" ON public.prudential_data_feed_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
  );
-- writes only via service_role
