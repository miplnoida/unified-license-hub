-- Add version tracking columns for submission auditing
ALTER TABLE public.return_form_data
  ADD COLUMN IF NOT EXISTS form_version_id uuid REFERENCES public.form_versions(id);

CREATE INDEX IF NOT EXISTS idx_return_form_data_form_version
  ON public.return_form_data(form_version_id);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS form_version_id uuid REFERENCES public.form_versions(id);

CREATE INDEX IF NOT EXISTS idx_applications_form_version
  ON public.applications(form_version_id);

-- Idempotent flag so we only fire upcoming-version notifications once per
-- (template, version, audience).
ALTER TABLE public.form_versions
  ADD COLUMN IF NOT EXISTS notified_for_upcoming boolean NOT NULL DEFAULT false;
