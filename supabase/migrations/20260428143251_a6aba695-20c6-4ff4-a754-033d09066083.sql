CREATE POLICY "Users update own pending payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status IN ('completed', 'failed'));