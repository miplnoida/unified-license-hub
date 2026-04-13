-- Registration form configuration table
CREATE TABLE public.registration_form_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  form_template_id uuid REFERENCES public.form_templates(id) ON DELETE SET NULL,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  sub_sector_id uuid REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  require_otp boolean NOT NULL DEFAULT true,
  require_captcha boolean NOT NULL DEFAULT true,
  require_documents boolean NOT NULL DEFAULT true,
  terms_url text DEFAULT '',
  privacy_url text DEFAULT '',
  data_protection_url text DEFAULT '',
  declarations jsonb NOT NULL DEFAULT '[{"label":"I agree to the Terms & Conditions","required":true},{"label":"I agree to the Privacy Policy","required":true},{"label":"I agree to the Data Protection Notice","required":true}]'::jsonb,
  document_types jsonb NOT NULL DEFAULT '[{"label":"Certificate of Incorporation","required":true,"allowedTypes":[".pdf",".jpg",".png"],"maxSizeMB":5},{"label":"Tax Registration Certificate","required":false,"allowedTypes":[".pdf"],"maxSizeMB":5}]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.registration_form_configs ENABLE ROW LEVEL SECURITY;

-- Admins manage
CREATE POLICY "Admins manage registration form configs"
  ON public.registration_form_configs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Public read active configs (needed for public registration page)
CREATE POLICY "Public read active registration configs"
  ON public.registration_form_configs
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Ensure only one default config
CREATE UNIQUE INDEX idx_registration_form_configs_default 
  ON public.registration_form_configs (is_default) 
  WHERE is_default = true;