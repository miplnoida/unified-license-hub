-- P12 closure: delivery evidence is governed, never browser-writable.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.correspondence_dispatches FROM authenticated;
REVOKE ALL ON public.correspondence_dispatches FROM anon;
GRANT SELECT ON public.correspondence_dispatches TO authenticated;
GRANT ALL ON public.correspondence_dispatches TO service_role;

DROP POLICY IF EXISTS "Staff manage dispatches" ON public.correspondence_dispatches;
CREATE POLICY "Staff read dispatches" ON public.correspondence_dispatches
FOR SELECT TO authenticated
USING (public.is_internal_staff(auth.uid()));