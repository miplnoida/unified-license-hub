
-- 1. Recipient type enum
DO $$ BEGIN
  CREATE TYPE public.workflow_notification_recipient AS ENUM (
    'applicant', 'current_approver', 'previous_actor', 'role', 'admin', 'custom_email'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.approval_action_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  event_key text NOT NULL,
  recipient_type public.workflow_notification_recipient NOT NULL,
  recipient_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, action_type, event_key, recipient_type)
);

CREATE INDEX IF NOT EXISTS idx_aan_step_action ON public.approval_action_notifications(step_id, action_type);

-- 3. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_action_notifications TO authenticated;
GRANT ALL ON public.approval_action_notifications TO service_role;

-- 4. RLS
ALTER TABLE public.approval_action_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read action notifications"
ON public.approval_action_notifications FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage action notifications"
ON public.approval_action_notifications FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_aan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_aan_updated_at ON public.approval_action_notifications;
CREATE TRIGGER trg_aan_updated_at BEFORE UPDATE ON public.approval_action_notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_aan_updated_at();
