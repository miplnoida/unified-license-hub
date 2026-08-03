DROP INDEX IF EXISTS public.correspondence_thread_participants_thread_user_uidx;
ALTER TABLE public.correspondence_thread_participants
  ADD CONSTRAINT correspondence_thread_participants_thread_user_key
  UNIQUE (thread_id, user_id);