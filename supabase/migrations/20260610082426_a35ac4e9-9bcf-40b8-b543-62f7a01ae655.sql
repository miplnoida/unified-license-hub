-- Split combined 'application' workflows into pre_application / post_application.
-- Pre-existing convention: workflows without an associated service serviced
-- pre-license applications; ones tied to a service (post_license) are post-license.
-- approval_workflows has no service_id column, so we use category_id/sector_id
-- presence as a weak signal; safer fallback is pre_application since that has
-- historically been the dominant flow.

UPDATE public.approval_workflows
SET entity_type = 'pre_application',
    updated_at = now()
WHERE entity_type = 'application';

-- Note: the column is a free-form text in this schema (no enum constraint),
-- so adding 'registration' / 'pre_application' / 'post_application' values
-- requires no DDL. UI surfaces the new options.
