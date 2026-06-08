DROP POLICY IF EXISTS "Manage return requests" ON public.return_requests;

CREATE POLICY "Admins manage return requests"
ON public.return_requests
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "Return owners can read requests"
ON public.return_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_requests.return_id
      AND r.created_by = auth.uid()
  )
);

CREATE POLICY "Return owners can resolve requests"
ON public.return_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_requests.return_id
      AND r.created_by = auth.uid()
  )
)
WITH CHECK (
  status = 'resolved'::public.return_request_status
  AND EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_requests.return_id
      AND r.created_by = auth.uid()
  )
);