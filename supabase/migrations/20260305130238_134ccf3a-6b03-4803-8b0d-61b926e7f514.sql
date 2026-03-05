
-- Sectors table
CREATE TABLE public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read sectors" ON public.sectors FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sectors" ON public.sectors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sectors" ON public.sectors FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete sectors" ON public.sectors FOR DELETE USING (true);

-- Sub-Sectors table
CREATE TABLE public.sub_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sub_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read sub_sectors" ON public.sub_sectors FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sub_sectors" ON public.sub_sectors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sub_sectors" ON public.sub_sectors FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete sub_sectors" ON public.sub_sectors FOR DELETE USING (true);

-- Categories table
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  sub_sector_id uuid NOT NULL REFERENCES public.sub_sectors(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Anyone can insert categories" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update categories" ON public.categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete categories" ON public.categories FOR DELETE USING (true);

-- Services table
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  sub_sector_id uuid NOT NULL REFERENCES public.sub_sectors(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Anyone can insert services" ON public.services FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update services" ON public.services FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete services" ON public.services FOR DELETE USING (true);
