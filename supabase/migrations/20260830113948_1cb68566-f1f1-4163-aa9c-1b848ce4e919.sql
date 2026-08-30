ALTER TABLE public.entity_change_sets DROP CONSTRAINT IF EXISTS entity_change_sets_status_check;
ALTER TABLE public.entity_change_sets ADD CONSTRAINT entity_change_sets_status_check
  CHECK (status = ANY (ARRAY['DRAFT','SUBMITTED','UNDER_REVIEW','RECOMMENDED','APPROVED','REJECTED','APPLIED','WITHDRAWN','SUPERSEDED','CANCELLED']));