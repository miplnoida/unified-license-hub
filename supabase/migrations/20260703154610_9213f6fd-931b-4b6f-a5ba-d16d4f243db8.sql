
CREATE TABLE IF NOT EXISTS public.licensee_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.conduct_products(id) ON DELETE CASCADE,
  active_from date,
  active_to date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (licensee_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licensee_products TO authenticated;
GRANT ALL ON public.licensee_products TO service_role;

ALTER TABLE public.licensee_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Regulator staff manage licensee products"
  ON public.licensee_products FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
  );

CREATE POLICY "Licensee users read own product mapping"
  ON public.licensee_products FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entity_user_access eua
      WHERE eua.entity_id = licensee_products.licensee_id
        AND eua.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.licensee_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.conduct_channels(id) ON DELETE CASCADE,
  active_from date,
  active_to date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (licensee_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licensee_channels TO authenticated;
GRANT ALL ON public.licensee_channels TO service_role;

ALTER TABLE public.licensee_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Regulator staff manage licensee channels"
  ON public.licensee_channels FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
  );

CREATE POLICY "Licensee users read own channel mapping"
  ON public.licensee_channels FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entity_user_access eua
      WHERE eua.entity_id = licensee_channels.licensee_id
        AND eua.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.touch_licensee_dim_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licensee_products_touch ON public.licensee_products;
CREATE TRIGGER trg_licensee_products_touch
  BEFORE UPDATE ON public.licensee_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_licensee_dim_updated_at();

DROP TRIGGER IF EXISTS trg_licensee_channels_touch ON public.licensee_channels;
CREATE TRIGGER trg_licensee_channels_touch
  BEFORE UPDATE ON public.licensee_channels
  FOR EACH ROW EXECUTE FUNCTION public.touch_licensee_dim_updated_at();

CREATE INDEX IF NOT EXISTS idx_licensee_products_licensee ON public.licensee_products(licensee_id);
CREATE INDEX IF NOT EXISTS idx_licensee_channels_licensee ON public.licensee_channels(licensee_id);
