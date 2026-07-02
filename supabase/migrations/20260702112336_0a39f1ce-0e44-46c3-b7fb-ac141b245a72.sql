
-- Phase 2.1a — RFI subsystem

CREATE TABLE IF NOT EXISTS public.application_rfis (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  summary text,
  closure_notes text,
  closed_by uuid,
  closed_at timestamptz,
  approval_step_action_id uuid REFERENCES public.approval_step_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_rfis_status_check CHECK (status IN ('open','responded','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS application_rfis_application_id_idx ON public.application_rfis(application_id);
CREATE INDEX IF NOT EXISTS application_rfis_status_due_idx ON public.application_rfis(status, due_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_rfis TO authenticated;
GRANT ALL ON public.application_rfis TO service_role;

ALTER TABLE public.application_rfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants view own RFIs" ON public.application_rfis;
CREATE POLICY "Applicants view own RFIs"
ON public.application_rfis FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_rfis.application_id AND a.applicant_id = auth.uid()));

DROP POLICY IF EXISTS "Internal manage RFIs" ON public.application_rfis;
CREATE POLICY "Internal manage RFIs"
ON public.application_rfis FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'licensing_officer') OR
  public.has_role(auth.uid(),'analyst') OR public.has_role(auth.uid(),'legal_compliance')
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'licensing_officer') OR
  public.has_role(auth.uid(),'analyst') OR public.has_role(auth.uid(),'legal_compliance')
);

CREATE TABLE IF NOT EXISTS public.application_rfi_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid NOT NULL REFERENCES public.application_rfis(id) ON DELETE CASCADE,
  ordinal integer NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  question_type text NOT NULL DEFAULT 'text',
  required boolean NOT NULL DEFAULT true,
  item_due_at timestamptz,
  response_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_rfi_items_type_check CHECK (question_type IN ('text','document','both')),
  CONSTRAINT application_rfi_items_response_status_check CHECK (response_status IN ('pending','responded','skipped'))
);
CREATE INDEX IF NOT EXISTS application_rfi_items_rfi_id_idx ON public.application_rfi_items(rfi_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_rfi_items TO authenticated;
GRANT ALL ON public.application_rfi_items TO service_role;

ALTER TABLE public.application_rfi_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants view own RFI items" ON public.application_rfi_items;
CREATE POLICY "Applicants view own RFI items"
ON public.application_rfi_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.application_rfis r
  JOIN public.applications a ON a.id = r.application_id
  WHERE r.id = application_rfi_items.rfi_id AND a.applicant_id = auth.uid()
));

DROP POLICY IF EXISTS "Internal manage RFI items" ON public.application_rfi_items;
CREATE POLICY "Internal manage RFI items"
ON public.application_rfi_items FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'licensing_officer') OR
  public.has_role(auth.uid(),'analyst') OR public.has_role(auth.uid(),'legal_compliance')
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'licensing_officer') OR
  public.has_role(auth.uid(),'analyst') OR public.has_role(auth.uid(),'legal_compliance')
);

CREATE TABLE IF NOT EXISTS public.application_rfi_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_item_id uuid NOT NULL REFERENCES public.application_rfi_items(id) ON DELETE CASCADE,
  response_text text,
  file_upload_ids uuid[] NOT NULL DEFAULT '{}',
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_rfi_responses_item_idx ON public.application_rfi_responses(rfi_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_rfi_responses TO authenticated;
GRANT ALL ON public.application_rfi_responses TO service_role;

ALTER TABLE public.application_rfi_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants respond to own RFIs" ON public.application_rfi_responses;
CREATE POLICY "Applicants respond to own RFIs"
ON public.application_rfi_responses FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.application_rfi_items it
  JOIN public.application_rfis r ON r.id = it.rfi_id
  JOIN public.applications a ON a.id = r.application_id
  WHERE it.id = application_rfi_responses.rfi_item_id AND a.applicant_id = auth.uid()
))
WITH CHECK (
  submitted_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.application_rfi_items it
    JOIN public.application_rfis r ON r.id = it.rfi_id
    JOIN public.applications a ON a.id = r.application_id
    WHERE it.id = application_rfi_responses.rfi_item_id AND a.applicant_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Internal view RFI responses" ON public.application_rfi_responses;
CREATE POLICY "Internal view RFI responses"
ON public.application_rfi_responses FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR
  public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'licensing_officer') OR
  public.has_role(auth.uid(),'analyst') OR public.has_role(auth.uid(),'legal_compliance')
);

ALTER TABLE public.approval_step_actions
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_rfis_touch ON public.application_rfis;
CREATE TRIGGER application_rfis_touch
BEFORE UPDATE ON public.application_rfis
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS application_rfi_items_touch ON public.application_rfi_items;
CREATE TRIGGER application_rfi_items_touch
BEFORE UPDATE ON public.application_rfi_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Notification events (using actual columns: channels, notification_type, title_template, message_template)
INSERT INTO public.notification_event_configs (event_key, description, channels, notification_type, title_template, message_template, is_active)
VALUES
  ('application.rfi_raised',
   'A reviewer requested more information on an application.',
   ARRAY['in_app','email']::text[], 'application',
   'Additional information requested',
   'A reviewer has requested more information on application {{application_number}}. Please respond by {{due_date}}.',
   true),
  ('application.rfi_responded',
   'An applicant submitted responses to an RFI.',
   ARRAY['in_app']::text[], 'application',
   'RFI response submitted',
   'Applicant has responded to the RFI on application {{application_number}}.',
   true),
  ('application.rfi_near_due',
   'RFI response is due within 48 hours.',
   ARRAY['in_app','email']::text[], 'application',
   'RFI response due soon',
   'Your response to the RFI on application {{application_number}} is due on {{due_date}}.',
   true)
ON CONFLICT (event_key) DO NOTHING;
