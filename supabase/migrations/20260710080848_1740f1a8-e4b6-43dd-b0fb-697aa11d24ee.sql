ALTER TABLE public.conduct_investigations
  ADD CONSTRAINT conduct_investigations_licensee_id_fkey
  FOREIGN KEY (licensee_id) REFERENCES public.licensees(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';