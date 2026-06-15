DROP POLICY IF EXISTS "Admins read action notifications" ON public.approval_action_notifications;
DROP POLICY IF EXISTS "Authenticated can read action notifications" ON public.approval_action_notifications;

CREATE POLICY "Authenticated can read action notifications"
ON public.approval_action_notifications
FOR SELECT
TO authenticated
USING (true);