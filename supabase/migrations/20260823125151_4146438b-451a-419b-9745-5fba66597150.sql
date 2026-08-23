-- new_valid_until is a renewal DECISION output, not known when the renewal opens.
-- START_RENEWAL legitimately inserts an in_progress renewal without it.
ALTER TABLE public.license_renewals ALTER COLUMN new_valid_until DROP NOT NULL;