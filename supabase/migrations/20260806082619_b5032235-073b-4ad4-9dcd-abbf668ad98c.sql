CREATE TABLE public.conduct_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX conduct_saved_views_owner_name_key ON public.conduct_saved_views (owner_id, lower(name));
CREATE UNIQUE INDEX conduct_saved_views_one_default ON public.conduct_saved_views (owner_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_saved_views TO authenticated;
GRANT ALL ON public.conduct_saved_views TO service_role;

ALTER TABLE public.conduct_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own conduct saved views"
  ON public.conduct_saved_views FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_shared OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners insert own conduct saved views"
  ON public.conduct_saved_views FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners update own conduct saved views"
  ON public.conduct_saved_views FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners delete own conduct saved views"
  ON public.conduct_saved_views FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_conduct_saved_views_updated_at
  BEFORE UPDATE ON public.conduct_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();