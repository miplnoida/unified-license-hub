
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can read site_settings"
  ON public.site_settings FOR SELECT
  TO authenticated, anon
  USING (true);

-- Only admins can update
CREATE POLICY "Admins can manage site_settings"
  ON public.site_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Seed default settings
INSERT INTO public.site_settings (key, value) VALUES
  ('branding', '{"site_name": "RegPortal", "logo_url": "", "favicon_url": "", "tagline": "Regulatory Licensing & Compliance Platform"}'::jsonb),
  ('header_menu', '[{"label": "Home", "href": "#"}, {"label": "Services", "href": "#services"}, {"label": "How It Works", "href": "#how-it-works"}, {"label": "About", "href": "#highlights"}, {"label": "Contact", "href": "#footer"}]'::jsonb),
  ('footer', '{"text": "Regulatory Licensing & Compliance Portal. All rights reserved.", "links": [{"label": "Privacy Policy", "href": "#"}, {"label": "Terms of Service", "href": "#"}, {"label": "Accessibility", "href": "#"}], "helpdesk": {"phone": "+1 (800) 555-0100", "email": "support@regportal.gov", "address": "Government Complex, Bldg A"}, "social": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;
