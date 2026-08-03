ALTER TABLE public.correspondence_messages
  DROP CONSTRAINT IF EXISTS correspondence_messages_direction_chk;
ALTER TABLE public.correspondence_messages
  ADD CONSTRAINT correspondence_messages_direction_chk
  CHECK (direction IN ('inbound', 'outbound', 'internal'));