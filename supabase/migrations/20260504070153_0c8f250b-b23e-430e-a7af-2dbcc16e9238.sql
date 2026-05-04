
-- P2 / item 11: hot-path indexes
CREATE INDEX IF NOT EXISTS idx_applications_status_created
  ON public.applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_applicant_status_created
  ON public.applications (applicant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_form_version_id
  ON public.applications (form_version_id);

-- Case-insensitive search on application_number (LIKE / ILIKE prefix queries)
CREATE INDEX IF NOT EXISTS idx_applications_application_number_lower
  ON public.applications (lower(application_number) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_approval_actions_app_created
  ON public.approval_actions (application_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payments_application_id
  ON public.payments (application_id);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity_status
  ON public.workflow_instances (entity_type, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_steps_workflow_order
  ON public.approval_steps (workflow_id, step_order);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_match
  ON public.approval_workflows (entity_type, is_active, license_type, regulator_id, sector_id, category_id);
