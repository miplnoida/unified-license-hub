ALTER TABLE public.entity_resolution_cases DROP CONSTRAINT IF EXISTS erc_status_chk;
ALTER TABLE public.entity_resolution_cases ADD CONSTRAINT erc_status_chk
  CHECK (status = ANY (ARRAY['OPEN','PENDING_REVIEW','EVIDENCE_REQUESTED','ESCALATED','RESOLVED','CLOSED']));