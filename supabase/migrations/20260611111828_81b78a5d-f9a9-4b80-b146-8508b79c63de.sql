
-- Allow approver_type='specific_users' to bypass the role requirement.
CREATE OR REPLACE FUNCTION public.validate_approval_step_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_role record;
BEGIN
  -- Specific-users steps don't need a role; approver_config carries user_ids.
  IF COALESCE(NEW.approver_type, 'role_based_user') = 'specific_users' THEN
    RETURN NEW;
  END IF;

  IF NEW.approver_role_id IS NULL THEN
    RAISE EXCEPTION 'APPROVER_ROLE_ID_REQUIRED: approval steps must reference a configured role (roles.id)'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, is_system, system_role INTO v_role
    FROM public.roles WHERE id = NEW.approver_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVER_ROLE_NOT_FOUND: roles.id=% does not exist', NEW.approver_role_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_role.system_role = 'analyst' AND NOT (v_role.is_system AND lower(v_role.name) = 'analyst') THEN
    RAISE EXCEPTION 'INVALID_ROLE_MAPPING: role "%" has system_role=analyst but is not the built-in Analyst role', v_role.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_role.system_role IS NOT NULL THEN
    NEW.approver_role := v_role.system_role::public.app_role;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1. Extend approval_steps
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS approver_type text NOT NULL DEFAULT 'role_based_user',
  ADD COLUMN IF NOT EXISTS approver_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_approve_on_timeout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS step_entry_notifications_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.approval_steps
  DROP CONSTRAINT IF EXISTS approval_steps_approver_type_check;
ALTER TABLE public.approval_steps
  ADD CONSTRAINT approval_steps_approver_type_check
  CHECK (approver_type IN ('role_based_user', 'specific_users'));

-- Backfill approver_config without triggering the role validator unnecessarily.
-- Only update rows that have a role id and an empty config.
UPDATE public.approval_steps
SET approver_config = jsonb_build_object(
  'role_ids',
  jsonb_build_array(approver_role_id::text)
)
WHERE approver_role_id IS NOT NULL
  AND (approver_config = '{}'::jsonb OR approver_config IS NULL);

-- 2. approval_step_actions
CREATE TABLE IF NOT EXISTS public.approval_step_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  label text,
  require_comments boolean NOT NULL DEFAULT false,
  result_status_override text,
  next_step_mode text NOT NULL DEFAULT 'next',
  next_step_id uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  end_state text,
  sort_order int NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, action_type)
);

ALTER TABLE public.approval_step_actions
  DROP CONSTRAINT IF EXISTS approval_step_actions_next_step_mode_check;
ALTER TABLE public.approval_step_actions
  ADD CONSTRAINT approval_step_actions_next_step_mode_check
  CHECK (next_step_mode IN ('next','specific_step','previous','return_to_applicant','end_workflow','keep'));

ALTER TABLE public.approval_step_actions
  DROP CONSTRAINT IF EXISTS approval_step_actions_end_state_check;
ALTER TABLE public.approval_step_actions
  ADD CONSTRAINT approval_step_actions_end_state_check
  CHECK (end_state IS NULL OR end_state IN ('approved','rejected','cancelled'));

CREATE INDEX IF NOT EXISTS approval_step_actions_step_idx
  ON public.approval_step_actions(step_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_step_actions TO authenticated;
GRANT ALL ON public.approval_step_actions TO service_role;

ALTER TABLE public.approval_step_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read step actions" ON public.approval_step_actions;
CREATE POLICY "Authenticated can read step actions"
  ON public.approval_step_actions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage step actions" ON public.approval_step_actions;
CREATE POLICY "Admins manage step actions"
  ON public.approval_step_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_approval_step_actions_touch ON public.approval_step_actions;
CREATE TRIGGER trg_approval_step_actions_touch
  BEFORE UPDATE ON public.approval_step_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill per-action rows from existing allowed_actions
INSERT INTO public.approval_step_actions
  (step_id, action_type, label, require_comments, next_step_mode, end_state, sort_order)
SELECT
  s.id,
  act.value::text,
  initcap(replace(act.value::text, '_', ' ')),
  act.value::text IN ('approve','reject','request_resubmission','return_for_correction','request_more_info'),
  CASE
    WHEN act.value::text = 'reject' THEN 'end_workflow'
    WHEN act.value::text = 'approve' AND NOT EXISTS (
      SELECT 1 FROM public.approval_steps s2
      WHERE s2.workflow_id = s.workflow_id AND s2.step_order > s.step_order
    ) THEN 'end_workflow'
    WHEN act.value::text IN ('return_for_correction','request_more_info','request_resubmission') THEN 'return_to_applicant'
    WHEN act.value::text = 'send_back' THEN 'previous'
    ELSE 'next'
  END,
  CASE
    WHEN act.value::text = 'reject' THEN 'rejected'
    WHEN act.value::text = 'approve' AND NOT EXISTS (
      SELECT 1 FROM public.approval_steps s2
      WHERE s2.workflow_id = s.workflow_id AND s2.step_order > s.step_order
    ) THEN 'approved'
    ELSE NULL
  END,
  act.ord::int
FROM public.approval_steps s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s.allowed_actions) = 'array' THEN s.allowed_actions ELSE '[]'::jsonb END
) WITH ORDINALITY AS act(value, ord)
ON CONFLICT (step_id, action_type) DO NOTHING;

-- 3. approval_step_entry_notifications
CREATE TABLE IF NOT EXISTS public.approval_step_entry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  recipient_type text NOT NULL,
  recipient_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_step_entry_notifications_step_idx
  ON public.approval_step_entry_notifications(step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_step_entry_notifications TO authenticated;
GRANT ALL ON public.approval_step_entry_notifications TO service_role;

ALTER TABLE public.approval_step_entry_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read step entry notifications" ON public.approval_step_entry_notifications;
CREATE POLICY "Authenticated can read step entry notifications"
  ON public.approval_step_entry_notifications FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage step entry notifications" ON public.approval_step_entry_notifications;
CREATE POLICY "Admins manage step entry notifications"
  ON public.approval_step_entry_notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_step_entry_notifications_touch ON public.approval_step_entry_notifications;
CREATE TRIGGER trg_step_entry_notifications_touch
  BEFORE UPDATE ON public.approval_step_entry_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
