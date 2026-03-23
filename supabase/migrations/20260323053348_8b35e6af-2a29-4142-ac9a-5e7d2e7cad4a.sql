
-- PRIORITY 1: Lock down config tables with proper RLS
-- Drop all public "Anyone can *" policies on forms, categories, sub_sectors, services

-- === FORMS ===
DROP POLICY IF EXISTS "Anyone can delete forms" ON public.forms;
DROP POLICY IF EXISTS "Anyone can insert forms" ON public.forms;
DROP POLICY IF EXISTS "Anyone can update forms" ON public.forms;
DROP POLICY IF EXISTS "Anyone can read forms" ON public.forms;

CREATE POLICY "Admins manage forms" ON public.forms
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read forms" ON public.forms
  FOR SELECT TO authenticated USING (true);

-- === CATEGORIES ===
DROP POLICY IF EXISTS "Anyone can delete categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can update categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can read categories" ON public.categories;

CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

-- === SUB_SECTORS ===
DROP POLICY IF EXISTS "Anyone can delete sub_sectors" ON public.sub_sectors;
DROP POLICY IF EXISTS "Anyone can insert sub_sectors" ON public.sub_sectors;
DROP POLICY IF EXISTS "Anyone can update sub_sectors" ON public.sub_sectors;
DROP POLICY IF EXISTS "Anyone can read sub_sectors" ON public.sub_sectors;

CREATE POLICY "Admins manage sub_sectors" ON public.sub_sectors
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read sub_sectors" ON public.sub_sectors
  FOR SELECT TO authenticated USING (true);

-- === SERVICES ===
DROP POLICY IF EXISTS "Anyone can delete services" ON public.services;
DROP POLICY IF EXISTS "Anyone can insert services" ON public.services;
DROP POLICY IF EXISTS "Anyone can update services" ON public.services;
DROP POLICY IF EXISTS "Anyone can read services" ON public.services;

CREATE POLICY "Admins manage services" ON public.services
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read services" ON public.services
  FOR SELECT TO authenticated USING (true);

-- PRIORITY 4: Tighten application update RLS
-- Current policy allows applicants to update only drafts, which is good.
-- But we need to ensure the submission status transition is also allowed
-- (applicant changes status from 'draft' to 'submitted').
-- The existing policy already covers this since the check is on old status = 'draft'.
-- No changes needed here.

-- Fix: Prevent applicants from updating payment status directly
-- Payments update policy already restricts to admin only. Good.
