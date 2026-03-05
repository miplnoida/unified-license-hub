
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can delete forms" ON public.forms;
DROP POLICY IF EXISTS "Authenticated users can insert forms" ON public.forms;
DROP POLICY IF EXISTS "Authenticated users can read forms" ON public.forms;
DROP POLICY IF EXISTS "Authenticated users can update forms" ON public.forms;

-- Create permissive policies
CREATE POLICY "Anyone can read forms" ON public.forms FOR SELECT USING (true);
CREATE POLICY "Anyone can insert forms" ON public.forms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update forms" ON public.forms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete forms" ON public.forms FOR DELETE USING (true);
