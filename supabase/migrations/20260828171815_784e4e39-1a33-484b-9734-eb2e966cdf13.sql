-- F4-B4: worker-state lockdown for the notification outbox.
-- Browser roles must not be able to claim or mutate outbox state; the claim /
-- reap routines are SECURITY DEFINER and therefore bypass RLS, so EXECUTE must
-- not be reachable from anon/authenticated/PUBLIC.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.notification_outbox FROM anon, authenticated;
REVOKE SELECT ON TABLE public.notification_outbox FROM anon;
GRANT SELECT ON TABLE public.notification_outbox TO authenticated; -- admin read policy
GRANT ALL ON TABLE public.notification_outbox TO service_role;

REVOKE ALL ON FUNCTION public.claim_notification_outbox(integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reap_stuck_notification_outbox()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reap_stuck_notification_outbox() TO service_role;