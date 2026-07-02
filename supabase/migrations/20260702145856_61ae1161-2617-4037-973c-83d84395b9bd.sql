
CREATE TABLE public.correspondence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence_templates TO authenticated;
GRANT ALL ON public.correspondence_templates TO service_role;
ALTER TABLE public.correspondence_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff manage correspondence templates"
  ON public.correspondence_templates FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'legal_compliance')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'legal_compliance')
  );

CREATE TRIGGER trg_correspondence_templates_updated
  BEFORE UPDATE ON public.correspondence_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.correspondence_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.correspondence_templates(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_name TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corr_dispatch_source ON public.correspondence_dispatches(source_type, source_id);
CREATE INDEX idx_corr_dispatch_recipient ON public.correspondence_dispatches(recipient_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence_dispatches TO authenticated;
GRANT ALL ON public.correspondence_dispatches TO service_role;
ALTER TABLE public.correspondence_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage dispatches"
  ON public.correspondence_dispatches FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'legal_compliance')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'legal_compliance')
  );

CREATE POLICY "Recipients read their own dispatches"
  ON public.correspondence_dispatches FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE TRIGGER trg_correspondence_dispatches_updated
  BEFORE UPDATE ON public.correspondence_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
