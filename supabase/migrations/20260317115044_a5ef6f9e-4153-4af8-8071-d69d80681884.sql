
ALTER TABLE public.complaints ADD COLUMN email text;

-- Backfill existing complaints with email from profiles
UPDATE public.complaints c
SET email = p.email
FROM public.profiles p
WHERE c.complainant_id = p.id AND c.email IS NULL;
