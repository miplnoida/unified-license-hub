CREATE UNIQUE INDEX IF NOT EXISTS correspondence_thread_participants_thread_user_uidx
  ON public.correspondence_thread_participants (thread_id, user_id)
  WHERE user_id IS NOT NULL;