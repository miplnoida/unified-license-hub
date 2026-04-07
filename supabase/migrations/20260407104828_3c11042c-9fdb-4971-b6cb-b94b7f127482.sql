
-- Drop the overly restrictive ALL policy and replace with granular ones
DROP POLICY IF EXISTS "Admins manage workflow instances" ON public.workflow_instances;

-- Admins can do everything
CREATE POLICY "Admins full access workflow instances"
ON public.workflow_instances
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'licensing_officer')
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'licensing_officer')
);

-- Any authenticated user can INSERT (needed for workflow auto-start on submission)
CREATE POLICY "Authenticated users can create workflow instances"
ON public.workflow_instances
FOR INSERT
TO authenticated
WITH CHECK (true);
