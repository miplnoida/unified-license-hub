
-- Master Data Types (defines what datasets exist)
CREATE TABLE public.master_data_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT master_data_types_name_unique UNIQUE (name)
);

-- Master Data Items (the actual dropdown values)
CREATE TABLE public.master_data_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type_id UUID NOT NULL REFERENCES public.master_data_types(id) ON DELETE CASCADE,
  parent_item_id UUID REFERENCES public.master_data_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate item names within same type + parent
CREATE UNIQUE INDEX master_data_items_unique_name
  ON public.master_data_items (type_id, COALESCE(parent_item_id, '00000000-0000-0000-0000-000000000000'), LOWER(name));

-- Indexes for performance
CREATE INDEX idx_master_data_items_type ON public.master_data_items(type_id);
CREATE INDEX idx_master_data_items_parent ON public.master_data_items(parent_item_id);
CREATE INDEX idx_master_data_items_status ON public.master_data_items(status);

-- RLS for master_data_types
ALTER TABLE public.master_data_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage master data types"
  ON public.master_data_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auth read master data types"
  ON public.master_data_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Public read master data types"
  ON public.master_data_types FOR SELECT TO public
  USING (true);

-- RLS for master_data_items
ALTER TABLE public.master_data_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage master data items"
  ON public.master_data_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auth read master data items"
  ON public.master_data_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Public read master data items"
  ON public.master_data_items FOR SELECT TO public
  USING (true);

-- Seed some common master data types
INSERT INTO public.master_data_types (name, code, description, sort_order) VALUES
  ('Country', 'COUNTRY', 'List of countries', 1),
  ('State', 'STATE', 'States/provinces (parent: Country)', 2),
  ('City', 'CITY', 'Cities (parent: State)', 3),
  ('Document Type', 'DOC_TYPE', 'Types of documents for upload', 4),
  ('Currency', 'CURRENCY', 'Currency codes', 5),
  ('Business Type', 'BIZ_TYPE', 'Types of business entities', 6);
