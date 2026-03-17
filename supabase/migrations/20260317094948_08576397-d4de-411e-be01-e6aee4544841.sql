
-- Notification templates table
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type text NOT NULL, -- e.g. application_submitted, license_approved, return_overdue
  channel text NOT NULL DEFAULT 'email', -- email, sms, in_app
  subject text,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb, -- available merge fields
  is_active boolean NOT NULL DEFAULT true,
  regulator_id uuid REFERENCES public.regulators(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notification templates"
ON public.notification_templates FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read notification templates"
ON public.notification_templates FOR SELECT TO authenticated
USING (true);

CREATE INDEX idx_notification_templates_event ON public.notification_templates(event_type);
CREATE INDEX idx_notification_templates_channel ON public.notification_templates(channel);
