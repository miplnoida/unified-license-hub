-- Create user_dynamic_roles join table for many-to-many user → dynamic role mapping
CREATE TABLE IF NOT EXISTS public.user_dynamic_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_dynamic_roles_user_id ON public.user_dynamic_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dynamic_roles_role_id ON public.user_dynamic_roles(role_id);

ALTER TABLE public.user_dynamic_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own role assignments
CREATE POLICY "Users view own dynamic roles"
  ON public.user_dynamic_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert
CREATE POLICY "Admins insert dynamic roles"
  ON public.user_dynamic_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete
CREATE POLICY "Admins delete dynamic roles"
  ON public.user_dynamic_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Backfill from existing profiles.role_id assignments
INSERT INTO public.user_dynamic_roles (user_id, role_id)
SELECT id, role_id FROM public.profiles
WHERE role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;
