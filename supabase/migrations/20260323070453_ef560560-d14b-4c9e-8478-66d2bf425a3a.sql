
-- Add foreign key ID columns to form_templates for dynamic lookups
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sub_sector_id uuid REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
