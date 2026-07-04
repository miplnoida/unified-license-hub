
-- approval_workflows: SELECT
DROP POLICY IF EXISTS "Internal users read workflows" ON public.approval_workflows;
CREATE POLICY "Internal users read workflows"
  ON public.approval_workflows
  FOR SELECT
  USING (public.has_any_internal_role(auth.uid()));

-- approval_steps: SELECT
DROP POLICY IF EXISTS "Internal users read steps" ON public.approval_steps;
CREATE POLICY "Internal users read steps"
  ON public.approval_steps
  FOR SELECT
  USING (public.has_any_internal_role(auth.uid()));

-- workflow_instances: SELECT (keep applicant own-app branch)
DROP POLICY IF EXISTS "Internal users read workflow instances" ON public.workflow_instances;
CREATE POLICY "Internal users read workflow instances"
  ON public.workflow_instances
  FOR SELECT
  USING (
    public.has_any_internal_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = workflow_instances.entity_id
        AND a.applicant_id = auth.uid()
    )
  );

-- workflow_instances: ALL (admin/supervisor management → any internal role)
DROP POLICY IF EXISTS "Admins full access workflow instances" ON public.workflow_instances;
CREATE POLICY "Admins full access workflow instances"
  ON public.workflow_instances
  FOR ALL
  USING (public.has_any_internal_role(auth.uid()))
  WITH CHECK (public.has_any_internal_role(auth.uid()));

-- approval_actions: SELECT (keep own-post visibility)
DROP POLICY IF EXISTS "Read actions" ON public.approval_actions;
CREATE POLICY "Read actions"
  ON public.approval_actions
  FOR SELECT
  USING (
    auth.uid() = actor_id
    OR public.has_any_internal_role(auth.uid())
  );

-- approval_workflow_types: SELECT
DROP POLICY IF EXISTS "Internal users read workflow type config" ON public.approval_workflow_types;
CREATE POLICY "Internal users read workflow type config"
  ON public.approval_workflow_types
  FOR SELECT
  USING (public.has_any_internal_role(auth.uid()));
