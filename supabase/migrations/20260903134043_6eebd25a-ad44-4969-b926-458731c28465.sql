-- Restore caller-based security on the conduct_interventions view.
-- The preceding column-alignment replace dropped the security_invoker option,
-- which every sibling conduct_* view carries. Without it the view would read
-- with the owner's privileges and bypass row level security.
ALTER VIEW public.conduct_interventions SET (security_invoker = true);
