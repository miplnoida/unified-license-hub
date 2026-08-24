ALTER TABLE public.sectors
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS display_group text,
  ADD COLUMN IF NOT EXISTS scope_note text,
  ADD COLUMN IF NOT EXISTS external_regulator text;

CREATE UNIQUE INDEX IF NOT EXISTS sectors_code_unique ON public.sectors (code) WHERE code IS NOT NULL;

ALTER TABLE public.sub_sectors
  ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS sub_sectors_code_unique ON public.sub_sectors (code) WHERE code IS NOT NULL;