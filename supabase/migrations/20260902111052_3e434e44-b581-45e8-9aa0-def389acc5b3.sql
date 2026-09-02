-- The legacy document_action_logs CHECK constraint only allowed the original
-- upload/download verbs, so every governed DMS action (classify / verify /
-- accept / archive / restore / delete / link) failed when dms_log wrote its
-- audit entry. Widen the allowed verb set additively; nothing is weakened and
-- no existing verb is removed.
ALTER TABLE public.document_action_logs
  DROP CONSTRAINT IF EXISTS document_action_logs_action_check;

ALTER TABLE public.document_action_logs
  ADD CONSTRAINT document_action_logs_action_check
  CHECK (action IN (
    -- legacy versioning verbs (unchanged)
    'upload','new_version','replace','delete','restore','download','make_current',
    -- historical value already present in the audit history
    'version_created',
    -- governed DMS lifecycle verbs
    'document_registered','version_added','metadata_updated','classified',
    'context_applied','record_linked','archived','restored','soft_deleted',
    'verification_verified','verification_rejected','verification_pending',
    'acceptance_accepted','acceptance_conditionally_accepted',
    'acceptance_rejected','acceptance_pending'
  ));