
ALTER TABLE public.application_rfis
  ADD COLUMN IF NOT EXISTS near_due_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_application_rfis_open_due
  ON public.application_rfis (status, due_at)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.application_rfi_auto_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  workflow_type_key TEXT REFERENCES public.approval_workflow_types(key) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_template TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  required BOOLEAN NOT NULL DEFAULT true,
  default_due_days INTEGER NOT NULL DEFAULT 7,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rfi_auto_rules_question_type_chk
    CHECK (question_type IN ('text','document','text_and_document'))
);

GRANT SELECT ON public.application_rfi_auto_rules TO authenticated;
GRANT ALL ON public.application_rfi_auto_rules TO service_role;

ALTER TABLE public.application_rfi_auto_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated internal can read rfi auto rules"
  ON public.application_rfi_auto_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage rfi auto rules"
  ON public.application_rfi_auto_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_application_rfi_auto_rules_updated_at
  BEFORE UPDATE ON public.application_rfi_auto_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_rfi_auto_rules_workflow ON public.application_rfi_auto_rules (workflow_type_key) WHERE active;
CREATE INDEX IF NOT EXISTS idx_rfi_auto_rules_sector ON public.application_rfi_auto_rules (sector_id) WHERE active;

INSERT INTO public.notification_event_configs (event_key, description, title_template, message_template, channels, is_active)
VALUES
  ('application.rfi_near_due',
   'RFI item is approaching its due date',
   'RFI response due soon',
   'Your response to RFI on application {{application_reference}} is due on {{due_at}}.',
   ARRAY['in_app','email']::text[], true),
  ('application.rfi_overdue',
   'RFI item has passed its due date without response',
   'RFI response overdue',
   'The RFI on application {{application_reference}} was due on {{due_at}} and is now overdue.',
   ARRAY['in_app','email']::text[], true)
ON CONFLICT (event_key) DO NOTHING;
