
-- Create licensees entity table
CREATE TABLE IF NOT EXISTS public.licensees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sector_id uuid REFERENCES public.sectors(id),
  sub_sector_id uuid REFERENCES public.sub_sectors(id),
  category_id uuid REFERENCES public.categories(id),
  license_id uuid REFERENCES public.licenses(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.licensees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS licensee_id uuid REFERENCES public.licensees(id);

CREATE POLICY "Admins manage licensees" ON public.licensees
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Licensee users read own" ON public.licensees
  FOR SELECT TO authenticated
  USING (id IN (SELECT licensee_id FROM public.profiles WHERE id = auth.uid() AND licensee_id IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.pre_license_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  entity_name text DEFAULT '',
  sector_id uuid REFERENCES public.sectors(id),
  sub_sector_id uuid REFERENCES public.sub_sectors(id),
  category_id uuid REFERENCES public.categories(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pre_license_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pre-license users read own" ON public.pre_license_users
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Pre-license users update own" ON public.pre_license_users
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Insert own pre-license profile" ON public.pre_license_users
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins manage pre-license users" ON public.pre_license_users
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE user_count int; user_role text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'applicant');
  IF user_role = 'pre_licensee' THEN
    INSERT INTO public.pre_license_users (id, full_name, email, entity_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'entity_name', ''));
  ELSE
    INSERT INTO public.profiles (id, full_name, email, user_type, entity_name, role)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), COALESCE(NEW.email, ''),
      COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'primary'),
      COALESCE(NEW.raw_user_meta_data->>'entity_name', ''), user_role);
  END IF;
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, COALESCE(NULLIF(user_role, '')::app_role, 'applicant'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 WHEN 'supervisor' THEN 3
    WHEN 'licensing_officer' THEN 4 WHEN 'analyst' THEN 5 WHEN 'developer' THEN 6
    WHEN 'licensee_primary' THEN 7 WHEN 'licensee_secondary' THEN 8
    WHEN 'pre_licensee' THEN 9 WHEN 'applicant' THEN 10
  END LIMIT 1
$$;
