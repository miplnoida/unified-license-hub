-- Backfill effective_from for already-published form versions so the
-- "current" version starts from its publish date and remains open-ended.
-- effective_until is left untouched (null = open-ended).
UPDATE public.form_versions
SET effective_from = COALESCE(published_at, created_at)
WHERE status = 'published'
  AND effective_from IS NULL;