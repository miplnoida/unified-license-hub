
-- Slice 10: Fit & Proper RBAC

DO $$
DECLARE mod_id uuid;
BEGIN
  SELECT id INTO mod_id FROM public.permission_modules WHERE key='fit_and_proper';
  IF mod_id IS NULL THEN
    INSERT INTO public.permission_modules(key,label) VALUES('fit_and_proper','Fit & Proper Management') RETURNING id INTO mod_id;
  END IF;
  INSERT INTO public.permission_actions(module_id,key,label,audience,is_system) VALUES
    (mod_id,'view','View F&P Records','internal',true),
    (mod_id,'create','Create F&P Records','internal',true),
    (mod_id,'edit','Edit F&P Records','internal',true),
    (mod_id,'delete','Delete F&P Records','internal',true),
    (mod_id,'view_all_entities','View All Entities','internal',true),
    (mod_id,'manage_config','Manage F&P Configuration','internal',true),
    (mod_id,'workflow_action','Act on F&P Workflow','internal',true)
  ON CONFLICT (module_id,key) DO NOTHING;

  INSERT INTO public.permissions(module, action_id, name, enforced)
  SELECT 'fit_and_proper', a.id, a.key, true
  FROM public.permission_actions a
  WHERE a.module_id = mod_id
    AND a.key IN ('view','create','edit','delete','view_all_entities','manage_config','workflow_action')
  ON CONFLICT DO NOTHING;
END$$;

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.can_manage_fp_config(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','manage_config');
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_fp(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','workflow_action')
      OR public.has_permission(_user,'fit_and_proper','edit')
      OR public.has_permission(_user,'fit_and_proper','create');
$$;

CREATE OR REPLACE FUNCTION public.can_read_fp_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view_all_entities')
      OR (
        public.has_permission(_user,'fit_and_proper','view')
        AND (
          _licensee_id IS NULL
          OR public.user_has_entity_assignment(_user, _licensee_id)
          OR EXISTS (SELECT 1 FROM public.entity_user_access eua WHERE eua.entity_id=_licensee_id AND eua.user_id=_user)
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_fp_individual(_user uuid, _individual_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view_all_entities')
      OR EXISTS (SELECT 1 FROM public.fp_individuals fi WHERE fi.id=_individual_id AND fi.user_id=_user)
      OR (
        public.has_permission(_user,'fit_and_proper','view')
        AND EXISTS (
          SELECT 1 FROM public.fp_individual_roles r
          WHERE r.individual_id = _individual_id
            AND public.user_has_entity_assignment(_user, r.licensee_id)
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_fp_assessment(_user uuid, _assessment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view_all_entities')
      OR EXISTS (
        SELECT 1 FROM public.fp_assessments a
        WHERE a.id = _assessment_id
          AND (
            a.submitted_by = _user
            OR a.created_by = _user
            OR (public.has_permission(_user,'fit_and_proper','view')
                AND public.user_has_entity_assignment(_user, a.licensee_id))
          )
      );
$$;

-- ============ Reset policies + grants on 17 tables ============
DO $$
DECLARE t text; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fp_screening_configs','fp_screening_execution_rules','fp_sector_decision_rules',
    'fp_committees','fp_committee_members',
    'fp_individuals','fp_individual_roles','fp_assessments',
    'fp_determinations','fp_appeals','fp_findings','fp_conditions',
    'fp_manual_screening_tasks','fp_task_evidence',
    'fp_screening_runs','fp_monitoring_events','fp_committee_votes'
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

-- ============ Config tables (read=authenticated, write=can_manage_fp_config) ============
CREATE POLICY "fp_screening_configs_read" ON public.fp_screening_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_screening_configs_write" ON public.fp_screening_configs FOR ALL TO authenticated USING (public.can_manage_fp_config(auth.uid())) WITH CHECK (public.can_manage_fp_config(auth.uid()));

CREATE POLICY "fp_screening_execution_rules_read" ON public.fp_screening_execution_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_screening_execution_rules_write" ON public.fp_screening_execution_rules FOR ALL TO authenticated USING (public.can_manage_fp_config(auth.uid())) WITH CHECK (public.can_manage_fp_config(auth.uid()));

CREATE POLICY "fp_sector_decision_rules_read" ON public.fp_sector_decision_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_sector_decision_rules_write" ON public.fp_sector_decision_rules FOR ALL TO authenticated USING (public.can_manage_fp_config(auth.uid())) WITH CHECK (public.can_manage_fp_config(auth.uid()));

CREATE POLICY "fp_committees_read" ON public.fp_committees FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_committees_write" ON public.fp_committees FOR ALL TO authenticated USING (public.can_manage_fp_config(auth.uid())) WITH CHECK (public.can_manage_fp_config(auth.uid()));

CREATE POLICY "fp_committee_members_read" ON public.fp_committee_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_committee_members_write" ON public.fp_committee_members FOR ALL TO authenticated USING (public.can_manage_fp_config(auth.uid())) WITH CHECK (public.can_manage_fp_config(auth.uid()));

-- ============ fp_individuals (individual can see self; assigned regulator + view_all) ============
CREATE POLICY "fp_individuals_read" ON public.fp_individuals FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), id));
CREATE POLICY "fp_individuals_insert" ON public.fp_individuals FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.can_act_on_fp(auth.uid()) OR user_id = auth.uid())
  );
CREATE POLICY "fp_individuals_update" ON public.fp_individuals FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
    OR user_id = auth.uid()
  );
CREATE POLICY "fp_individuals_delete" ON public.fp_individuals FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'fit_and_proper','delete'));

-- ============ fp_individual_roles (licensee-scoped) ============
CREATE POLICY "fp_individual_roles_read" ON public.fp_individual_roles FOR SELECT TO authenticated
  USING (public.can_read_fp_licensee(auth.uid(), licensee_id) OR public.can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY "fp_individual_roles_insert" ON public.fp_individual_roles FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_act_on_fp(auth.uid())
    AND (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'fit_and_proper','view_all_entities')
         OR public.user_has_entity_assignment(auth.uid(), licensee_id))
  );
CREATE POLICY "fp_individual_roles_update" ON public.fp_individual_roles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'fit_and_proper','edit'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'fit_and_proper','edit'));
CREATE POLICY "fp_individual_roles_delete" ON public.fp_individual_roles FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'fit_and_proper','delete'));

-- ============ fp_assessments ============
CREATE POLICY "fp_assessments_read" ON public.fp_assessments FOR SELECT TO authenticated
  USING (public.can_read_fp_assessment(auth.uid(), id) OR public.can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY "fp_assessments_insert" ON public.fp_assessments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_act_on_fp(auth.uid())
    AND (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'fit_and_proper','view_all_entities')
         OR public.user_has_entity_assignment(auth.uid(), licensee_id))
  );
CREATE POLICY "fp_assessments_update" ON public.fp_assessments FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );
CREATE POLICY "fp_assessments_delete" ON public.fp_assessments FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'fit_and_proper','delete'));

-- ============ Assessment/individual child tables (read via parent, write via edit/workflow) ============
CREATE POLICY "fp_determinations_read" ON public.fp_determinations FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id) OR public.can_read_fp_assessment(auth.uid(), assessment_id));
CREATE POLICY "fp_determinations_write" ON public.fp_determinations FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );

CREATE POLICY "fp_appeals_read" ON public.fp_appeals FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY "fp_appeals_write" ON public.fp_appeals FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );

CREATE POLICY "fp_findings_read" ON public.fp_findings FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id) OR public.can_read_fp_assessment(auth.uid(), assessment_id));
CREATE POLICY "fp_findings_write" ON public.fp_findings FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );

CREATE POLICY "fp_conditions_read" ON public.fp_conditions FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY "fp_conditions_write" ON public.fp_conditions FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );

CREATE POLICY "fp_manual_screening_tasks_read" ON public.fp_manual_screening_tasks FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id) OR public.can_read_fp_assessment(auth.uid(), assessment_id) OR assigned_to = auth.uid());
CREATE POLICY "fp_manual_screening_tasks_write" ON public.fp_manual_screening_tasks FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
    OR assigned_to = auth.uid()
  );

CREATE POLICY "fp_task_evidence_read" ON public.fp_task_evidence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fp_manual_screening_tasks t WHERE t.id = task_id
                 AND (public.can_read_fp_individual(auth.uid(), t.individual_id) OR t.assigned_to = auth.uid())));
CREATE POLICY "fp_task_evidence_write" ON public.fp_task_evidence FOR ALL TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.fp_manual_screening_tasks t WHERE t.id = task_id
                AND (t.assigned_to = auth.uid()
                     OR public.has_permission(auth.uid(),'fit_and_proper','edit')
                     OR public.is_super_admin(auth.uid())))
  );

CREATE POLICY "fp_screening_runs_read" ON public.fp_screening_runs FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id) OR public.can_read_fp_assessment(auth.uid(), assessment_id));
CREATE POLICY "fp_screening_runs_write" ON public.fp_screening_runs FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );

CREATE POLICY "fp_monitoring_events_read" ON public.fp_monitoring_events FOR SELECT TO authenticated
  USING (public.can_read_fp_individual(auth.uid(), individual_id));
CREATE POLICY "fp_monitoring_events_write" ON public.fp_monitoring_events FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','edit')
    OR public.has_permission(auth.uid(),'fit_and_proper','workflow_action')
  );

-- ============ Committee votes: only committee members may cast; readable by view_all/committee members ============
CREATE POLICY "fp_committee_votes_read" ON public.fp_committee_votes FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'fit_and_proper','view_all_entities')
    OR EXISTS (SELECT 1 FROM public.fp_committee_members m
               WHERE m.committee_id = fp_committee_votes.committee_id AND m.user_id = auth.uid())
  );
CREATE POLICY "fp_committee_votes_insert" ON public.fp_committee_votes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.fp_committee_members m
            WHERE m.id = fp_committee_votes.member_id
              AND m.user_id = auth.uid()
              AND m.is_active
              AND m.committee_id = fp_committee_votes.committee_id)
  );
CREATE POLICY "fp_committee_votes_update" ON public.fp_committee_votes FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fp_committee_members m
            WHERE m.id = fp_committee_votes.member_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.fp_committee_members m
            WHERE m.id = fp_committee_votes.member_id AND m.user_id = auth.uid())
  );
