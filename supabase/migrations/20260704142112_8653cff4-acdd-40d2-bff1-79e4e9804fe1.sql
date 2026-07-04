
ALTER TABLE public.licensees
  ADD COLUMN IF NOT EXISTS applicant_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_licensees_applicant_id
  ON public.licensees(applicant_id);

UPDATE public.licensees l
   SET applicant_id = lic.holder_id
  FROM public.licenses lic
 WHERE l.license_id = lic.id
   AND l.applicant_id IS NULL
   AND lic.holder_id IS NOT NULL;
