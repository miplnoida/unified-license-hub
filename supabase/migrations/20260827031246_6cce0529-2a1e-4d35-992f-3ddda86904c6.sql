-- MC-12 release hardening: notification/outbox worker surface is service-role only.
-- These operations claim, reap, kick, mint tokens for, or write delivery evidence
-- for the notification worker. No browser role may invoke them directly.
REVOKE EXECUTE ON FUNCTION public.claim_notification_outbox(integer, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reap_stuck_notification_outbox() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_worker_token(text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notification_worker_kick(text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notification_record_delivery(text, text, text, uuid, uuid, text, text, text, text, text, uuid, integer, text, jsonb, text, text, text, jsonb) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_acknowledgement_delivery_state(uuid, text, text, text, text, text, text, text) FROM authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_stuck_notification_outbox() TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_worker_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_worker_kick(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_record_delivery(text, text, text, uuid, uuid, text, text, text, text, text, uuid, integer, text, jsonb, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_acknowledgement_delivery_state(uuid, text, text, text, text, text, text, text) TO service_role;